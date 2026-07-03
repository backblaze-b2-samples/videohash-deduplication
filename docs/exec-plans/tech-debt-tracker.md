<!-- last_verified: 2026-03-10 -->
# Tech Debt Tracker

Known tech debt items. Agents update this when they discover or create tech debt.

| Description | Impact | Proposed Resolution | Priority | Status |
|---|---|---|---|---|
| `datetime.utcnow()` deprecated in Python 3.12+ | Naive datetimes, future breakage | Replace with `datetime.now(UTC)` in `repo/b2_client.py`, `service/metadata.py` | High | Resolved |
| S3 client recreated on every API call | Connection pool wasted, added latency | Cache client as module-level singleton via `lru_cache` | High | Resolved |
| `get_upload_stats()` pagination broken at 1000 objects | Stats silently wrong for large buckets | Check `IsTruncated` + use `ContinuationToken` | High | Resolved |
| `record_upload()` never called | `/metrics` always reports 0 uploads | Call from `runtime/upload.py` after successful upload | Medium | Resolved |
| Metrics counters not thread-safe | Race conditions under concurrent requests | Use `threading.Lock` (matches `service/files.py` pattern) | Medium | Resolved |
| `_humanize_bytes` duplicated in Python (repo + service) | DRY violation, drift risk | Extract to `app/types/formatting.py` shared util | Medium | Resolved |
| `humanizeBytes` duplicated in TypeScript | DRY violation | Extract to `lib/utils.ts` | Low | Open |
| `formatDate` duplicated in TypeScript | DRY violation | Extract to `lib/utils.ts` | Low | Open |
| No test harness for feature specs | No automated verification | Add pytest fixtures + test files per feature | Medium | Resolved (partial — tests added for upload, files, activity, errors) |

## 2026-07-03 — verify

Nitpicks from the sample-3-verify UX funnel (dedup-run goal). All are backlog polish — none block the goal path; the marquee near-duplicate flow passed end-to-end. Shots are local verify artifacts under `.local/` (gitignored).

- Runs empty state — "No dedup runs yet — Start your first run…" copy has no co-located CTA button (only the top-right header "New dedup run") → eye lands on the invitation but must jump to the header to act; add an inline CTA. (shot: `.local/lensA-02-runs-empty.png`)
- Dashboard / sidebar "Dedup runs" / "Dedup Runs" both route to the runs LIST, not to starting a run, and there's no "New run" affordance on the Dashboard → label is ambiguous (view vs. start), one extra inference/hop for a first-timer. (shot: `.local/lensA-r1-01-landing-dashboard.png`)
- New-run modal, in-progress — a top-right "×" renders during a run but is inert (no Cancel; ×/Esc/outside-click no-op while pending) → affordance mismatch (looks clickable, does nothing). Hide/disable it or show "can't cancel while running". User is NOT trapped (sidebar nav + reload recover). (shot: `.local/lensA-r1-04-run-progress.png`)
- New-run modal progress bar — Radix progressbar carries `aria-valuemax=100` but `aria-valuenow=null` → screen-reader users get progress only from the "Hashing N of M" text label, not the bar; set `aria-valuenow`. (shot: `.local/lensB-r1-04-inprogress-b.png`)
- Mid-run sidebar navigation — clicking a nav link mid-run navigates away and abandons the in-flight hashing stream without an explicit "run cancelled" toast (a completion toast may still fire if it finished) → inconsistent with the dialog's own "can't dismiss mid-run" guard; off the default path. (shot: `.local/lensB-r1-07-h6-nav-attempt.png`)
- Cluster report headline "Reclaimable" tile — reads 9.8 MB on both ≤8 and ≤4 runs though the base cluster's reclaimable changed 25.8 KB → 14.6 KB → dominated by a large cluster + rounding, so tuning the threshold can look like it "did nothing" at the top level; the delta is legible in per-cluster detail + "Duplicate videos" (8→7). (shot: `.local/lensC-r1-nondefault-strict-report.png`)
