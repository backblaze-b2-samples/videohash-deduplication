<!-- last_verified: 2026-07-03 -->
# Feature: Dashboard

## Purpose
Provide an at-a-glance overview of the dedup library and recent run activity.

## Used By
- UI: `/` page (dashboard home)
- API: `GET /dedup/stats`, `GET /dedup/stats/activity`, `GET /runs`

## Core Functions
- `apps/web/src/components/dashboard/dedup-stats-cards.tsx` — 4 stat cards
- `apps/web/src/components/dashboard/recent-runs-table.tsx` — recent dedup runs
- `apps/web/src/components/dashboard/hash-activity-chart.tsx` — bar chart of videos hashed per day
- `apps/web/src/lib/api-client.ts` — `getDedupStats()`, `getHashActivity()`, `getRuns()`
- `services/api/app/runtime/runs.py` — `GET /dedup/stats` and `/dedup/stats/activity` handlers
- `services/api/app/service/runs.py` — `get_dedup_stats()`, `get_hash_activity()`

## Inputs
- None (dashboard loads data automatically)

## Outputs
- `GET /dedup/stats` → `DedupStats` (library_video_count, library_size_*, run_count, latest_cluster_count, latest_reclaimable_*)
- `GET /dedup/stats/activity?days=7` → `DailyCount[]` (videos hashed per day, from the index)
- `GET /runs` → `DedupReport[]` for the recent-runs table

## Flow
- Page loads → parallel API calls (dedup stats, hash activity, runs)
- Stat cards display library video count, library size, run count, latest-run reclaimable storage
- The activity chart shows videos hashed per day over the last 7 days
- The recent-runs table lists the latest runs with video/cluster counts and reclaimable bytes

## Edge Cases
- API unavailable → inline error states with retry; the chart avoids a false zero state while loading
- No videos / no runs → empty chart + empty table messages
- Large library → stats paginate through all objects using `ContinuationToken`

## UX States
- Loading: skeleton placeholders for cards, chart, and table
- Empty: "No hashing yet" / "No runs yet"
- Loaded: populated cards, chart, table

## Verification
- Test files: `services/api/tests/test_dedup.py`
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Deduplication Runs](deduplication-runs.md)
- [App Workflows](../app-workflows.md)
