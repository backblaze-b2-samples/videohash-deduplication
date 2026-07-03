<!-- last_verified: 2026-07-03 -->
# Feature: Ingest

## Purpose
Add videos to the dedup library by uploading them from the browser to the
`library/` prefix in Backblaze B2, with real-time progress. Ingested videos are
picked up by the next dedup run.

## Used By
- UI: `/upload` (Ingest) page, upload form component
- API: `POST /upload`

## Core Functions
- `apps/web/src/components/upload/upload-form.tsx` — orchestrates dropzone + progress + upload state
- `apps/web/src/components/upload/dropzone.tsx` — drag-and-drop via `react-dropzone`, restricted to video types
- `apps/web/src/lib/api-client.ts` — `uploadFile()` using XHR for progress events
- `services/api/app/runtime/upload.py` — HTTP handler, reads file chunks
- `services/api/app/service/upload.py` — validates and orchestrates ingest; writes under `settings.library_prefix`
- `services/api/app/repo/b2_client.py` — `upload_file()` via boto3 `put_object`

## Inputs
- file: `File` (browser multipart form data)
- content_type: string (video MIME type)

## Outputs
- `FileUploadResponse`: key, filename, size, content_type, uploaded_at, url, metadata
- Side effect: video stored in B2 under `library/{sanitized_filename}`

## Flow
- User drops or selects videos in the dropzone (MP4, MOV, WebM, MKV, AVI, MPEG)
- Client validates size (max 500MB) and type — rejected files stay in the queue with a reason
- XHR sends multipart POST to `/upload` with progress events
- API checks `Content-Length` early, validates the content type against the video allowlist,
  sanitizes the filename, validates the extension matches the MIME type, rejects empty files
- API stores the object at `library/{sanitized_filename}` via `put_object`
- API returns `FileUploadResponse`; the client refreshes shared data

## Edge Cases
- File exceeds 500MB → client-side rejected row + toast; API returns 413 if bypassed
- Non-video type → dropzone rejects; API returns 415 if bypassed
- Extension mismatches MIME type → API returns 415
- Empty file → API returns 400
- Duplicate filename → B2 creates a new version (buckets are always versioned); the next run re-hashes it
- B2 unreachable → API returns 500; failed rows remain retryable

## UX States
- Empty: dropzone with instructions
- Loading: per-file progress bars
- Error: red status icon + per-file message + retry
- Complete: green checkmark, "Clear finished"

## Verification
- Test files: `services/api/tests/test_upload_conflict.py`, `services/api/tests/test_error_handling.py`
- Required cases: successful ingest into `library/`, oversized rejection, disallowed type, empty file, duplicate filename allowed
- Quick verify command: `pnpm test:api`
- Full verify command: `pnpm lint && pnpm lint:api && pnpm test:api && pnpm check:structure`
- Pass criteria: all pytest tests green, no ruff violations

## Related Docs
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [Deduplication Runs](deduplication-runs.md)
- [App Workflows](../app-workflows.md)
