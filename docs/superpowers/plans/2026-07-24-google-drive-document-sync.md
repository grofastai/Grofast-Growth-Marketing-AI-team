# Google Drive Document Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dual-write Admin Documents-tab uploads and member KYC uploads to Google Drive (best-effort), with a daily cron that retries anything that failed to sync, giving up after 5 failed days.

**Architecture:** Reuse the existing (currently unwired) `uploadMemberDoc()` action from `lib/actions/member-documents.ts`, which already handles Drive folder lookup/creation, file upload, and a `member_documents` success record. Add one new glue module (`lib/google/document-sync.ts`) that calls it and queues a `drive_sync_queue` row on failure. Two existing upload routes call this glue module after their Supabase Storage write succeeds. A new cron route retries queued rows once a day.

**Tech Stack:** Next.js Route Handlers, Supabase (Postgres + Storage), `googleapis`/`google-auth-library` (already installed), Vitest.

## Global Constraints

- Supabase Storage remains the source of truth; Drive sync must never block or fail the primary upload response.
- Only two upload paths sync to Drive: Admin Documents-tab uploads (`/api/documents/upload`) and KYC uploads (`/api/upload-photo` where `folder === "kyc"`). Profile/passport photos do **not** sync.
- Drive sync failures are queued in `drive_sync_queue`, retried once daily by cron at `30 13 * * *` UTC (7:00 PM IST), and given up on (`status = 'failed'`) after 5 failed attempts.
- Cron auth follows the existing pattern: `Authorization: Bearer $CRON_SECRET` header, checked against `process.env.CRON_SECRET`.
- No UI changes. No new columns on `documents` or `member_kyc`.
- Reference spec: `docs/superpowers/specs/2026-07-24-google-drive-document-sync-design.md`

---

### Task 1: `drive_sync_queue` migration

**Files:**
- Create: `supabase/migrations/112_drive_sync_queue.sql`

**Interfaces:**
- Produces: table `drive_sync_queue(id, company_id, user_id, name, storage_path, mime_type, status, attempts, last_error, last_attempt_at, created_at)` — consumed by Tasks 2 and 5.

- [ ] **Step 1: Write the migration**

```sql
-- Retry queue for documents/KYC files whose Google Drive sync failed on
-- first attempt. Rows are only ever inserted on failure — successful
-- syncs go straight to `member_documents` and never touch this table.
CREATE TABLE IF NOT EXISTS drive_sync_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  storage_path     text NOT NULL,
  mime_type        text NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed')),
  attempts         int NOT NULL DEFAULT 0,
  last_error       text,
  last_attempt_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE drive_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON drive_sync_queue
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
  );

CREATE INDEX IF NOT EXISTS drive_sync_queue_status_idx ON drive_sync_queue(status);
```

- [ ] **Step 2: Apply the migration**

This project has no linked Supabase CLI project (no `supabase/config.toml`), so migrations are applied via the Supabase Dashboard SQL Editor. Open the project's SQL Editor, paste the contents of `supabase/migrations/112_drive_sync_queue.sql`, and run it.

- [ ] **Step 3: Verify**

In the SQL Editor, run:

```sql
select column_name, data_type from information_schema.columns where table_name = 'drive_sync_queue';
```

Expected: 11 rows — `id`, `company_id`, `user_id`, `name`, `storage_path`, `mime_type`, `status`, `attempts`, `last_error`, `last_attempt_at`, `created_at`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/112_drive_sync_queue.sql
git commit -m "feat(drive-sync): add drive_sync_queue retry table"
```

---

### Task 2: Drive sync glue module

**Files:**
- Create: `lib/google/document-sync.ts`
- Test: `lib/google/document-sync.test.ts`

**Interfaces:**
- Consumes: `uploadMemberDoc(formData: FormData): Promise<{ error: string } | { success: true }>` from `lib/actions/member-documents.ts` (existing, unmodified).
- Produces:
  - `syncDocumentOrQueueRetry(params: { userId: string; companyId: string; file: File; storagePath: string }): Promise<void>` — used by Tasks 3 and 4.
  - `queueDriveRetry(params: { companyId: string; userId: string; name: string; storagePath: string; mimeType: string }): Promise<void>` — used internally, and by nothing else (kept exported for direct testing).
  - `nextRetryState(attempts: number): { attempts: number; status: "pending" | "failed" }` — used by Task 5.
  - `MAX_DRIVE_RETRY_ATTEMPTS = 5`

- [ ] **Step 1: Write the failing test for `nextRetryState`**

```typescript
// lib/google/document-sync.test.ts
import { describe, it, expect } from "vitest"
import { nextRetryState } from "./document-sync"

describe("nextRetryState", () => {
  it("stays pending before the 5th attempt", () => {
    expect(nextRetryState(0)).toEqual({ attempts: 1, status: "pending" })
    expect(nextRetryState(3)).toEqual({ attempts: 4, status: "pending" })
  })

  it("flips to failed on the 5th attempt", () => {
    expect(nextRetryState(4)).toEqual({ attempts: 5, status: "failed" })
  })

  it("stays failed for attempts beyond 5", () => {
    expect(nextRetryState(5)).toEqual({ attempts: 6, status: "failed" })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/google/document-sync.test.ts`
Expected: FAIL — `document-sync.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// lib/google/document-sync.ts
import { createClient } from "@supabase/supabase-js"
import { uploadMemberDoc } from "@/lib/actions/member-documents"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const MAX_DRIVE_RETRY_ATTEMPTS = 5

/** Pure: decides the next queue row state after a failed sync/retry attempt. */
export function nextRetryState(attempts: number): { attempts: number; status: "pending" | "failed" } {
  const nextAttempts = attempts + 1
  return {
    attempts: nextAttempts,
    status: nextAttempts >= MAX_DRIVE_RETRY_ATTEMPTS ? "failed" : "pending",
  }
}

/** Records a failed Drive sync so the daily cron will retry it. Never throws. */
export async function queueDriveRetry(params: {
  companyId: string
  userId: string
  name: string
  storagePath: string
  mimeType: string
}): Promise<void> {
  const admin = adminSupabase()
  const { error } = await admin.from("drive_sync_queue").insert({
    company_id: params.companyId,
    user_id: params.userId,
    name: params.name,
    storage_path: params.storagePath,
    mime_type: params.mimeType,
  })
  if (error) console.error("[drive-sync] failed to queue retry:", error)
}

/**
 * Best-effort: uploads `file` to the member's Google Drive folder via the
 * existing uploadMemberDoc action. Never throws — on any failure it queues
 * a drive_sync_queue row for the daily retry cron instead.
 */
export async function syncDocumentOrQueueRetry(params: {
  userId: string
  companyId: string
  file: File
  storagePath: string
}): Promise<void> {
  const { userId, companyId, file, storagePath } = params
  try {
    const form = new FormData()
    form.append("user_id", userId)
    form.append("company_id", companyId)
    form.append("file", file)
    const result = await uploadMemberDoc(form)
    if (result && "error" in result && result.error) throw new Error(result.error)
  } catch (err) {
    console.error("[drive-sync] sync failed, queuing for retry:", err)
    await queueDriveRetry({ companyId, userId, name: file.name, storagePath, mimeType: file.type })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/google/document-sync.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/google/document-sync.ts lib/google/document-sync.test.ts
git commit -m "feat(drive-sync): add best-effort Drive sync + retry-queue helper"
```

---

### Task 3: Wire Documents-tab upload to Drive sync

**Files:**
- Modify: `app/api/documents/upload/route.ts:1-56`

**Interfaces:**
- Consumes: `syncDocumentOrQueueRetry` from Task 2.

- [ ] **Step 1: Add the import and call**

In `app/api/documents/upload/route.ts`, add the import at the top:

```typescript
import { syncDocumentOrQueueRetry } from "@/lib/google/document-sync"
```

Then change the end of the `POST` handler from:

```typescript
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ success: true, url: publicUrl })
}
```

to:

```typescript
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  await syncDocumentOrQueueRetry({ userId, companyId: profile.company_id, file, storagePath: path })

  return NextResponse.json({ success: true, url: publicUrl })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Start the dev server (`pnpm dev`), sign in as an admin, go to Admin → Documents, select a member, and upload a document. Confirm:
1. The upload succeeds and the document appears in the Documents tab (unchanged behavior).
2. A new row appears in the `member_documents` Supabase table for that user.
3. The file appears in the member's folder in Google Drive (under the folder configured by `GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID`).

- [ ] **Step 4: Commit**

```bash
git add app/api/documents/upload/route.ts
git commit -m "feat(drive-sync): sync Documents-tab uploads to Google Drive"
```

---

### Task 4: Wire KYC upload to Drive sync

**Files:**
- Modify: `app/api/upload-photo/route.ts:1-43`

**Interfaces:**
- Consumes: `syncDocumentOrQueueRetry` from Task 2.

- [ ] **Step 1: Add the import and the KYC-only sync call**

In `app/api/upload-photo/route.ts`, add the import:

```typescript
import { syncDocumentOrQueueRetry } from "@/lib/google/document-sync"
```

Change the end of the `POST` handler from:

```typescript
  const { data: { publicUrl } } = admin.storage.from("documents").getPublicUrl(path)
  return NextResponse.json({ url: publicUrl })
}
```

to:

```typescript
  const { data: { publicUrl } } = admin.storage.from("documents").getPublicUrl(path)

  if (folder === "kyc") {
    const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
    if (profile) {
      await syncDocumentOrQueueRetry({ userId: user.id, companyId: profile.company_id, file, storagePath: path })
    }
  }

  return NextResponse.json({ url: publicUrl })
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Manual verification**

In the dev server, go to a member profile (or Admin → Profile), edit KYC, upload a Govt ID photo. Confirm:
1. The KYC field saves and displays as before (unchanged behavior).
2. A new row appears in `member_documents` for that user.
3. The file appears in the member's Google Drive folder.
4. Upload a **passport/profile photo** (not KYC) and confirm no `member_documents` row is created for it — the `folder !== "kyc"` guard must exclude it.

- [ ] **Step 4: Commit**

```bash
git add app/api/upload-photo/route.ts
git commit -m "feat(drive-sync): sync KYC uploads to Google Drive"
```

---

### Task 5: Retry cron route

**Files:**
- Create: `app/api/cron/drive-retry/route.ts`
- Test: `app/api/cron/drive-retry/route.test.ts`

**Interfaces:**
- Consumes: `nextRetryState` from Task 2; `uploadMemberDoc` from `lib/actions/member-documents.ts` (existing); `drive_sync_queue` table from Task 1.
- Produces: `GET` handler at `/api/cron/drive-retry`, consumed by Task 6's `vercel.json` entry.

- [ ] **Step 1: Write the failing auth-guard test**

```typescript
// app/api/cron/drive-retry/route.test.ts
import { describe, it, expect } from "vitest"
import { GET } from "./route"
import { NextRequest } from "next/server"

function makeRequest(authHeader?: string) {
  const headers = new Headers()
  if (authHeader) headers.set("authorization", authHeader)
  return new NextRequest(new URL("http://localhost/api/cron/drive-retry"), { headers })
}

describe("GET /api/cron/drive-retry", () => {
  it("returns 401 with no auth", async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it("returns 401 with wrong cron secret", async () => {
    process.env.CRON_SECRET = "correct"
    const res = await GET(makeRequest("Bearer wrong"))
    expect(res.status).toBe(401)
    delete process.env.CRON_SECRET
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/api/cron/drive-retry/route.test.ts`
Expected: FAIL — route file doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```typescript
// app/api/cron/drive-retry/route.ts
export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { uploadMemberDoc } from '@/lib/actions/member-documents'
import { nextRetryState } from '@/lib/google/document-sync'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`
}

// Runs once daily at 7:00 PM IST (see vercel.json). Retries every pending
// drive_sync_queue row by re-downloading the file from Supabase Storage
// and re-attempting the Drive upload. Gives up (status='failed') after
// MAX_DRIVE_RETRY_ATTEMPTS failed days.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = adminSupabase()

  const { data: queued, error } = await admin
    .from('drive_sync_queue')
    .select('id, company_id, user_id, name, storage_path, mime_type, attempts')
    .eq('status', 'pending')

  if (error) {
    console.error('[drive-retry] failed to fetch queue:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let retried = 0
  let succeeded = 0
  let gaveUp = 0

  for (const row of queued ?? []) {
    retried++
    try {
      const { data: blob, error: dlErr } = await admin.storage.from('documents').download(row.storage_path)
      if (dlErr || !blob) throw new Error(dlErr?.message ?? 'download returned no data')

      const file = new File([blob], row.name, { type: row.mime_type })
      const form = new FormData()
      form.append('user_id', row.user_id)
      form.append('company_id', row.company_id)
      form.append('file', file)

      const result = await uploadMemberDoc(form)
      if (result && 'error' in result && result.error) throw new Error(result.error)

      await admin.from('drive_sync_queue').delete().eq('id', row.id)
      succeeded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[drive-retry] retry failed for queue row ${row.id}:`, message)
      const next = nextRetryState(row.attempts)
      await admin.from('drive_sync_queue').update({
        attempts: next.attempts,
        status: next.status,
        last_error: message,
        last_attempt_at: new Date().toISOString(),
      }).eq('id', row.id)
      if (next.status === 'failed') gaveUp++
    }
  }

  console.log(`[drive-retry] retried=${retried} succeeded=${succeeded} gave-up=${gaveUp}`)
  return NextResponse.json({ retried, succeeded, gaveUp })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test app/api/cron/drive-retry/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/cron/drive-retry/route.ts app/api/cron/drive-retry/route.test.ts
git commit -m "feat(drive-sync): add daily retry cron for failed Drive syncs"
```

---

### Task 6: Register the cron in `vercel.json`

**Files:**
- Modify: `vercel.json:76-78`

**Interfaces:**
- Consumes: `/api/cron/drive-retry` route from Task 5.

- [ ] **Step 1: Add the cron entry**

In `vercel.json`, change:

```json
    { "path": "/api/cron/db-backup", "schedule": "30 3 * * 0" }
  ]
}
```

to:

```json
    { "path": "/api/cron/db-backup", "schedule": "30 3 * * 0" },
    { "path": "/api/cron/drive-retry", "schedule": "30 13 * * *" }
  ]
}
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat(drive-sync): register drive-retry cron at 7pm IST daily"
```

---

### Task 7: Failure-path verification and deploy checklist

**Files:**
- None (manual verification only — no code changes).

- [ ] **Step 1: Verify the queue-and-retry path end to end**

With the dev server running, temporarily set `GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID` in `.env.local` to an invalid folder ID (or comment it out) to force Drive calls to fail, then restart `pnpm dev`.

- [ ] **Step 2: Trigger a failure and confirm queuing**

Upload a document via Admin → Documents. Confirm:
1. The upload still succeeds for the admin (no error shown) — this is the "best-effort, never blocks" guarantee.
2. A row appears in `drive_sync_queue` with `status = 'pending'`, `attempts = 0`.

- [ ] **Step 3: Restore the env var and trigger the cron manually**

Restore the correct `GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID` value and restart `pnpm dev`. Then call the cron route directly with the correct secret:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/drive-retry
```

Expected: JSON response with `succeeded: 1`, and the `drive_sync_queue` row from Step 2 is gone; a `member_documents` row now exists for that file.

- [ ] **Step 4: Confirm production environment variables**

Check the Vercel project's production environment variables (Vercel Dashboard → Project → Settings → Environment Variables, or `vercel env ls production` if the Vercel CLI is installed) and confirm both `GOOGLE_SERVICE_ACCOUNT_KEY` and `GOOGLE_DRIVE_MEMBER_DOCS_FOLDER_ID` are present for the Production environment (they're already confirmed present in `.env.local` for local dev). If either is missing in production, add it before this ships — otherwise every sync in production will fail and queue for retry, and cron will never succeed either.

- [ ] **Step 5: Push and notify**

Once all tasks are committed on the `sajee` branch: `git push origin sajee`, then let Sanjay know it's ready to merge (per the project's branch workflow — Sanjay merges `sajee` into `master`).
