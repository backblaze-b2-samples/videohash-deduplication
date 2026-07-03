"""Perceptual video hashing + near-duplicate clustering.

This module is the ONLY place `videohash` is imported. `videohash==3.0.1` is a
2022 library that imports cleanly but whose hashing feature crashes at runtime
unless two traps are handled *before* the import graph runs:

  1. Pillow removed ``Image.ANTIALIAS`` in v10; videohash's collage maker still
     references it. We install a compat alias BEFORE importing videohash.
  2. videohash shells out to a bare ``ffmpeg`` on PATH (its constructor has no
     ``ffmpeg_path`` argument). We put imageio-ffmpeg's bundled static binary on
     PATH under the name ``ffmpeg`` so a clean install needs no system ffmpeg.

Pure CPU: perceptual hashing + ffmpeg frame extraction only — no torch/CUDA/MPS,
so no accelerator autodetect is needed.
"""

from __future__ import annotations

import logging
import os
import shutil
import tempfile

logger = logging.getLogger(__name__)

# --- Trap 2: put a bundled ffmpeg on PATH as "ffmpeg" (runs at import time) ---


def _ensure_ffmpeg_on_path() -> None:
    import imageio_ffmpeg

    exe = imageio_ffmpeg.get_ffmpeg_exe()
    bin_dir = os.path.join(tempfile.gettempdir(), "videohash_dedup_bin")
    os.makedirs(bin_dir, exist_ok=True)
    link = os.path.join(bin_dir, "ffmpeg")
    if not os.path.exists(link):
        try:
            os.symlink(exe, link)
        except (OSError, NotImplementedError):
            # Filesystems without symlink support: copy the binary instead.
            shutil.copy2(exe, link)
            os.chmod(link, 0o755)
    if bin_dir not in os.environ.get("PATH", "").split(os.pathsep):
        os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")


_ensure_ffmpeg_on_path()

# --- Trap 1: restore Image.ANTIALIAS BEFORE importing videohash ---
from PIL import Image  # noqa: E402

if not hasattr(Image, "ANTIALIAS"):
    Image.ANTIALIAS = Image.Resampling.LANCZOS  # type: ignore[attr-defined]

import videohash  # noqa: E402


def hash_video(path: str) -> tuple[str, str]:
    """Compute a perceptual hash for a local video file.

    Returns ``(hash_hex, hash_bits)``. Frame-sampling → collage → wavelet hash,
    robust to re-encodes / resolution changes / minor edits. Cleans up the
    scratch directory videohash writes frames and the collage into.
    """
    storage = tempfile.mkdtemp(prefix="videohash_dedup_")
    vh = None
    try:
        # videohash treats a storage_path WITHOUT a trailing separator as a
        # file (its does_path_exists helper), so it must end with os.sep.
        vh = videohash.VideoHash(path=path, storage_path=storage + os.sep)
        return str(vh.hash_hex), str(vh.hash)
    finally:
        try:
            if vh is not None and hasattr(vh, "delete_storage_path"):
                vh.delete_storage_path()
        except Exception:  # cleanup is best-effort
            logger.warning("videohash storage cleanup failed", exc_info=True)
        shutil.rmtree(storage, ignore_errors=True)


def hamming_distance(hex_a: str, hex_b: str) -> int:
    """Bitwise Hamming distance between two videohash hex hashes."""
    return bin(int(hex_a, 16) ^ int(hex_b, 16)).count("1")


def cluster_by_distance(
    items: list[tuple[str, str]], threshold: int
) -> list[list[str]]:
    """Union-find clustering by pairwise Hamming distance.

    ``items`` is a list of ``(key, hash_hex)``. Two videos are linked when their
    hashes differ by ``<= threshold`` bits; connected components become clusters.
    Returns groups (lists of keys), including singletons — the caller drops those.
    """
    keys = [k for k, _ in items]
    parent = {k: k for k in keys}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if hamming_distance(items[i][1], items[j][1]) <= threshold:
                union(items[i][0], items[j][0])

    groups: dict[str, list[str]] = {}
    for k in keys:
        groups.setdefault(find(k), []).append(k)
    return list(groups.values())
