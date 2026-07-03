# Exec plan — `videohash-deduplication`

Scaffold a new B2 sample from **vibe-coding-starter-kit** that runs perceptual
video deduplication across a Backblaze B2 library using the **videohash** OSS
library. Source of truth for starter content:
`.claude/scratch/vcsk-23388e65-a65c-48ee-a2ee-967aa4cb549a/`.

---

## 1. Purpose

A data-engineering console that finds **near-duplicate videos** in a Backblaze
B2 library. An operator points a *dedup run* at a folder of videos (`library/`),
the backend downloads each video, computes a **perceptual hash** with
`videohash` (frame-sampling → collage → wavelet hash, robust to re-encodes /
resolution changes / minor edits), maintains a persistent hash **index** in B2,
clusters near-duplicates by pairwise Hamming distance, and writes a **cluster
report** back to B2. Ops teams read those reports to reclaim storage and enforce
content policy. Built for media-asset managers, streaming platforms, and video
hosts sitting on large B2 libraries. **B2 is the storage layer for all three
artifacts** — the source library, the persistent hash index, and every run
report — accessed over the S3-compatible API with a custom user-agent and the
standard `B2_*` env vars. Runs entirely on local OSS: **no second API key, B2
credentials only.**

## 2. Architecture delta from vibe-coding-starter-kit

The starter kit is the ceiling. Keep the Next.js (`apps/web`) + FastAPI
(`services/api`) + shared-types (`packages/shared`) monorepo shape, the whole
shadcn UI kit, the query/api-client wiring, the B2 client, and the middleware /
logging / health scaffolding. Strip the upload-analytics framing and re-skin
around dedup runs.

| KEEP (as-is) | TRIM (remove from starter) | ADD (new for videohash-deduplication) |
|---|---|---|
| Monorepo layout, `pnpm` workspace, scripts (`dev.sh`, `pick-port.mjs`), `doctor.mjs` (retarget env names) | — `docs/features/metadata-extraction.md` (no PDF/EXIF metadata story here) | **`/runs` page** — primary-entity list + "New dedup run" dialog + `/runs/[runId]` cluster-report detail |
| **Full-bucket explorer `/files`** (`file-browser`, `file-tree-row`, `file-preview`, `file-metadata-panel`) — **non-negotiable keep** | — `PyPDF2` dep + `service/metadata.py` PDF branch (keep image/video mime handling) | **`/library` explorer** — sample-specific explorer scoped to `LIBRARY_PREFIX` (`library/`), shows each video + hash status (hashed ✓ / pending) — *this is the mandatory sample-specific explorer* |
| Entire shadcn `components/ui/*` kit, layout (sidebar, header, command-palette, theme), design system page `/design` | — Nothing else structural | **Backend dedup pipeline**: `service/dedup.py` (videohash hasher + clustering), `service/runs.py` (orchestration), `runtime/runs.py` (routes), `types/dedup.py` (models) |
| `repo/b2_client.py` S3 client (extend, don't replace) | — Dashboard "downloads" metric + download-counter file (replace metrics with dedup metrics) | **B2 JSON helpers** on `b2_client.py`: `download_to_tmp(key)`, `get_json(key)`, `put_json(key, obj)`, `list_prefix(prefix)` |
| `/upload` page + `/upload` route — **repurpose** to ingest into `LIBRARY_PREFIX` (models the "Ingest" workflow step; makes the demo seedable) | — Upload page's generic "any file" copy | **`scripts/seed_library.py`** — generates a base clip + near-dup variants + a distinct control with bundled ffmpeg, uploads to `library/` (no committed binaries) |
| `/settings` page + `settings-form.tsx` (the form-UX exemplar) | — settings fields that reference uploads/quota framing (re-label to dedup context, keep the widget types) | **`assertMediaPaints`-friendly video rendering** in cluster + library views (presigned `<video>` preview) |
| Dashboard shell (`stats-cards`, `upload-chart`, `recent-uploads-table`) — **re-skin**, keep components | | Dashboard re-skinned to: library video count, total size, # runs, latest-run cluster count + reclaimable storage; activity chart = videos-hashed-per-day (or runs-per-day) |

**Bucket-explorer tension note:** none — `/files` (full-bucket browse) stays as
the general explorer; `/library` (scoped to `library/`) is the new
sample-specific explorer. Both coexist in the sidebar.

## 3. B2 surface (S3-compatible API only — no b2-native)

All via boto3 S3 client in `repo/b2_client.py` with `user_agent_extra` +
`signature_version=s3v4`. No b2-native SDK anywhere.

- `list_objects_v2` — list `library/` videos; list `dedup/reports/` for the run list; paginate for stats.
- `get_object` / streaming download — download each library video to a temp file for hashing; read `dedup/index/hash_index.json`; read a report JSON.
- `put_object` — write/overwrite `dedup/index/hash_index.json`; write `dedup/reports/<run_id>.json`; upload seeded/ingested videos into `library/`.
- `head_object` — video metadata (size, content-type, last-modified).
- `delete_object` — delete a run report (the `delete` verb); delete a library video (bucket/library explorer).
- `generate_presigned_url` — inline `<video>` preview + download in library / files / cluster views.

**No b2-native use. No deviation to justify.**

## 4. Key features

### Primary entity — **DedupRun** (a run + its cluster report)

The single primary resource the app manages. Lifecycle verbs in the UI:

| Verb | Built? | Where |
|---|---|---|
| **create / run** | ✅ (create *is* run here) | "New dedup run" dialog on `/runs` → POST `/runs` executes the pipeline synchronously → redirect to the new report detail |
| **read** | ✅ | `/runs` table (list all reports) + `/runs/[runId]` cluster-report detail |
| **delete** | ✅ | `/runs` row action + detail-page button → alert-dialog confirm → DELETE `/runs/{runId}` removes `dedup/reports/<runId>.json` from B2 |
| **edit** | ❌ **OMITTED — justified** | A dedup run is an **immutable, timestamped computed artifact** (a report over the library state at run time). There is nothing user-meaningful to edit — re-tuning threshold/prefix produces a *new* run via the create form, not a mutation of a past one. Record in `omitted_ui_verbs`. |

Record in Phase 5 `omitted_ui_verbs`:
`{entity:"DedupRun", operation:"edit", justification:"Immutable point-in-time computed report; re-tuning produces a new run via the create form — no editable state."}`

### Feature list (seeds README + `docs/features/*.md`)

1. **Perceptual video hashing (videohash)** — `deployment: local`. Frame-sampling perceptual hash per video, robust to re-encodes/resize/watermarks. No external provider, **no API key**. Pure CPU (no torch/CUDA/MPS — perceptual hashing + ffmpeg frame extraction only), so the CPU-default rule from `api-provider-selection.md` is satisfied trivially — no accelerator autodetect needed. Est. cost for a full demo run: **$0** (local compute + B2 storage only). Env var for a key: **none**.
2. **Persistent hash index in B2** — `deployment: local`. `dedup/index/hash_index.json` keyed by video key; each run appends entries for videos not yet hashed (incremental → re-runs are fast). Demonstrates sustained read/write load on B2.
3. **Near-duplicate clustering** — `deployment: local`. Pairwise Hamming distance ≤ threshold, connected-components (union-find) → clusters. Threshold configurable per run.
4. **Cluster reports in B2** — `deployment: local`. `dedup/reports/<run_id>.json`: clusters, representatives, per-cluster reclaimable bytes. Ops reads these directly from B2.
5. **Library explorer + full-bucket explorer** — browse `library/` (with hash status) and the whole bucket.

**No external API provider** anywhere → `api-provider-selection.md` provider
gating N/A. **No Genblaze** — the description's suggested stack does not mention
genblaze/genblaze-*; use `videohash` directly. Contain the `videohash` import in
`services/api/app/service/dedup.py`.

### Form UX conventions — "New dedup run" create form

Follow the `settings-form.tsx` exemplar (`react-hook-form` + `zod` +
`FormDescription`).

- **(a) Finite-set field → selector (not free text):** `threshold` has a small
  finite set → **`Select`** with three options:
  `Strict (≤4 bits)` / `Balanced (≤8 bits)` / `Loose (≤12 bits)`.
- **`prefix`** is a path (not a finite set) → free-text `Input`, default
  `library/`.
- **(b) CREATE-form safe defaults as guidance (not an autofill button):**
  threshold default = **Balanced (8)** (pre-selected + `FormDescription`:
  "Balanced catches re-encodes without flagging genuinely different videos");
  prefix default `library/` via placeholder + `FormDescription`: "The B2 folder
  your videos live in. Defaults to library/."
- There is no edit form (edit verb omitted), so the default-hint rule applies
  only to this create form; the selector rule has no second form to cover.

### Backend data contracts

`dedup/index/hash_index.json`:
```json
{ "version": 1, "updated_at": "<ISO>",
  "entries": { "library/base.mp4": { "hash_hex": "0x...", "hash_bits": "0b...", "size_bytes": 12345, "hashed_at": "<ISO>" } } }
```
`dedup/reports/<run_id>.json`  (run_id = sortable timestamp slug, e.g. `2026-07-03T16-30-00Z`; `run_date` kept as a field):
```json
{ "run_id": "...", "run_date": "2026-07-03", "created_at": "<ISO>",
  "threshold": 8, "prefix": "library/", "video_count": 5, "hashed_this_run": 5,
  "cluster_count": 2, "duplicate_video_count": 3, "reclaimable_bytes": 34567, "reclaimable_human": "33.8 KB",
  "clusters": [ { "cluster_id": 1, "representative": "library/base.mp4",
    "members": [ {"key":"library/base.mp4","distance_to_rep":0,"size_bytes":N},
                 {"key":"library/base_reenc.mp4","distance_to_rep":3,"size_bytes":N} ],
    "reclaimable_bytes": N } ] }
```
- "Reclaimable" = sum of member sizes minus the largest (keep-one-per-cluster heuristic). A singleton video is not a cluster and is excluded from the report's `clusters`.
- Routes: `POST /runs` (body `{threshold:int, prefix:str}` → runs pipeline, writes index+report, returns report), `GET /runs` (list), `GET /runs/{run_id}` (one report), `DELETE /runs/{run_id}`. Add `GET /videos` (list `library/` joined with index → each item `{key, size, hashed:bool, hash_hex?}`) to back the Library explorer. Reuse existing `/files` + presign routes for the bucket explorer/previews.
- Reuse `validate_key`, `FileKeyError/FileNotFoundError`, presign + key-safety patterns from `service/files.py`.

## 5. Doc transforms

- **Rewrite** `README.md` around the dedup workflow (Ingest→Hash→Compare→Store→Serve), the "What people search for" SEO phrases, ffmpeg note (auto-provided via `imageio-ffmpeg`, no manual install), and the standard `B2_*` env table.
- **Rewrite** `docs/features/file-upload.md` → `docs/features/ingest.md` (upload into `library/`); `docs/features/dashboard.md` → dedup metrics; `docs/features/file-browser.md` → keep (bucket + library explorers).
- **Add** `docs/features/perceptual-hashing.md`, `docs/features/deduplication-runs.md` (from `_template.md`).
- **Delete** `docs/features/metadata-extraction.md`.
- Retarget `ARCHITECTURE.md`, `docs/app-workflows.md`, `docs/dev-workflows.md`, `AGENTS.md`, `CLAUDE.md`, `infra/railway/README.md`, `CODE_REVIEW.md`/`SECURITY.md` env references to the dedup app + standard env names.
- Move this plan to `docs/exec-plans/completed/initial-scaffold.md` on PASS (Phase 5).

## 6. Rename table

| From | To |
|---|---|
| pkg `vibe-coding-starter-kit` (root `package.json`) | `videohash-deduplication` |
| workspace scope `@vibe-coding-starter-kit/shared` (imports in api-client.ts, queries.ts, file-*.tsx, upload-progress.tsx, packages/shared/package.json, tsconfig paths, pnpm-workspace) | `@videohash-deduplication/shared` |
| `APP_NAME = "OSS Starter Kit"` (app-config.ts) | `"Video Dedup"` |
| `APP_DESCRIPTION` | `"Near-duplicate video detection across a Backblaze B2 library, powered by videohash perceptual hashing."` |
| FastAPI `title="OSS Starter Kit API"` / description (main.py) | `"Videohash Deduplication API"` |
| `user_agent_extra="b2ai-oss-start"` (b2_client.py) | `"b2ai-videohash-dedup"` |
| `utm_content=b2ai-oss-start` (app-sidebar.tsx footer link) | `utm_content=b2ai-videohash-dedup` |
| Docker/railway service names, workflow slugs, any `oss-starter-kit`/"Vibe Coding Starter Kit" strings | `videohash-deduplication` / "Video Dedup" |

### Env-var standardization (Standard #3 — MANDATORY, historically the most-missed step)

Rename **every** reference across: `.env.example`, `services/api/app/config/settings.py`, `services/api/app/repo/b2_client.py`, `services/api/main.py` (`REQUIRED_B2_SETTINGS` **and** `PLACEHOLDER_VALUES`), `scripts/doctor.mjs` (`REQUIRED_B2_VARS` + placeholder list), `infra/railway/README.md`, `README.md`, and any doc mentioning them.

| Starter (non-standard) | Standard #3 name | Handling |
|---|---|---|
| `B2_KEY_ID` / `b2_key_id` | **`B2_APPLICATION_KEY_ID`** / `b2_application_key_id` | boto3 `aws_access_key_id` |
| `B2_APPLICATION_KEY` | `B2_APPLICATION_KEY` (already standard) | boto3 `aws_secret_access_key` |
| `B2_BUCKET_NAME` | `B2_BUCKET_NAME` (already standard) | bucket |
| `B2_ENDPOINT` / `b2_endpoint` | **`B2_REGION`** / `b2_region` | derive `endpoint_url=f"https://s3.{region}.backblazeb2.com"`; also pass `region_name=region` to boto3. Default `us-west-004`. |
| `B2_PUBLIC_URL` / `b2_public_url` | **`B2_PUBLIC_URL_BASE`** / `b2_public_url_base` | optional public/CDN base for `_public_url()` |

Add dedup config to settings (defaults, not required): `library_prefix="library/"`, `index_key="dedup/index/hash_index.json"`, `reports_prefix="dedup/reports/"`, `dedup_default_threshold=8`.

---

## 7. Implementation notes — videohash traps (READ BEFORE INSTALLING — false-green risk)

`videohash==3.0.1` (May 2022, classifiers cap at Py 3.10) is the featured OSS
lib. It **imports and boots fine but the marquee hashing feature crashes at
runtime** unless these are handled. Boot + `pytest` staying green does NOT prove
the feature works — **the build MUST run one real end-to-end hash on a generated
clip and prove clustering produces the expected groups before declaring done.**

1. **Pillow `ANTIALIAS` removal (the #1 trap).** videohash's collage-maker
   (`videohash/collagemaker.py`, imported via `make_tile`/`MakeCollage`) uses
   `Image.ANTIALIAS`, **removed in Pillow ≥ 10**. The starter pins
   `Pillow>=11.0.0`. **Fix:** in `service/dedup.py`, *before* `import videohash`,
   add a compat shim:
   ```python
   from PIL import Image
   if not hasattr(Image, "ANTIALIAS"):
       Image.ANTIALIAS = Image.Resampling.LANCZOS
   ```
   Keep Pillow modern (don't downgrade — the starter's image handling wants 11).
2. **ffmpeg on PATH (no `ffmpeg_path` param).** Constructor is
   `VideoHash(path=..., url=..., storage_path=..., download_worst=False, frame_interval=1)`
   — there is **no** `ffmpeg_path` arg; videohash shells out to `ffmpeg` by name.
   **Fix:** add `imageio-ffmpeg` to requirements and, at hasher-module import,
   symlink its bundled static binary onto PATH as `ffmpeg`:
   ```python
   import os, imageio_ffmpeg
   _bin = imageio_ffmpeg.get_ffmpeg_exe()
   # symlink into a private dir named exactly "ffmpeg", prepend that dir to PATH
   ```
   This removes the system-ffmpeg prerequisite (clean fresh-clone install). If
   the installed videohash also needs `ffprobe`, fall back to documenting system
   ffmpeg — but verify empirically which it needs.
3. **Dep pins.** videohash pulls `Pillow`, `ImageHash`, `imagedominantcolor`,
   `yt-dlp`. Add to `requirements.txt`: `videohash==3.0.1`, `imageio-ffmpeg>=0.5.0`.
   If `imagedominantcolor`/`ImageHash`/`scipy` break on numpy 2.x at runtime,
   pin `numpy<2`. Verify the whole chain **imports and runs a hash** on a fresh
   `pip install -r requirements.txt` in a clean venv — do not trust boot alone.
   `yt-dlp` is pulled transitively but unused (we only use `path=`); that's fine.
4. **Per-video flow:** download B2 object → temp file → `VideoHash(path=tmp,
   storage_path=<tmpdir>)` → read `.hash_hex` / `.hash` → clean the temp file +
   videohash storage dir. Distance between two = `vh_a - vh_b` (int). Cluster by
   distance ≤ threshold.
5. **Seed / demo data (`scripts/seed_library.py`).** Generate with the bundled
   ffmpeg (no committed binaries): a base clip (`lavfi testsrc`), 1–2 near-dup
   variants of it (re-encode at a different CRF + mild scale — should hash within
   a few bits → one real cluster), and 1 distinct control (`lavfi mandelbrot` or
   `smptebars` → far). Upload all to `library/`. **Tune threshold/variants so the
   demo yields a real duplicate cluster** — a report with an actual duplicate
   group is what makes the later screenshot step compelling. Verify empirically.
6. **Run latency.** Synchronous run endpoint is fine at demo scale (few short
   clips; incremental index skips already-hashed videos). Give the frontend a
   generous timeout + the starter's `generating-loader`. Document the
   background-job / LSH / BK-tree scaling path for 100K+ libraries in the README.
7. **Media must paint** (`assertMediaPaints` gate): cluster members and library
   rows render an actual `<video>` preview from a presigned URL (reuse
   `file-preview.tsx`) so a decoded frame/poster is present in **both** list and
   detail surfaces.

## 8. Standards checklist (parent CLAUDE.md — reviewer will gate on these)

- ✅ S3-compatible API only (no b2-native).
- ✅ `user_agent_extra="b2ai-videohash-dedup"` on the single S3 client.
- ✅ Standard `B2_*` names everywhere (incl. doctor.mjs + infra/railway).
- ✅ No secrets in tree — real creds only in gitignored `.env`; `.env.example` uses placeholders.
- ✅ Reproducible from fresh clone (bundled ffmpeg, pinned deps, seed script), env vars for all config.
- ✅ Primary-entity lifecycle complete in UI (create/run/read/delete built; edit omitted-with-justification).
- ✅ Bucket explorer kept + sample-specific `/library` explorer added.
