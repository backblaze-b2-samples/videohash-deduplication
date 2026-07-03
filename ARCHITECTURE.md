<!-- last_verified: 2026-07-03 -->
# Architecture

## Components

- **apps/web/** — Next.js 16 frontend (App Router, Tailwind v4, shadcn/ui)
  - Dashboard with library/run stats, videos-hashed-per-day chart, recent runs
  - Dedup Runs: list + "New dedup run" dialog + cluster-report detail
  - Library explorer (`library/` prefix, with per-video hash status) + full-bucket file browser
  - Ingest (drag-and-drop videos into `library/`)
  - Dark mode via `next-themes`
- **services/api/** — FastAPI backend (layered architecture)
  - Dedup pipeline: perceptual hashing (`videohash`) + Hamming-distance clustering
  - Incremental hash index + cluster reports stored in B2
  - B2 S3 integration via boto3 (list, download, get/put JSON, presign, delete)
  - Health check endpoint with B2 connectivity verification
  - Structured JSON logging with request tracing; Prometheus-format metrics
- **packages/shared/** — TypeScript type definitions mirroring the Pydantic models

## Backend Layering

The API follows a strict layered architecture:

```
types/     Pydantic models — no logic, no imports from other layers
  |
config/    Settings (pydantic-settings) — depends only on types
  |
repo/      Data access (boto3 B2 client) — no business logic
  |
service/   Business logic — calls repo, returns types
  |
runtime/   FastAPI routes — calls service, never repo directly
```

### Layering Rules

1. Dependencies flow downward only: `types` -> `config` -> `repo` -> `service` -> `runtime`
2. No backward imports (e.g., service must not import from runtime)
3. `boto3` only allowed in `repo/` layer
4. `videohash` is contained to `service/dedup.py`
5. All boundary data uses Pydantic models (no raw dicts across layers)
6. Each file stays under 300 lines

### Directory Structure

```
services/api/
  main.py                  App entrypoint, middleware, router registration
  app/
    types/                 Pydantic models (FileMetadata, DedupReport, LibraryVideo, ...)
    config/                Settings loaded from environment
    repo/                  B2 S3 client (data access layer)
    service/               Business logic (dedup, runs, files, upload, metadata)
    runtime/               FastAPI route handlers (runs, files, upload, health, metrics)
  tests/                   pytest tests (structural + unit)
scripts/
  seed_library.py          Generate demo clips with bundled ffmpeg, upload to library/
```

## Boundary Invariants

- **No external SDK leakage**: `boto3` only in `app/repo/`; `videohash` only in `app/service/dedup.py`.
- **No raw dicts at boundaries**: typed Pydantic models across layers.
- **No mutable globals**: configuration is read-only after init.
- **Validated inputs**: HTTP inputs validated by FastAPI/Pydantic; object keys and run ids validated against path traversal.

## Deployment

- **Local dev** — `pnpm dev` runs both services via `concurrently` (web `:3000`, API `:8000`)
- **Railway** — two services from the same repo; see `infra/railway/README.md`

## Data Stores

- **Backblaze B2** — the sole data store (S3-compatible API). Three artifact families:
  - `library/` — source videos
  - `dedup/index/hash_index.json` — persistent, incremental perceptual-hash index
  - `dedup/reports/<run_id>.json` — immutable per-run cluster reports
- No application database.

## Trust Boundaries

See [docs/SECURITY.md](docs/SECURITY.md).

- **Frontend -> API** — CORS-restricted; `CORSMiddleware` is registered LAST in `main.py` (outermost) so it wraps every response, including uncaught-exception 500s.
- **API -> B2** — authenticated via application keys, signature v4; endpoint derived from `B2_REGION`.
- **Client -> B2** — presigned URLs (inline for previews, attachment for downloads; 10-min expiry).

## Data Flows

- **Ingest**: Browser -> `POST /upload` (multipart) -> validate video -> repo writes to `library/`
- **Run**: Browser -> `POST /runs` -> service lists `library/`, downloads each un-indexed video, hashes it (`videohash`), updates the index, clusters near-duplicates, writes `dedup/reports/<run_id>.json` -> returns report
- **Run (with progress)**: Browser -> `POST /runs/stream` -> same pipeline via the `run_dedup_events` generator, but yields a per-video SSE progress event (and a terminal event carrying the report) so the dialog renders a determinate "N of M" bar
- **Read runs**: `GET /runs` (list) / `GET /runs/{run_id}` (report) -> repo reads report JSON from B2
- **Delete run**: `DELETE /runs/{run_id}` -> repo deletes the report object
- **Library/Files**: `GET /videos` (library + index status) / `GET /files*` (bucket browse, presign, delete)

## Observability

- Structured JSON logging with `request_id`; request timing + catch-all 500 middleware
- `/metrics` (Prometheus format) and `/health` (B2 connectivity) endpoints

## Canonical Files

- Dedup hashing + clustering: `services/api/app/service/dedup.py`
- Run orchestration: `services/api/app/service/runs.py`
- Run routes: `services/api/app/runtime/runs.py`
- B2 data access (repo layer): `services/api/app/repo/b2_client.py`
- Pydantic models: `services/api/app/types/` (`dedup.py`, `files.py`, `stats.py`, `formatting.py`)
- Config (pydantic-settings): `services/api/app/config/settings.py`
- Structural tests: `services/api/tests/test_structure.py`
- Frontend API client: `apps/web/src/lib/api-client.ts`
- Shared TypeScript types: `packages/shared/src/types.ts`

## Core Features

- [Perceptual Video Hashing](docs/features/perceptual-hashing.md)
- [Deduplication Runs](docs/features/deduplication-runs.md)
- [Ingest](docs/features/ingest.md)
- [File Browser & Library Explorer](docs/features/file-browser.md)
- [Dashboard](docs/features/dashboard.md)

## References

- [docs/SECURITY.md](docs/SECURITY.md)
- [docs/RELIABILITY.md](docs/RELIABILITY.md)
- [AGENTS.md](AGENTS.md)
