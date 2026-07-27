# Google Drive Sync — Switch to OAuth Auth — Design

**Date:** 2026-07-26
**Status:** Approved
**Area:** Google Drive integration (`lib/google/drive.ts`)

---

## Problem

Every Google Drive write in this app (member/KYC document sync being the one the
user is hitting) has silently failed since it was built. Root cause, confirmed by
directly calling the Drive API with the app's real credentials:

- `lib/google/drive.ts` authenticates as a **service account**
  (`grofast-app@grofast-app.iam.gserviceaccount.com`, credentials in
  `GOOGLE_SERVICE_ACCOUNT_KEY2`/`GOOGLE_SERVICE_ACCOUNT_KEY`).
- `GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID` points to a regular folder in someone's
  personal "My Drive" (shared with the service account for access), **not** a
  folder inside a Shared Drive.
- Reading that folder works (`GET` returns 200 — this is why the bug went
  unnoticed). Writing to it — creating a file or subfolder — fails every time
  with `403 storageQuotaExceeded`: *"Service Accounts do not have storage
  quota. Leverage shared drives, or use OAuth delegation instead."*
- The failure is invisible to users: `syncDocumentOrQueueRetry()` is
  deliberately "best-effort, never throws" — it logs to the server console and
  queues a retry, but the retry hits the identical 403 and eventually gives up
  silently after 5 attempts.
- The account is a regular free Gmail account, not Google Workspace, so
  **Shared Drives are not available** — that's the normal fix for this error,
  and it's off the table here.

## Goal

Replace the service-account auth in `lib/google/drive.ts` with **OAuth 2.0
authorizing the real Gmail account** that already owns/has access to these
folders. Files created via OAuth count against that account's normal storage
quota, so the identical 403 goes away. No other code changes — every function
that already calls into this file (`getOrCreateMemberFolder`,
`uploadMemberDocument`, `getOrCreateClientFolder`, `uploadFileToBackupFolder`,
etc.) keeps working unmodified, since only the internal `token()` helper
changes how it gets a bearer token.

---

## Scope

**In scope:** the shared auth mechanism in `lib/google/drive.ts` (the
`getAuth`/`token` internals) and a one-time interactive script to obtain the
refresh token that mechanism needs.

**Out of scope:**
- `GOOGLE_DRIVE_ROOT_FOLDER_ID` (used by `getOrCreateClientFolder`, for the
  Content/Media Tracker's per-client Drive folders) and
  `GOOGLE_DRIVE_BACKUP_FOLDER_ID` (used by `uploadFileToBackupFolder`, the
  weekly DB-backup cron) are **both missing from `.env.local` entirely** —
  those two features are broken independent of the auth fix and need their own
  env vars set. Not touched here; the user hasn't asked for those yet.
- No change to `GOOGLE_SERVICE_ACCOUNT_KEY`/`GOOGLE_SERVICE_ACCOUNT_KEY2` — they
  become unused once this ships, but removing them from Vercel/`.env.local` is
  optional operational cleanup, not required for the fix.
- No change to any consumer of `lib/google/drive.ts` — `lib/actions/member-documents.ts`,
  the two upload routes, the drive-retry cron, the media-tracker client-folder
  flow, and the DB-backup cron all keep working exactly as written today.

---

## Design

### 1. One-time interactive setup script

New script `scripts/google-drive-oauth-setup.ts`, run once locally by the
account owner via a new `pnpm drive:oauth-setup` command:

1. Reads `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` from
   `.env.local` (the user adds these first, copied from a new OAuth Client ID
   they create in Google Cloud Console — Desktop app type, in the same
   `grofast-app` project the service account already lives in).
2. Starts a temporary local HTTP server on `http://localhost:53682/oauth2callback`
   (this exact URI must be added to the OAuth Client's "Authorized redirect
   URIs" in Cloud Console — one-time config step, documented for the user when
   this is executed).
3. Builds the consent URL via `OAuth2Client.generateAuthUrl({ access_type:
   'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/drive']
   })` and prints it for the user to open in their browser.
4. The user logs in with their real Gmail account and clicks **Allow**. Google
   redirects to the local server with a `code` query param.
5. The script exchanges that code for tokens (`oauth2Client.getToken(code)`)
   and prints the resulting `refresh_token` — Google only returns one on first
   consent (or when `prompt: 'consent'` forces re-consent), which is why that
   flag is set explicitly.
6. The user copies that value into `GOOGLE_OAUTH_REFRESH_TOKEN` in
   `.env.local`, and adds all three (`GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`) to Vercel
   (Production and Preview environments) so it works on both `master` and
   `sajee` branch deployments.

This script is a one-time operational tool, not part of the app's runtime — it
is never imported by app code.

### 2. Swap the auth internals in `lib/google/drive.ts`

Current (lines 1-22):

```ts
import { GoogleAuth } from 'google-auth-library'
...
let _auth: GoogleAuth | null = null
function getAuth(): GoogleAuth {
  if (_auth) return _auth
  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY2 || process.env.GOOGLE_SERVICE_ACCOUNT_KEY)!
  const credentials = JSON.parse(raw)
  _auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/drive'] })
  return _auth
}
async function token(): Promise<string> {
  const client = await getAuth().getClient()
  const res = await (client as any).getAccessToken()
  return res.token as string
}
```

Becomes:

```ts
import { OAuth2Client } from 'google-auth-library'
...
let _oauthClient: OAuth2Client | null = null
function getOAuthClient(): OAuth2Client {
  if (_oauthClient) return _oauthClient
  _oauthClient = new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
  )
  _oauthClient.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN! })
  return _oauthClient
}
async function token(): Promise<string> {
  const res = await getOAuthClient().getAccessToken()
  if (!res.token) throw new Error('Failed to obtain Google OAuth access token')
  return res.token
}
```

`token()` keeps the same signature and behavior (returns a bearer token
string, throws on failure) — every other function in the file
(`getRootFolder`, `findOrCreate`, `getOrCreateClientFolder`,
`initResumableUpload`, `uploadFileToBackupFolder`, `getOrCreateMemberFolder`,
`uploadMemberDocument`, `makeFilePublic`) calls `token()` and needs zero
changes. `OAuth2Client.getAccessToken()` auto-refreshes the access token from
the refresh token as needed, same as `GoogleAuth`'s client did.

### Error handling

Unchanged — every Drive call site already treats Drive failures as
best-effort (catches, logs, and for the KYC/document-sync path queues a
retry). If the OAuth refresh token is ever revoked or expires, calls will fail
the same way they do today (loud in server logs, invisible to the end user,
retried by the existing cron) — not a new failure mode, just a different
credential behind the same `token()` call.

### Testing

No automated test for the OAuth exchange itself (it requires live interaction
with Google — same reason the original service-account path was never
unit-tested). Verification is a real end-to-end check after setup: repeat the
same direct-API write test used to diagnose this bug (`GET` the folder, then
attempt a real multipart file create) — this time using the OAuth-derived
token instead of the service-account token — and confirm the create succeeds
with 200 instead of 403. Then confirm a real KYC upload in the running app
actually produces a new file in the target Drive folder.

## Non-goals

- Fixing `GOOGLE_DRIVE_ROOT_FOLDER_ID` / `GOOGLE_DRIVE_BACKUP_FOLDER_ID` (separate,
  currently-unset env vars for unrelated features).
- Removing the now-unused service-account env vars or credentials.
- Any change to the `drive_sync_queue` retry table or its cron — they keep
  working as designed, just against a Drive call that now succeeds instead of
  always failing.
