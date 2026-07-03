"""Unit tests for the perceptual-hash clustering logic (no network, no ffmpeg)."""

import itertools
from datetime import UTC, datetime

import pytest

from app.service import runs as runs_service
from app.service.dedup import cluster_by_distance, hamming_distance
from app.types import FileMetadata


def test_hamming_distance_counts_differing_bits():
    assert hamming_distance("0x00", "0x00") == 0
    assert hamming_distance("0x0f", "0x00") == 4
    assert hamming_distance("0xff", "0x00") == 8
    # Order-independent
    assert hamming_distance("0x01", "0x03") == hamming_distance("0x03", "0x01")


def test_clusters_group_near_duplicates():
    # base and a near-dup differ by 2 bits; the control differs by many.
    items = [
        ("library/base.mp4", "0x00ff"),
        ("library/base_reenc.mp4", "0x03ff"),  # 2 bits from base
        ("library/control.mp4", "0xff00"),  # far from base
    ]
    groups = cluster_by_distance(items, threshold=8)
    # Find the group that contains base.mp4
    base_group = next(g for g in groups if "library/base.mp4" in g)
    assert set(base_group) == {"library/base.mp4", "library/base_reenc.mp4"}
    # control is its own singleton
    control_group = next(g for g in groups if "library/control.mp4" in g)
    assert control_group == ["library/control.mp4"]


def test_strict_threshold_splits_variants():
    items = [
        ("a", "0x00ff"),
        ("b", "0x03ff"),  # 2 bits away
    ]
    # A 1-bit threshold is too strict to link them.
    groups = cluster_by_distance(items, threshold=1)
    assert sorted(len(g) for g in groups) == [1, 1]


def test_transitive_clustering_via_union_find():
    # a~b (2 bits) and b~c (2 bits) but a~c (4 bits) — all one component at t>=4.
    items = [
        ("a", "0x0000"),
        ("b", "0x0003"),
        ("c", "0x000f"),
    ]
    groups = cluster_by_distance(items, threshold=4)
    assert len(groups) == 1
    assert set(groups[0]) == {"a", "b", "c"}


# --- Run pipeline: determinate progress streaming (no network, no ffmpeg) ---


def _video(name: str) -> FileMetadata:
    return FileMetadata(
        key=f"library/{name}",
        filename=name,
        folder="library/",
        size_bytes=1000,
        size_human="1.0 KB",
        content_type="video/mp4",
        uploaded_at=datetime.now(UTC),
        url=None,
    )


def _patch_pipeline(monkeypatch, videos, index):
    """Stub the repo + hasher so run_dedup_events runs without B2 or ffmpeg."""
    monkeypatch.setattr(runs_service, "list_prefix", lambda prefix: videos)
    monkeypatch.setattr(runs_service, "get_json", lambda key: index)
    monkeypatch.setattr(runs_service, "put_json", lambda key, obj: None)
    monkeypatch.setattr(
        runs_service, "download_to_tmp", lambda key: "/tmp/does-not-exist.mp4"
    )
    # Distinct single-bit hashes far enough apart that nothing clusters.
    counter = itertools.count()
    monkeypatch.setattr(
        runs_service,
        "hash_video",
        lambda path: (f"0x{1 << (next(counter) * 4):x}", "bits"),
    )


def test_run_dedup_events_emits_per_video_progress(monkeypatch):
    videos = [_video("a.mp4"), _video("b.mp4"), _video("c.mp4")]
    _patch_pipeline(monkeypatch, videos, index=None)  # fresh, empty index

    events = list(runs_service.run_dedup_events(threshold=8, prefix="library/"))

    hashing = [e for e in events if e.stage == "hashing"]
    # One hashing event per video, announced before its blocking hash.
    assert [e.current for e in hashing] == ["a.mp4", "b.mp4", "c.mp4"]
    # `hashed` counts videos already completed; `to_hash` is stable.
    assert [e.hashed for e in hashing] == [0, 1, 2]
    assert all(e.to_hash == 3 for e in hashing)
    assert all(e.video_count == 3 for e in hashing)

    # Exactly one clustering event, then a terminal complete event with report.
    assert [e.stage for e in events].count("clustering") == 1
    final = events[-1]
    assert final.stage == "complete"
    assert final.report is not None
    assert final.report.video_count == 3
    assert final.report.hashed_this_run == 3


def test_run_dedup_events_warm_index_skips_hashing(monkeypatch):
    videos = [_video("a.mp4"), _video("b.mp4")]
    index = {
        "version": 1,
        "updated_at": "",
        "entries": {
            v.key: {
                "hash_hex": "0x00",
                "hash_bits": "b",
                "size_bytes": v.size_bytes,
                "hashed_at": "2026-01-01T00:00:00+00:00",
            }
            for v in videos
        },
    }
    _patch_pipeline(monkeypatch, videos, index=index)

    events = list(runs_service.run_dedup_events(threshold=8, prefix="library/"))

    assert [e for e in events if e.stage == "hashing"] == []
    assert events[0].stage == "clustering"
    assert events[-1].stage == "complete"
    assert events[-1].report is not None
    assert events[-1].report.hashed_this_run == 0


def test_run_dedup_returns_final_report(monkeypatch):
    videos = [_video("a.mp4"), _video("b.mp4")]
    _patch_pipeline(monkeypatch, videos, index=None)

    report = runs_service.run_dedup(threshold=8, prefix="library/")

    assert report.video_count == 2
    assert report.hashed_this_run == 2


@pytest.mark.asyncio
async def test_runs_stream_endpoint_streams_sse(client, monkeypatch):
    videos = [_video("a.mp4"), _video("b.mp4")]
    _patch_pipeline(monkeypatch, videos, index=None)

    response = await client.post(
        "/runs/stream", json={"threshold": 8, "prefix": "library/"}
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")

    body = response.text
    assert "data:" in body
    assert '"stage":"hashing"' in body
    assert '"stage":"complete"' in body
