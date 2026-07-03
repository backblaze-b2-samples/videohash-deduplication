<!-- last_verified: 2026-07-03 -->
# Feature: Perceptual Video Hashing

## Purpose
Compute a content-based perceptual hash for each video so that re-encodes,
resolution changes, watermarks, and minor edits of the same source produce
nearly identical hashes — the basis for near-duplicate detection.

## Used By
- Backend only (invoked by dedup runs): `app/service/dedup.py`
- Indirectly via `POST /runs`

## Core Functions
- `services/api/app/service/dedup.py`
  - `hash_video(path)` → `(hash_hex, hash_bits)` — the ONLY place `videohash` is imported
  - `hamming_distance(hex_a, hex_b)` → int — bitwise distance between two hashes
  - `cluster_by_distance(items, threshold)` → connected-components clustering

## Canonical Files
- Hashing + clustering exemplar: `services/api/app/service/dedup.py`

## Inputs
- path: str — a local temp file downloaded from B2

## Outputs
- `hash_hex` (e.g. `0x9800cccd88dcdc00`) and `hash_bits` — persisted in the index

## Deployment
- `deployment: local`. **Pure CPU** — perceptual hashing + ffmpeg frame
  extraction only, no torch/CUDA/MPS, so no accelerator autodetect is needed.
- **No external API provider, no API key.** A full demo run costs **$0** beyond B2 storage.

## Implementation notes — videohash traps (important)
`videohash==3.0.1` (2022) imports fine but its hashing feature crashes at
runtime unless two things are handled *before* `import videohash` (see the
module docstring in `dedup.py`):
1. **Pillow `ANTIALIAS`** was removed in Pillow ≥ 10; videohash's collage maker
   still uses it. We install `Image.ANTIALIAS = Image.Resampling.LANCZOS` before importing.
2. **ffmpeg on PATH** — `VideoHash` has no `ffmpeg_path` argument and shells out
   to a bare `ffmpeg`. We symlink the `imageio-ffmpeg` bundled binary onto PATH
   as `ffmpeg`, so no system ffmpeg is required.
3. **storage_path** must end with a path separator — videohash treats a path
   without a trailing `/` as a file and raises `StoragePathDoesNotExist`.

## Flow
- A run downloads a video to a temp file, then calls `hash_video(path)`
- `VideoHash` samples frames → builds a collage → computes a wavelet hash
- The temp file and videohash scratch dir are cleaned up
- The hash is stored in `dedup/index/hash_index.json`

## Edge Cases
- Corrupt/unreadable video → the run surfaces a 500 (`RuntimeError` from the pipeline)
- Already-hashed video → skipped (incremental index)

## Verification
- Test files: `services/api/tests/test_dedup.py` (clustering + distance, no network)
- End-to-end proof: generate a base clip + re-encoded variants + a distinct
  control with the bundled ffmpeg, hash all, and confirm the variants cluster
  (≤8 bits from base) while the control stays separate (~13 bits).
- Quick verify command: `pnpm test:api`
- Pass criteria: variants cluster with the base at the Balanced threshold; the control is a singleton.

## Related Docs
- [Deduplication Runs](deduplication-runs.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
