<!-- last_verified: 2026-07-03 -->
# Video Dedup — perceptual near-duplicate detection on Backblaze B2

Find **near-duplicate videos** in a [Backblaze B2](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-videohash-dedup) library — re-encodes, resolution changes, watermarks, and minor edits — using the open-source [`videohash`](https://github.com/akamhy/videohash) perceptual hasher. Point a *dedup run* at a folder of videos; the app downloads each one from B2, computes a frame-sampling perceptual hash, keeps a persistent hash **index** in B2, clusters near-duplicates by Hamming distance, and writes a **cluster report** back to B2 so ops teams can reclaim storage and enforce content policy.

Runs entirely on local, open-source compute. **No second API key — Backblaze B2 credentials only.** A full demo run costs **$0** beyond B2 storage.

**What people search for that this solves:** video deduplication, perceptual video hashing, find duplicate videos, detect re-encoded / re-uploaded videos, near-duplicate video detection, content-based video fingerprinting, reclaim storage from duplicate media.

## How it works — Ingest → Hash → Compare → Store → Serve

1. **Ingest.** Upload videos to the `library/` prefix in B2 (the Ingest page), or seed demo clips with `scripts/seed_library.py`.
2. **Hash.** A dedup run downloads each not-yet-hashed video and computes a perceptual hash with `videohash` (frame sampling → collage → wavelet hash). Robust to re-encodes, scaling, and minor edits.
3. **Compare.** Videos are clustered by pairwise **Hamming distance ≤ threshold** using union-find (connected components).
4. **Store.** The incremental hash index (`dedup/index/hash_index.json`) and every run report (`dedup/reports/<run_id>.json`) are written to B2. Re-runs only hash new videos.
5. **Serve.** Browse the library with per-video hash status, read cluster reports with inline `<video>` previews, and see reclaimable-storage estimates.

**B2 is the storage layer for all three artifacts** — the source library, the persistent hash index, and every run report — accessed over the S3-compatible API with a custom user agent and the standard `B2_*` env vars.

> **ffmpeg is bundled.** `videohash` shells out to `ffmpeg` for frame extraction. This app ships [`imageio-ffmpeg`](https://pypi.org/project/imageio-ffmpeg/) and puts its static binary on `PATH` automatically — **no system ffmpeg install required** on a fresh clone.

## Quick Start

You need: Node.js >= 20, pnpm >= 9, Python >= 3.11, and a free **[Backblaze B2 account](https://www.backblaze.com/sign-up/ai-cloud-storage?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-videohash-dedup)**.

```bash
# 1. Install frontend deps
pnpm install

# 2. Set up the backend (installs videohash + bundled ffmpeg)
cd services/api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cd ../..

# 3. Add your B2 credentials
cp .env.example .env   # then edit .env — see the table below

# 4. (optional) Seed demo videos into library/
services/api/.venv/bin/python scripts/seed_library.py

# 5. Run it
pnpm dev
```

Frontend at `localhost:3000`, API at `localhost:8000`. Open **Dedup Runs → New dedup run** to cluster the near-duplicates.

`pnpm dev` runs `pnpm doctor` first — a preflight check for the common setup gotchas (wrong Node/Python version, missing venv, missing or placeholder `.env`, ports in use).

### Environment variables

Copy `.env.example` to `.env` and fill in these values from the [B2 dashboard](https://secure.backblaze.com/b2_buckets.htm?utm_source=github&utm_medium=referral&utm_campaign=ai_artifacts&utm_content=b2ai-videohash-dedup):

| Variable | Required | What it is |
|---|---|---|
| `B2_APPLICATION_KEY_ID` | yes | Application **keyID** (Read and Write) |
| `B2_APPLICATION_KEY` | yes | Application key secret (shown once) |
| `B2_BUCKET_NAME` | yes | Bucket unique name |
| `B2_REGION` | yes | Region slug, e.g. `us-west-004`. The S3 endpoint is derived from it (`https://s3.<region>.backblazeb2.com`) — no hardcoded host. |
| `B2_PUBLIC_URL_BASE` | no | Public/CDN base URL for public objects. Leave blank for private buckets (the app uses presigned URLs). |

## Core Features

- [Perceptual Video Hashing](docs/features/perceptual-hashing.md) — frame-sampling perceptual hash per video via `videohash`. Pure CPU, no API key, robust to re-encodes/resize/watermarks.
- [Deduplication Runs](docs/features/deduplication-runs.md) — the primary entity: run, read, and delete point-in-time cluster reports stored in B2.
- [Ingest](docs/features/ingest.md) — drag-and-drop videos into the `library/` prefix.
- [File Browser](docs/features/file-browser.md) — the full-bucket explorer plus the `library/`-scoped Library explorer with hash status.
- [Dashboard](docs/features/dashboard.md) — library size, run count, latest-run clusters and reclaimable storage, videos-hashed-per-day.
- [Design System](docs/design-system.md) — tokens, primitives, the blaze generating loader, and inline `ErrorState` / `EmptyState` patterns. Live preview at `/design`.

## Data contracts

`dedup/index/hash_index.json` — incremental perceptual-hash index keyed by object key:

```json
{ "version": 1, "updated_at": "<ISO>",
  "entries": { "library/base.mp4": { "hash_hex": "0x...", "hash_bits": "0b...", "size_bytes": 12345, "hashed_at": "<ISO>" } } }
```

`dedup/reports/<run_id>.json` — an immutable cluster report. "Reclaimable" = sum of a cluster's member sizes minus the largest (keep one per cluster). Singletons are excluded.

## Scaling notes

The run endpoint is **synchronous** — fine at demo scale (a few short clips; the index skips already-hashed videos). For 100K+ libraries, move hashing to a background job/queue and replace the O(n²) pairwise compare with an LSH or BK-tree index over the hashes.

## Tech Stack

- TypeScript, Next.js 16, React 19, Tailwind v4, shadcn/ui, Recharts
- TanStack Query — caching, dedup, retry for every fetch
- Python 3.11+, FastAPI, boto3, Pydantic v2, `videohash`, `imageio-ffmpeg`, Pillow
- Backblaze B2 (S3-compatible object storage)
- pnpm workspaces (monorepo)

## Commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start frontend + backend |
| `pnpm build` | Build frontend (type check) |
| `pnpm lint` | Lint frontend |
| `pnpm lint:api` | Lint backend (ruff) |
| `pnpm test:api` | Run backend tests |
| `pnpm check:structure` | Verify layering rules |
| `services/api/.venv/bin/python scripts/seed_library.py` | Seed demo videos into `library/` |

## Documentation Map

| Doc | Purpose |
|-----|---------|
| [AGENTS.md](AGENTS.md) | Agent table of contents — start here |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System layout, layering, data flows |
| [docs/features/](docs/features/) | Feature docs |
| [docs/app-workflows.md](docs/app-workflows.md) | User journeys |
| [docs/dev-workflows.md](docs/dev-workflows.md) | Engineering workflows and testing |
| [docs/SECURITY.md](docs/SECURITY.md) | Security principles |
| [docs/RELIABILITY.md](docs/RELIABILITY.md) | Reliability expectations |

## License

MIT License - see [LICENSE](LICENSE) for details.
