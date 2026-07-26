# Google Drive Document Sync — Design Spec

**Date:** 2026-07-24
**Status:** Approved for planning
**Author:** Sajee + Claude

## Summary

Admin Documents-tab uploads and member KYC uploads (Govt ID, PAN, Ration Card) currently
save only to Supabase Storage. Add a best-effort dual-write so the same file also lands in
the member's Google Drive folder, using Drive integration code that already exists in the
repo (`lib/google/drive.ts`, `lib/actions/member-documents.ts`, `member_documents` table)
but was never wired into any upload path.

Supabase Storage remains the source of truth — it's what the app reads from, and it's what
gets shown to the user immediately. Drive is a secondary copy. If the Drive copy fails, the
upload still succeeds for the user; the failure is queued and retried automatically once a
day until it succeeds or gives up after 5 days.

## Scope

- Admin → Documents tab uploads (`/api/documents/upload`)
- Member/Admin profile KYC uploads only — `folder === "kyc"` uploads through
  `/api/upload-photo` (Govt ID, Aadhaar back, PAN front/back, Ration Card front/back)

## Non-Goals

- Profile photo / passport photo uploads (same `/api/upload-photo` route, different
  `folder` values) are **not** synced to Drive.
- No UI changes. No "View in Drive" link is added anywhere. Files simply become available
  in the member's Drive folder in the background.
- No changes to how the Documents tab or KYC tab read/display data — both keep reading from
  Supabase Storage URLs exactly as today.

## Architecture

Reuse existing code, don't duplicate it:

- `lib/google/drive.ts` — already has `getOrCreateMemberFolder()` and
  `uploadMemberDocument()`.
- `lib/actions/member-documents.ts` — `uploadMemberDoc(formData)` already chains
  folder-lookup/creation + Drive upload + a `member_documents` row insert, given
  `user_id`, `company_id`, `file`. This is called as-is from both upload routes below —
  no new sync helper needed.
- `users.drive_folder_id` — already populated automatically when a member is onboarded
  (`lib/actions/team.ts`), so the folder usually already exists by the time a document is
  uploaded.

### 1. Documents tab upload (`app/api/documents/upload/route.ts`)

After the existing Supabase Storage upload + `documents` table insert succeeds, build a
second `FormData` from the same `file`/`userId`/`profile.company_id` already in scope and
call `uploadMemberDoc()`. Wrapped so a failure never affects the response already prepared
for the admin.

### 2. KYC upload (`app/api/upload-photo/route.ts`)

Only when `formData.get("folder") === "kyc"`: after the existing Supabase Storage upload
succeeds, look up the uploader's `company_id`, build a `FormData`, and call
`uploadMemberDoc()`. Same failure isolation as above.

### 3. Retry queue (new)

New table `drive_sync_queue` — a row is inserted **only when a Drive sync attempt fails**;
successful syncs never touch this table.

```sql
CREATE TABLE drive_sync_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             text NOT NULL,           -- original file name
  storage_path     text NOT NULL,           -- path within the `documents` bucket
  mime_type        text NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed')),
  attempts         int NOT NULL DEFAULT 0,
  last_error       text,
  last_attempt_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
```

RLS enabled with the standard tenant-isolation policy. Only ever written/read by
service-role server code (upload routes + cron) — no client access needed.

### 4. Retry cron (new)

`app/api/cron/drive-retry/route.ts` — same `CRON_SECRET` auth-header pattern as the
existing cron routes (e.g. `holiday-reminder`, `logout-nudge`).

Schedule: once daily, `30 13 * * *` UTC (7:00 PM IST) — the same evening slot already used
by `logout-nudge` / `holiday-reminder`.

Each run:
1. Select all `drive_sync_queue` rows with `status = 'pending'`.
2. For each: re-download the file bytes from the `documents` Supabase Storage bucket at
   `storage_path`, retry `getOrCreateMemberFolder` + `uploadMemberDocument`.
3. On success: insert into `member_documents`, delete the queue row.
4. On failure: `attempts += 1`, `last_attempt_at = now()`, `last_error = <message>`. If
   `attempts >= 5`, set `status = 'failed'` (stops being picked up by future runs — left in
   the table for manual review). Otherwise stays `pending` for tomorrow's run.

## Error handling

Every Drive-related call in the upload routes is wrapped in `try/catch`. On failure:
insert a `drive_sync_queue` row (best-effort itself — if even that insert fails, log and
move on, never throw back to the HTTP response). The user-facing upload response is
unaffected either way.

## Data flow

```
Upload (browser)
  → Supabase Storage (documents bucket)           [always, source of truth]
  → DB row: `documents` or `member_kyc`            [always, unchanged]
  → uploadMemberDoc() best-effort:
      success → member_documents row created
      failure → drive_sync_queue row created
                   ↓ (daily cron, 7pm IST)
                 retry from Supabase Storage bytes
                   → success: member_documents row, queue row deleted
                   → failure (5th time): status='failed', stops retrying
```

## Testing / Verification

No automated test for live Google Drive calls (external API, real credentials). Manual
verification after implementation:
1. Upload a document via Admin → Documents tab; confirm the file appears in Supabase
   Storage (as before) **and** in the member's Google Drive folder, and a
   `member_documents` row exists.
2. Upload a KYC document (Govt ID) from a member profile; same check.
3. Temporarily break Drive credentials (or simulate a thrown error) and confirm: the
   upload still succeeds for the user, and a `drive_sync_queue` row is created.
4. Manually invoke `/api/cron/drive-retry` with the correct `CRON_SECRET` and confirm the
   queued row is retried and cleared on success.

## Pre-deploy checklist

- `GOOGLE_SERVICE_ACCOUNT_KEY` and `GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID` must be set in
  Vercel's **production** environment variables (already present in `.env.local`, not yet
  confirmed in Vercel).
