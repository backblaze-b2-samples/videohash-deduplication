"""Dedup-run orchestration: hash the library, cluster, write reports to B2.

Pure orchestration over the `repo` layer (B2) and `service.dedup` (videohash).
No boto3 here — all storage access goes through `app.repo`.
"""

import contextlib
import logging
import os
from collections import defaultdict
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

from app.config import settings
from app.repo import (
    delete_file,
    download_to_tmp,
    get_json,
    get_presigned_url,
    list_prefix,
    put_json,
)
from app.service.dedup import cluster_by_distance, hash_video
from app.service.files import FileKeyError, FileNotFoundError, validate_key
from app.types import (
    Cluster,
    ClusterMember,
    DailyCount,
    DedupProgressEvent,
    DedupReport,
    DedupStats,
    LibraryVideo,
)
from app.types.formatting import humanize_bytes

logger = logging.getLogger(__name__)


def _is_video(content_type: str) -> bool:
    return content_type.startswith("video/")


def _library_videos(prefix: str):
    """Every video object under a prefix (non-video objects are ignored)."""
    return [f for f in list_prefix(prefix) if _is_video(f.content_type)]


def _new_index() -> dict:
    return {"version": 1, "updated_at": "", "entries": {}}


def _report_key(run_id: str) -> str:
    return f"{settings.reports_prefix}{run_id}.json"


def _validate_run_id(run_id: str) -> None:
    """A run_id is a timestamp slug — reject anything with a path separator."""
    validate_key(run_id)
    if "/" in run_id:
        raise FileKeyError("Invalid run id")


def _build_clusters(
    videos, index_entries: dict, threshold: int
) -> tuple[list[Cluster], int, int]:
    """Cluster the library's hashed videos and build the report cluster list.

    Returns (clusters, duplicate_video_count, total_reclaimable_bytes).
    Singletons are excluded — only groups of 2+ near-duplicates are reported.
    """
    size_by_key = {v.key: v.size_bytes for v in videos}
    items = [
        (v.key, index_entries[v.key]["hash_hex"])
        for v in videos
        if v.key in index_entries
    ]
    groups = cluster_by_distance(items, threshold)

    clusters: list[Cluster] = []
    duplicate_video_count = 0
    total_reclaimable = 0
    cluster_id = 0
    for group in sorted(groups, key=len, reverse=True):
        if len(group) < 2:
            continue
        cluster_id += 1
        # Keep-one-per-cluster heuristic: representative = largest file.
        rep = max(group, key=lambda k: size_by_key.get(k, 0))
        rep_hash = index_entries[rep]["hash_hex"]
        members = [
            ClusterMember(
                key=k,
                distance_to_rep=_hamming(rep_hash, index_entries[k]["hash_hex"]),
                size_bytes=size_by_key.get(k, 0),
            )
            for k in sorted(group, key=lambda k: size_by_key.get(k, 0), reverse=True)
        ]
        reclaimable = sum(size_by_key.get(k, 0) for k in group) - size_by_key.get(
            rep, 0
        )
        total_reclaimable += reclaimable
        duplicate_video_count += len(group)
        clusters.append(
            Cluster(
                cluster_id=cluster_id,
                representative=rep,
                members=members,
                reclaimable_bytes=reclaimable,
                reclaimable_human=humanize_bytes(reclaimable),
            )
        )
    return clusters, duplicate_video_count, total_reclaimable


def _hamming(hex_a: str, hex_b: str) -> int:
    return bin(int(hex_a, 16) ^ int(hex_b, 16)).count("1")


def run_dedup_events(threshold: int, prefix: str) -> Iterator[DedupProgressEvent]:
    """Execute one dedup run, yielding determinate progress as it goes.

    Same pipeline as :func:`run_dedup` (download → hash → index → cluster →
    report), but surfaces honest per-video progress so the UI can show a live
    "N of M" count: one ``stage="hashing"`` event per not-yet-hashed video
    (emitted BEFORE its blocking download+hash, ``hashed`` = videos already
    done, ``current`` = the filename in flight), one ``stage="clustering"``
    event, then a terminal ``stage="complete"`` event carrying the persisted
    report. No shared mutable state — every value is local to this generator.
    """
    validate_key(prefix)
    now = datetime.now(UTC)
    run_id = now.strftime("%Y-%m-%dT%H-%M-%SZ")

    videos = _library_videos(prefix)
    index = get_json(settings.index_key) or _new_index()
    entries: dict = index.setdefault("entries", {})

    pending = [v for v in videos if v.key not in entries]
    to_hash = len(pending)

    def _event(stage, hashed, current=None, report=None) -> DedupProgressEvent:
        return DedupProgressEvent(
            stage=stage,
            hashed=hashed,
            to_hash=to_hash,
            video_count=len(videos),
            current=current,
            report=report,
        )

    hashed_this_run = 0
    for v in pending:
        # Announce the file BEFORE the blocking download+hash so the UI shows
        # what's in flight; `hashed` counts videos already completed.
        yield _event("hashing", hashed_this_run, current=v.filename)
        tmp = download_to_tmp(v.key)
        try:
            hash_hex, hash_bits = hash_video(tmp)
        finally:
            with contextlib.suppress(OSError):
                os.unlink(tmp)
        entries[v.key] = {
            "hash_hex": hash_hex,
            "hash_bits": hash_bits,
            "size_bytes": v.size_bytes,
            "hashed_at": datetime.now(UTC).isoformat(),
        }
        hashed_this_run += 1

    yield _event("clustering", hashed_this_run)

    index["updated_at"] = datetime.now(UTC).isoformat()
    put_json(settings.index_key, index)

    clusters, dup_count, reclaimable = _build_clusters(videos, entries, threshold)

    report = DedupReport(
        run_id=run_id,
        run_date=now.date().isoformat(),
        created_at=now.isoformat(),
        threshold=threshold,
        prefix=prefix,
        video_count=len(videos),
        hashed_this_run=hashed_this_run,
        cluster_count=len(clusters),
        duplicate_video_count=dup_count,
        reclaimable_bytes=reclaimable,
        reclaimable_human=humanize_bytes(reclaimable),
        clusters=clusters,
    )
    put_json(_report_key(run_id), report.model_dump())
    logger.info(
        "Dedup run complete: run_id=%s videos=%d hashed=%d clusters=%d",
        run_id,
        len(videos),
        hashed_this_run,
        len(clusters),
    )
    yield _event("complete", hashed_this_run, report=report)


def run_dedup(threshold: int, prefix: str) -> DedupReport:
    """Run one dedup synchronously, returning the report (non-streaming callers).

    Thin wrapper over :func:`run_dedup_events` so both paths share one pipeline.
    """
    report: DedupReport | None = None
    for event in run_dedup_events(threshold, prefix):
        if event.report is not None:
            report = event.report
    if report is None:  # pragma: no cover — the generator always yields a report
        raise RuntimeError("Dedup run produced no report")
    return report


def list_runs() -> list[DedupReport]:
    """Every cluster report in B2, newest run first."""
    reports: list[DedupReport] = []
    for obj in list_prefix(settings.reports_prefix):
        if not obj.key.endswith(".json"):
            continue
        data = get_json(obj.key)
        if data:
            reports.append(DedupReport(**data))
    reports.sort(key=lambda r: r.run_id, reverse=True)
    return reports


def get_run(run_id: str) -> DedupReport:
    _validate_run_id(run_id)
    data = get_json(_report_key(run_id))
    if not data:
        raise FileNotFoundError("Run report not found")
    return DedupReport(**data)


def delete_run(run_id: str) -> None:
    _validate_run_id(run_id)
    delete_file(_report_key(run_id))


def list_videos(prefix: str | None = None) -> list[LibraryVideo]:
    """Library videos joined with their hash-index status, with inline URLs."""
    prefix = prefix or settings.library_prefix
    validate_key(prefix)
    index = get_json(settings.index_key) or _new_index()
    entries: dict = index.get("entries", {})
    out: list[LibraryVideo] = []
    for v in _library_videos(prefix):
        entry = entries.get(v.key)
        out.append(
            LibraryVideo(
                key=v.key,
                filename=v.filename,
                size_bytes=v.size_bytes,
                size_human=v.size_human,
                content_type=v.content_type,
                uploaded_at=v.uploaded_at,
                hashed=entry is not None,
                hash_hex=entry["hash_hex"] if entry else None,
                url=get_presigned_url(v.key, disposition="inline"),
            )
        )
    return out


def get_dedup_stats() -> DedupStats:
    videos = _library_videos(settings.library_prefix)
    total_size = sum(v.size_bytes for v in videos)
    runs = list_runs()
    latest = runs[0] if runs else None
    return DedupStats(
        library_video_count=len(videos),
        library_size_bytes=total_size,
        library_size_human=humanize_bytes(total_size),
        run_count=len(runs),
        latest_cluster_count=latest.cluster_count if latest else 0,
        latest_reclaimable_bytes=latest.reclaimable_bytes if latest else 0,
        latest_reclaimable_human=latest.reclaimable_human if latest else "0.0 B",
    )


def get_hash_activity(days: int = 7) -> list[DailyCount]:
    """Videos hashed per day over the last N days (from the index timestamps)."""
    index = get_json(settings.index_key) or _new_index()
    counts: dict[str, int] = defaultdict(int)
    for entry in index.get("entries", {}).values():
        hashed_at = entry.get("hashed_at", "")
        if hashed_at:
            counts[hashed_at[:10]] += 1

    today = datetime.now(UTC).date()
    cutoff = today - timedelta(days=days - 1)
    return [
        DailyCount(
            date=(cutoff + timedelta(days=i)).isoformat(),
            count=counts.get((cutoff + timedelta(days=i)).isoformat(), 0),
        )
        for i in range(days)
    ]
