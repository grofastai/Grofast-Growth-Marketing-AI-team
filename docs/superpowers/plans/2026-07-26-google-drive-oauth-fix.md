# Google Drive OAuth Auth Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Tasks 1 and 3 require the human account owner to act in their own browser — they cannot be completed by an agent alone.** Stop and wait for them at those tasks.

**Goal:** Replace the broken service-account auth in `lib/google/drive.ts` with OAuth 2.0 authorizing the real Gmail account, so Drive writes stop failing with `403 storageQuotaExceeded`.

**Architecture:** A one-time interactive script (`scripts/google-drive-oauth-setup.ts`) walks the account owner through Google's OAuth consent flow and prints a refresh token. That refresh token, plus a client ID/secret from a new OAuth Client the owner creates in Google Cloud Console, become three new env vars. `lib/google/drive.ts`'s internal `token()` helper is swapped to mint access tokens from those three values via `OAuth2Client` instead of from the service-account JSON — every other function in that file is unchanged.

**Tech Stack:** `google-auth-library` (already a dependency, v10.6.2) — no new packages.

## Global Constraints

- Redirect URI is exactly `http://localhost:53682/oauth2callback` — must match character-for-character between the script and the Google Cloud Console OAuth Client config.
- Scope requested is `https://www.googleapis.com/auth/drive` (full Drive access) — matches what the service account was already scoped for, so no folder-permission changes are needed.
- `access_type: 'offline'` and `prompt: 'consent'` are both required on `generateAuthUrl` — without them Google will not return a `refresh_token`.
- No change to any function signature in `lib/google/drive.ts` other than the internal `getAuth`/`token` pair — every consumer (`lib/actions/member-documents.ts`, both upload routes, the drive-retry cron, the media-tracker client-folder flow, the DB-backup cron) must keep working with zero edits.
- `OAuth2Client`'s constructor takes an options object (`{ clientId, clientSecret, redirectUri }`) — the positional-arguments form is deprecated in the installed version (v10) and must not be used.

---

## File Structure

- **Create** `scripts/google-drive-oauth-setup.ts` — one-time interactive CLI tool. Never imported by app code.
- **Modify** `package.json` — add a `drive:oauth-setup` script entry.
- **Modify** `lib/google/drive.ts` — swap `getAuth()`/`token()` internals (lines 1, 8-22) from `GoogleAuth`/service-account to `OAuth2Client`/refresh-token.
- **Modify** `.env.local` — add `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (Task 1), then `GOOGLE_OAUTH_REFRESH_TOKEN` (Task 3). Not committed to git (already gitignored, same as the rest of this file).

---

### Task 1: Create the OAuth Client in Google Cloud Console

**This task requires the account owner — an agent cannot complete it.**

**Files:** none (external console configuration).

- [ ] **Step 1: Open the credentials page for the existing project**

Go to: `https://console.cloud.google.com/apis/credentials?project=grofast-app`

(This is the same Google Cloud project the existing service account
`grofast-app@grofast-app.iam.gserviceaccount.com` already lives in — confirmed
via `project_id: "grofast-app"` when the service account credentials were
inspected while diagnosing the original bug.)

- [ ] **Step 2: Confirm the Drive API is enabled**

In the left sidebar, go to **APIs & Services → Enabled APIs & services**. If
"Google Drive API" isn't listed, go to **APIs & Services → Library**, search
"Google Drive API", and click **Enable**. (It's very likely already enabled —
the service account was already successfully making Drive API `GET` calls.)

- [ ] **Step 3: Configure the OAuth consent screen (first time only)**

Go to **APIs & Services → OAuth consent screen**. If not already configured:
- User Type: **External** (this is a personal Gmail account, not Workspace —
  "Internal" isn't available)
- App name: `GroFast Drive Sync` (or anything recognizable)
- User support email: the real Gmail account being authorized
- Scopes: skip / leave default for now (the script requests the scope directly)
- Test users: add the real Gmail account's own address here — required while
  the app is in "Testing" publishing status

- [ ] **Step 4: Create the OAuth Client ID**

Go to **APIs & Services → Credentials → + Create Credentials → OAuth client ID**.
- Application type: **Desktop app**
- Name: `GroFast Drive OAuth Setup`
- Click **Create**

Google shows a **Client ID** and **Client secret** — copy both, they're needed
in Task 2.

- [ ] **Step 5: Add the redirect URI**

Click into the OAuth client you just created (or **Edit** from the credentials
list) → **Authorized redirect URIs** → **Add URI** → enter exactly:

```
http://localhost:53682/oauth2callback
```

Save.

- [ ] **Step 6: Add the client ID and secret to `.env.local`**

Open `.env.local` and add two new lines (using the values from Step 4):

```
GOOGLE_OAUTH_CLIENT_ID=<the client ID from Step 4>
GOOGLE_OAUTH_CLIENT_SECRET=<the client secret from Step 4>
```

---

### Task 2: Build the OAuth setup script

**Files:**
- Create: `scripts/google-drive-oauth-setup.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` from `.env.local` (Task 1).
- Produces: prints a `refresh_token` string to the terminal for the user to copy into `.env.local` in Task 3.

- [ ] **Step 1: Create the script**

Create `scripts/google-drive-oauth-setup.ts`:

```ts
/**
 * One-time interactive setup: obtains a Google OAuth refresh token for Drive access.
 *
 * 1. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to .env.local first
 *    (from the OAuth Client ID created in Google Cloud Console).
 * 2. Run: pnpm drive:oauth-setup
 * 3. Open the printed URL, log in with the real Gmail account, click Allow.
 * 4. Copy the printed refresh token into GOOGLE_OAUTH_REFRESH_TOKEN in .env.local
 *    (and into Vercel's Production + Preview env vars).
 */
import { OAuth2Client } from "google-auth-library"
import * as http from "http"
import * as fs from "fs"
import * as path from "path"

const PORT = 53682
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`

function loadEnvLocal(): Record<string, string> {
  const envPath = path.join(__dirname, "..", ".env.local")
  const text = fs.readFileSync(envPath, "utf8")
  const env: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, "")
  }
  return env
}

async function main() {
  const env = loadEnvLocal()
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    console.error("Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET in .env.local")
    console.error("Create an OAuth Client ID (Desktop app) in Google Cloud Console first.")
    process.exit(1)
  }

  const oauth2Client = new OAuth2Client({ clientId, clientSecret, redirectUri: REDIRECT_URI })
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive"],
  })

  console.log("\nOpen this URL in your browser, log in with your real Gmail account, and click Allow:\n")
  console.log(authUrl)
  console.log(`\nWaiting for you to complete sign-in (listening on ${REDIRECT_URI})...\n`)

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return
      const url = new URL(req.url, REDIRECT_URI)
      const codeParam = url.searchParams.get("code")
      const errorParam = url.searchParams.get("error")
      if (errorParam) {
        res.writeHead(400, { "Content-Type": "text/plain" })
        res.end("Authorization failed — you can close this tab.")
        server.close()
        reject(new Error(`OAuth error: ${errorParam}`))
        return
      }
      if (codeParam) {
        res.writeHead(200, { "Content-Type": "text/plain" })
        res.end("Authorization complete — you can close this tab and return to the terminal.")
        server.close()
        resolve(codeParam)
      }
    })
    server.listen(PORT)
  })

  const { tokens } = await oauth2Client.getToken(code)
  if (!tokens.refresh_token) {
    console.error("\nNo refresh_token returned. This usually means the account already granted")
    console.error("consent before. Revoke access at https://myaccount.google.com/permissions")
    console.error("for this app, then run this script again.")
    process.exit(1)
  }

  console.log("\nSuccess! Add this to .env.local as GOOGLE_OAUTH_REFRESH_TOKEN,")
  console.log("and to Vercel (Production + Preview env vars):\n")
  console.log(tokens.refresh_token)
  console.log()
}

main().catch(err => {
  console.error("Setup failed:", err)
  process.exit(1)
})
```

- [ ] **Step 2: Register the npm script**

In `package.json`, add this line inside `"scripts"` (next to the existing
`"generate:images"` / `"chatgpt:login"` entries, which use the same
`ts-node --project scripts/tsconfig.json` pattern):

```json
    "drive:oauth-setup": "ts-node --project scripts/tsconfig.json scripts/google-drive-oauth-setup.ts"
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: passes with no errors (the script isn't imported by app code, so this
just confirms the script itself is valid TypeScript against `scripts/tsconfig.json`'s
settings — run `npx tsc --noEmit --project scripts/tsconfig.json` if you want
to check the script file specifically, since the root `tsconfig.json` may not
include the `scripts/` directory).

- [ ] **Step 4: Commit**

```bash
git add scripts/google-drive-oauth-setup.ts package.json
git commit -m "feat: add one-time Google Drive OAuth setup script"
```

---

### Task 3: Run the setup script and obtain the refresh token

**This task requires the account owner — an agent cannot complete it (it opens
a real browser and requires a real Google login).**

**Files:**
- Modify: `.env.local`

- [ ] **Step 1: Run the script**

Run: `pnpm drive:oauth-setup`

Expected: prints a Google consent URL.

- [ ] **Step 2: Complete the consent flow**

Open the printed URL in a browser. Log in with the real Gmail account (the one
that already owns/has access to the `GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID`
folder). Click **Allow** on the consent screen. The browser tab should show
"Authorization complete" and the terminal should print a refresh token.

- [ ] **Step 3: Add the refresh token to `.env.local`**

Add this line to `.env.local`:

```
GOOGLE_OAUTH_REFRESH_TOKEN=<the value printed in Step 2>
```

- [ ] **Step 4: Add all three env vars to Vercel**

In the Vercel project dashboard, add `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REFRESH_TOKEN` to both
**Production** and **Preview** environments (Preview is needed so the `sajee`
branch deployment can also sync to Drive during testing).

---

### Task 4: Swap the auth internals in `lib/google/drive.ts`

**Files:**
- Modify: `lib/google/drive.ts:1`, `lib/google/drive.ts:8-22`

**Interfaces:**
- Consumes: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` from `.env.local` (Tasks 1 and 3).
- Produces: `token(): Promise<string>` — same name, same signature, same behavior (returns a bearer token, throws on failure) as before. Every other function below it in this file (`getRootFolder`, `findOrCreate`, `getOrCreateClientFolder`, `initResumableUpload`, `uploadFileToBackupFolder`, `getOrCreateMemberFolder`, `uploadMemberDocument`, `makeFilePublic`) calls this and needs **no changes**.

- [ ] **Step 1: Replace the import**

Find (line 1):

```ts
import { GoogleAuth } from 'google-auth-library'
```

Replace with:

```ts
import { OAuth2Client } from 'google-auth-library'
```

- [ ] **Step 2: Replace the auth internals**

Find (lines 8-22):

```ts
// ── Auth ──────────────────────────────────────────────────────

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

Replace with:

```ts
// ── Auth ──────────────────────────────────────────────────────
// OAuth on the real Gmail account, not a service account — service accounts
// have zero storage quota of their own, and this project has no Shared Drive
// (regular Gmail, not Workspace) to give one a home. See
// docs/superpowers/specs/2026-07-26-google-drive-oauth-fix-design.md.

let _oauthClient: OAuth2Client | null = null

function getOAuthClient(): OAuth2Client {
  if (_oauthClient) return _oauthClient
  _oauthClient = new OAuth2Client({
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
  })
  _oauthClient.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN! })
  return _oauthClient
}

async function token(): Promise<string> {
  const res = await getOAuthClient().getAccessToken()
  if (!res.token) throw new Error('Failed to obtain Google OAuth access token')
  return res.token
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/google/drive.ts
git commit -m "fix(drive-sync): authenticate as the real account via OAuth, not a service account"
```

---

### Task 5: Verify the fix end-to-end

**Files:** none (verification only — reuses the same diagnostic approach used to find the original bug).

- [ ] **Step 1: Direct API write test**

Run a one-off script (delete it after, same as any scratch diagnostic — do not
commit it) that mirrors the original bug repro but uses the new OAuth path:

```ts
// scratch-verify-drive-oauth.mjs — delete after running
import { OAuth2Client } from 'google-auth-library'
import { readFileSync } from 'fs'

const envText = readFileSync('.env.local', 'utf8')
const env = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
}

const client = new OAuth2Client({ clientId: env.GOOGLE_OAUTH_CLIENT_ID, clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET })
client.setCredentials({ refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN })
const { token } = await client.getAccessToken()

const folderId = env.GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID
const BOUNDARY = 'verify_boundary'
const metadata = JSON.stringify({ name: '__oauth_verify_delete_me.txt', parents: [folderId] })
const body = [
  `--${BOUNDARY}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, metadata,
  `\r\n--${BOUNDARY}\r\nContent-Type: text/plain\r\n\r\n`, 'oauth verify test',
  `\r\n--${BOUNDARY}--`,
].join('')

const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name', {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${BOUNDARY}` }, body,
})
console.log('status:', res.status)
const created = await res.json()
console.log(created)

if (res.ok) {
  await fetch(`https://www.googleapis.com/drive/v3/files/${created.id}?supportsAllDrives=true`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
  })
  console.log('cleaned up test file')
}
```

Run: `node scratch-verify-drive-oauth.mjs`
Expected: `status: 200` and a JSON object with `id`/`name` — **not** the
`403 storageQuotaExceeded` error from before. Then delete the scratch file.

- [ ] **Step 2: Real end-to-end upload through the app**

Run: `pnpm dev`. Sign in as a MEMBER, go to `/member/profile`, and upload a KYC
document (any of the Aadhaar/PAN/ration-card fields). Then open the target
Drive folder (`https://drive.google.com/drive/folders/<GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID>`)
in a browser and confirm a subfolder for that member now exists containing the
uploaded file.

- [ ] **Step 3: Confirm no regressions in the retry queue**

Run this query against Supabase (SQL editor or `psql`) to confirm no new rows
are landing in the retry queue after Step 2's upload:

```sql
select * from drive_sync_queue order by created_at desc limit 5;
```

Expected: no new row for the document uploaded in Step 2 (if a new row *does*
appear, the sync is still failing — re-check Task 4's env vars and Task 1's
redirect URI for typos before re-running Step 1).
