<!-- last_verified: 2026-07-03 -->
# Feature: Deduplication Runs

## Purpose
The primary entity. A **dedup run** hashes every video under a prefix, clusters
near-duplicates by Hamming distance, and writes an immutable cluster **report**
to B2. Ops teams read reports to reclaim storage and enforce content policy.

## Used By
- UI: `/runs` (list + "New dedup run" dialog), `/runs/[runId]` (cluster report)
- API: `POST /runs`, `POST /runs/stream` (SSE progress — used by the dialog),
  `GET /runs`, `GET /runs/{run_id}`, `DELETE /runs/{run_id}`, plus
  `GET /dedup/stats` and `GET /dedup/stats/activity` for the dashboard

## Lifecycle verbs (UI)
| Verb | Built? | Where |
|---|---|---|
| create / run | yes (create *is* run) | "New dedup run" dialog → `POST /runs` runs synchronously → redirect to the report |
| read | yes | `/runs` table + `/runs/[runId]` cluster report |
| delete | yes | row action + detail button → confirm → `DELETE /runs/{run_id}` |
| edit | **omitted (justified)** | A run is an immutable, timestamped computed report over the library state at run time. Re-tuning threshold/prefix produces a *new* run via the create form — there is no editable state. |

## Core Functions
- `services/api/app/service/runs.py` — `run_dedup_events` (the pipeline generator; yields determinate progress), `run_dedup` (thin wrapper returning the final report), `list_runs`, `get_run`, `delete_run`, `list_videos`, `get_dedup_stats`, `get_hash_activity`
- `services/api/app/runtime/runs.py` — routes (both `POST /runs` and the SSE `POST /runs/stream` are sync `def`s so FastAPI/Starlette run the download+hash loop in a worker thread)
- `services/api/app/service/dedup.py` — hashing + clustering
- `apps/web/src/lib/api-client.ts` — `createRunStream` reads the SSE stream; `apps/web/src/lib/queries.ts` — `useCreateRunStream`
- `apps/web/src/components/runs/*` — new-run dialog (determinate progress), runs list, cluster report

## Form UX (create form)
- **threshold** is a finite set → a `Select`: Strict (≤4 bits) / Balanced (≤8 bits) / Loose (≤12 bits). Default **Balanced**, with a `FormDescription` hint. Never free text.
- **prefix** is a path → free-text `Input`, default `library/` via placeholder + `FormDescription` (a hint, not an autofill button).

## Inputs
- `DedupRunRequest`: `{ threshold: int (1–64), prefix: str }`

## Outputs
- `DedupReport` (returned + written to `dedup/reports/<run_id>.json`)
- Side effects: updates `dedup/index/hash_index.json`; writes/deletes report objects in B2

## Data contracts
`dedup/reports/<run_id>.json` — `run_id` is a sortable timestamp slug
(`2026-07-03T16-30-00Z`). "Reclaimable" = a cluster's total member bytes minus
the largest member (keep-one-per-cluster). Singletons are excluded from `clusters`.

## Flow
- List videos under the prefix from B2 (`list_prefix`)
- For each not-yet-indexed video: download to temp → `hash_video` → add index entry
- Persist the incremental index (`put_json`)
- Cluster indexed videos by Hamming distance ≤ threshold (union-find)
- Build the report (representatives = largest per cluster) and `put_json` it
- Return the report; the UI redirects to `/runs/[runId]`

### Progress streaming (`POST /runs/stream`)
The dialog drives the run through the SSE variant so it can show real progress:
`run_dedup_events` yields a `DedupProgressEvent` **per video** as it hashes them
(`stage="hashing"`, live `hashed`/`to_hash` count + the `current` filename),
one `stage="clustering"` event, then a terminal `stage="complete"` event whose
`report` is the same persisted `DedupReport` the non-streaming `POST /runs`
returns — so completion navigation is identical. Progress is honest (driven by
actual per-video hashing), not a timer. `run_dedup` is a thin wrapper that
consumes the same generator, so both paths share one pipeline.

## Edge Cases
- No videos under the prefix → report with `video_count: 0`, no clusters
- No near-duplicates → empty `clusters`, `cluster_count: 0`
- Re-run → only new videos are hashed (fast); a fresh report is written
- Invalid/traversal prefix or run_id → 400
- Missing run report → 404

## UX States
- Empty: "No dedup runs yet"
- Loading (run in progress): determinate progress inside the dialog — the blaze
  generating loader labelled with a live "Hashing N of M videos…" count, an
  advancing `Progress` bar, and the filename currently being hashed; flips to
  "Clustering near-duplicates…" (bar at 100%) once every video is hashed
- Error: inline `ErrorState` with retry
- Populated: runs table; report with per-cluster `<video>` previews

## Verification
- Test files: `services/api/tests/test_dedup.py`
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: clustering groups near-duplicates and isolates distinct videos

## Related Docs
- [Perceptual Video Hashing](perceptual-hashing.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [App Workflows](../app-workflows.md)
