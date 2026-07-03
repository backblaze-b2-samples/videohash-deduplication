<!-- last_verified: 2026-07-03 -->
# Feature: File Browser & Library Explorer

## Purpose
Two explorers over the same B2 bucket: the **full-bucket** file browser (`/files`)
for everything, and the **Library** explorer (`/library`) scoped to the
`library/` prefix, which shows each video's hash status and an inline preview.

## Used By
- UI: `/files` (full bucket), `/library` (videos + hash status)
- API: `GET /files`, `GET /files-by-key/*`, `DELETE /files-by-key`, `GET /videos`
- Legacy API: `GET /files/{key}`, `GET /files/{key}/download`, `GET /files/{key}/preview`, `DELETE /files/{key}`

## Core Functions
- `apps/web/src/components/files/file-browser.tsx` — tree view container (list, preview, download, delete, refresh)
- `apps/web/src/components/files/file-tree-row.tsx` — recursive folder/file rows
- `apps/web/src/components/files/file-preview.tsx` — dialog modal; renders images, **video**, and PDFs inline
- `apps/web/src/components/library/library-explorer.tsx` — video grid with hash-status badges and `<video>` thumbnails
- `apps/web/src/lib/api-client.ts` — `getFiles()`, `getFile()`, `getDownloadUrl()`, `getPreviewUrl()`, `deleteFile()`, `getVideos()` (keys sent as query parameters)
- `services/api/app/runtime/files.py` — list/get/download/delete handlers
- `services/api/app/runtime/runs.py` — `GET /videos` (library joined with the hash index)
- `services/api/app/service/files.py` — key validation, presign
- `services/api/app/repo/b2_client.py` — `list_files()`, `list_prefix()`, `get_file_metadata()`, `get_presigned_url()`, `delete_file()`

## Inputs
- prefix: string (optional listing filter)
- limit: int (1–1000, default 100)
- key: string (sent as a query parameter; validated against path traversal)

## Outputs
- `GET /files` → `FileMetadata[]` (newest first)
- `GET /files-by-key/metadata?key=...` → `FileMetadata`
- `GET /files-by-key/download?key=...` → `{ url }` (presigned, attachment disposition, 10-min expiry)
- `GET /files-by-key/preview?key=...` → `{ url }` (presigned, **inline** disposition — for `<img>`/`<video>`/PDF)
- `DELETE /files-by-key?key=...` → `{ deleted: true, key }`
- `GET /videos?prefix=library/` → `LibraryVideo[]` (each with `hashed`, `hash_hex`, and an inline presigned `url`)
- Side effect: DELETE removes the object from B2

## Flow
- `/files`: loads the whole bucket, organizes keys into a folder/file tree, supports preview/download/delete
- `/library`: loads `GET /videos`, renders a grid of `<video>` previews with a Hashed ✓ / Pending badge per video
- Preview: fetches an inline presigned URL and renders the media in a dialog
- All key-based calls send the key in the query string and validate it in the service layer

## Edge Cases
- File not found → 404; invalid/traversal key → 400
- B2 unreachable → persistent error state with retry
- Empty bucket / empty library → prompt to ingest videos
- Video preview URL unavailable → fallback copy in the dialog

## UX States
- Empty / Loading (skeletons) / Error (retry) / Loaded
- Media paints in both list surfaces (library grid, files tree preview) and the detail dialog

## Verification
- Test files: `services/api/tests/test_file_key_routes.py`, `apps/web/src/lib/api-client.test.ts`
- Quick verify command: `pnpm test:api`
- Client route-construction tests: `pnpm --filter @videohash-deduplication/web test`
- Full verify command: `pnpm lint && pnpm --filter @videohash-deduplication/web test && pnpm build && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Deduplication Runs](deduplication-runs.md)
- [App Workflows](../app-workflows.md)
