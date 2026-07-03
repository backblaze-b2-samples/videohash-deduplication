<!-- last_verified: 2026-07-03 -->
# App Workflows

User journeys inside the application. The end-to-end story is
**Ingest → Run → Read → Manage**.

## Ingest videos

- User navigates to `/upload` (Ingest)
- Drops or selects videos in the dropzone (MP4, MOV, WebM, MKV, AVI, MPEG)
- Client validates size (max 500MB) and type; per-file progress bars show status
- On success the video is stored under `library/`; on failure the row stays retryable
- (Or) seed demo clips with `services/api/.venv/bin/python scripts/seed_library.py`
- See: [Ingest](features/ingest.md)

## Start a dedup run (primary workflow)

- User navigates to `/runs` and clicks **New dedup run**
- Picks a match threshold (Strict ≤4 / Balanced ≤8 / Loose ≤12 bits) and a prefix (default `library/`)
- The run executes synchronously: each un-indexed video is downloaded from B2 and perceptually hashed; near-duplicates are clustered
- On completion the user is redirected to the cluster report for the new run
- See: [Deduplication Runs](features/deduplication-runs.md)

## Read a cluster report

- User opens `/runs/[runId]`
- Summary tiles show videos scanned, duplicate clusters, duplicate videos, reclaimable storage
- Each cluster card shows its members as inline `<video>` previews; the largest video is marked "Keep", others show their bit-distance from it
- "No near-duplicates found" is shown when everything is distinct at the chosen threshold

## Manage runs

- `/runs` lists every run with threshold, video/cluster counts, and reclaimable bytes
- Delete a run (row action or detail button) → confirm dialog → the report JSON is removed from B2 (index and videos are untouched)
- Runs are immutable — re-tuning the threshold means starting a **new** run

## Browse the library and bucket

- `/library`: videos under `library/` with a Hashed ✓ / Pending badge and a `<video>` thumbnail each
- `/files`: the full-bucket tree explorer with preview (image/video/PDF), download, and delete
- See: [File Browser & Library Explorer](features/file-browser.md)

## View the dashboard

- `/` (home): library video count, library size, run count, and latest-run reclaimable storage
- A bar chart of videos hashed per day plus a recent-runs table
- See: [Dashboard](features/dashboard.md)
