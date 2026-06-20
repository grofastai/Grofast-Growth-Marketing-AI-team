# Freelancer Module — Full Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing basic freelancer list into a full freelancer management system with per-freelancer profile tabs (Overview, Work Entries, Payments, Statements, Activity), approval workflow, and separate payment tracking.

**Architecture:** The existing `/admin/freelancers` page (list) stays and is extended with payment stats. A new dynamic route `/admin/freelancers/[id]` serves the 5-tab profile. Payments are tracked in a new `freelancer_payments` table (separate from work entries). Work entry approval uses a new `approval_status` column. Activity is auto-logged into `freelancer_activity_logs` by each action.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL + RLS), TypeScript, Tailwind CSS v4, Server Actions, jsPDF (for PDF statement download)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/070_freelancer_payments_approval.sql` | CREATE | New tables + column additions |
| `lib/actions/freelancers.ts` | MODIFY | Add approveWorkEntry, rejectWorkEntry |
| `lib/actions/freelancer-payments.ts` | CREATE | addPayment, deletePayment |
| `lib/actions/freelancer-activity.ts` | CREATE | logActivity helper used by all actions |
| `app/admin/freelancers/page.tsx` | MODIFY | Add pendingTotal + thisMonthPaid stats |
| `app/admin/freelancers/freelancers-client.tsx` | MODIFY | Show pending amount + last paid date on cards |
| `app/admin/freelancers/[id]/page.tsx` | CREATE | Profile server component (fetches all tab data) |
| `app/admin/freelancers/[id]/profile-client.tsx` | CREATE | 5-tab profile UI |
| `app/admin/freelancers/[id]/statement/page.tsx` | CREATE | Print-friendly statement page |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/070_freelancer_payments_approval.sql`
- Apply via: Supabase MCP `execute_sql`

- [ ] **Step 1: Check existing freelancer_work_entries columns**

Run in Supabase MCP `execute_sql`:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'freelancer_work_entries'
ORDER BY ordinal_position;
```
Note which columns already exist (especially approval_status, approved_by, approved_at).

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/070_freelancer_payments_approval.sql`:
```sql
-- Add approval flow to work entries
ALTER TABLE freelancer_work_entries
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS date date NOT NULL DEFAULT CURRENT_DATE;

-- Add payment fields to freelancers table
ALTER TABLE freelancers
  ADD COLUMN IF NOT EXISTS upi_id text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS ifsc text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS location text;

-- Separate payments table
CREATE TABLE IF NOT EXISTS freelancer_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  freelancer_id   uuid NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method  text NOT NULL CHECK (payment_method IN ('upi', 'cash', 'bank_transfer')),
  reference_number text,
  notes           text,
  paid_date       date NOT NULL DEFAULT CURRENT_DATE,
  paid_by         uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE freelancer_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON freelancer_payments
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Activity logs
CREATE TABLE IF NOT EXISTS freelancer_activity_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  action        text NOT NULL,
  actor_id      uuid REFERENCES users(id),
  actor_name    text,
  remarks       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE freelancer_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON freelancer_activity_logs
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_freelancer_payments_freelancer ON freelancer_payments(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_freelancer_activity_freelancer ON freelancer_activity_logs(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_freelancer_work_entries_approval ON freelancer_work_entries(approval_status);
```

- [ ] **Step 3: Apply migration via Supabase MCP**

Use `mcp__plugin_supabase_supabase__execute_sql` with project_id `bxyozelldqerlvtjwsai` to run the SQL above.

- [ ] **Step 4: Verify tables created**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('freelancer_payments', 'freelancer_activity_logs')
AND table_schema = 'public';
```
Expected: 2 rows returned.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/070_freelancer_payments_approval.sql
git commit -m "feat: freelancer payments + activity log tables + work entry approval columns"
```

---

## Task 2: Activity Log Helper Action

**Files:**
- Create: `lib/actions/freelancer-activity.ts`

- [ ] **Step 1: Create the file**

```typescript
'use server'

import { createClient } from '@supabase/supabase-js'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function logFreelancerActivity({
  companyId,
  freelancerId,
  action,
  actorId,
  actorName,
  remarks,
}: {
  companyId: string
  freelancerId: string
  action: string
  actorId?: string
  actorName?: string
  remarks?: string
}) {
  const admin = adminClient()
  await admin.from('freelancer_activity_logs').insert({
    company_id:    companyId,
    freelancer_id: freelancerId,
    action,
    actor_id:   actorId ?? null,
    actor_name: actorName ?? null,
    remarks:    remarks ?? null,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/actions/freelancer-activity.ts
git commit -m "feat: freelancer activity log helper action"
```

---

## Task 3: Work Entry Approval Actions

**Files:**
- Modify: `lib/actions/freelancers.ts`

- [ ] **Step 1: Read the top of the file to confirm imports**

Read `lib/actions/freelancers.ts` lines 1-20 to see existing imports and `createAdminClient` definition.

- [ ] **Step 2: Add approveWorkEntry and rejectWorkEntry at the bottom of the file**

```typescript
export async function approveWorkEntry(
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: actor } = await admin
    .from('users')
    .select('company_id, name, role')
    .eq('id', user.id)
    .single()
  if (!actor || !['ADMIN', 'MEMBER'].includes(actor.role)) {
    return { success: false, error: 'Permission denied' }
  }

  const { data: entry } = await admin
    .from('freelancer_work_entries')
    .select('freelancer_id, company_id, amount, work_title')
    .eq('id', entryId)
    .single()

  if (!entry) return { success: false, error: 'Entry not found' }

  const { error } = await admin
    .from('freelancer_work_entries')
    .update({ approval_status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', entryId)

  if (error) return { success: false, error: error.message }

  await logFreelancerActivity({
    companyId:    entry.company_id,
    freelancerId: entry.freelancer_id,
    action:       `Work entry approved: ${entry.work_title} (₹${entry.amount})`,
    actorId:      user.id,
    actorName:    actor.name,
  })

  revalidatePath(`/admin/freelancers/${entry.freelancer_id}`)
  return { success: true }
}

export async function rejectWorkEntry(
  entryId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: actor } = await admin
    .from('users')
    .select('company_id, name, role')
    .eq('id', user.id)
    .single()
  if (!actor || !['ADMIN', 'MEMBER'].includes(actor.role)) {
    return { success: false, error: 'Permission denied' }
  }

  const { data: entry } = await admin
    .from('freelancer_work_entries')
    .select('freelancer_id, company_id, work_title')
    .eq('id', entryId)
    .single()

  if (!entry) return { success: false, error: 'Entry not found' }

  const { error } = await admin
    .from('freelancer_work_entries')
    .update({ approval_status: 'rejected', rejected_reason: reason, approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', entryId)

  if (error) return { success: false, error: error.message }

  await logFreelancerActivity({
    companyId:    entry.company_id,
    freelancerId: entry.freelancer_id,
    action:       `Work entry rejected: ${entry.work_title}`,
    actorId:      user.id,
    actorName:    actor.name,
    remarks:      reason,
  })

  revalidatePath(`/admin/freelancers/${entry.freelancer_id}`)
  return { success: true }
}
```

Add the import at the top of `lib/actions/freelancers.ts`:
```typescript
import { logFreelancerActivity } from './freelancer-activity'
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/freelancers.ts
git commit -m "feat: approve/reject work entry actions with activity logging"
```

---

## Task 4: Payment Server Actions

**Files:**
- Create: `lib/actions/freelancer-payments.ts`

- [ ] **Step 1: Create the file**

```typescript
'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { logFreelancerActivity } from './freelancer-activity'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function addFreelancerPayment(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: actor } = await admin
    .from('users')
    .select('company_id, name, role')
    .eq('id', user.id)
    .single()
  if (!actor) return { success: false, error: 'User not found' }

  const freelancerId    = formData.get('freelancer_id') as string
  const amount          = parseFloat(formData.get('amount') as string)
  const paymentMethod   = formData.get('payment_method') as string
  const referenceNumber = formData.get('reference_number') as string | null
  const notes           = formData.get('notes') as string | null
  const paidDate        = formData.get('paid_date') as string

  if (!freelancerId || isNaN(amount) || amount <= 0) {
    return { success: false, error: 'Invalid payment data' }
  }

  const { error } = await admin.from('freelancer_payments').insert({
    company_id:       actor.company_id,
    freelancer_id:    freelancerId,
    amount,
    payment_method:   paymentMethod,
    reference_number: referenceNumber || null,
    notes:            notes || null,
    paid_date:        paidDate,
    paid_by:          user.id,
  })

  if (error) return { success: false, error: error.message }

  await logFreelancerActivity({
    companyId:    actor.company_id,
    freelancerId,
    action:       `Payment added: ₹${amount.toLocaleString('en-IN')} via ${paymentMethod}`,
    actorId:      user.id,
    actorName:    actor.name,
    remarks:      referenceNumber ? `Ref: ${referenceNumber}` : undefined,
  })

  revalidatePath(`/admin/freelancers/${freelancerId}`)
  revalidatePath('/admin/freelancers')
  return { success: true }
}

export async function deleteFreelancerPayment(
  paymentId: string,
  freelancerId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'Not authenticated' }

  const admin = createAdminClient()

  const { data: actor } = await admin
    .from('users')
    .select('company_id, name, role')
    .eq('id', user.id)
    .single()
  if (actor?.role !== 'ADMIN') return { success: false, error: 'Admin only' }

  const { data: payment } = await admin
    .from('freelancer_payments')
    .select('amount, payment_method')
    .eq('id', paymentId)
    .single()

  const { error } = await admin
    .from('freelancer_payments')
    .delete()
    .eq('id', paymentId)

  if (error) return { success: false, error: error.message }

  await logFreelancerActivity({
    companyId:    actor.company_id,
    freelancerId,
    action:       `Payment deleted: ₹${payment?.amount} (${payment?.payment_method})`,
    actorId:      user.id,
    actorName:    actor.name,
  })

  revalidatePath(`/admin/freelancers/${freelancerId}`)
  revalidatePath('/admin/freelancers')
  return { success: true }
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/freelancer-payments.ts
git commit -m "feat: freelancer payment add/delete server actions"
```

---

## Task 5: Freelancer Profile Server Page

**Files:**
- Create: `app/admin/freelancers/[id]/page.tsx`

This is the server component. It fetches all data for all 5 tabs in one page load.

- [ ] **Step 1: Create the directory and file**

Create `app/admin/freelancers/[id]/page.tsx`:

```typescript
export const revalidate = 0

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect, notFound } from "next/navigation"
import FreelancerProfileClient from "./profile-client"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function FreelancerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()

  const { data: profile } = await admin
    .from("users")
    .select("company_id, name, role")
    .eq("id", user.id)
    .single()

  if (!profile?.company_id) redirect("/login")
  const cid = profile.company_id

  const [
    { data: freelancer },
    { data: workEntries },
    { data: payments },
    { data: activityLogs },
    { data: approverRows },
  ] = await Promise.all([
    admin.from("freelancers").select("*").eq("id", id).eq("company_id", cid).single(),
    admin.from("freelancer_work_entries")
      .select("*")
      .eq("freelancer_id", id)
      .eq("company_id", cid)
      .order("date", { ascending: false }),
    admin.from("freelancer_payments")
      .select("*")
      .eq("freelancer_id", id)
      .eq("company_id", cid)
      .order("paid_date", { ascending: false }),
    admin.from("freelancer_activity_logs")
      .select("*")
      .eq("freelancer_id", id)
      .eq("company_id", cid)
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("users")
      .select("id, name")
      .eq("company_id", cid)
      .in("role", ["ADMIN"]),
  ])

  if (!freelancer) notFound()

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  const approvedEntries = (workEntries ?? []).filter(e => e.approval_status === "approved")
  const totalEarned     = approvedEntries.reduce((s: number, e: { amount?: number }) => s + (e.amount ?? 0), 0)
  const thisMonthEarned = approvedEntries
    .filter((e: { date?: string }) => (e.date ?? "") >= monthStart)
    .reduce((s: number, e: { amount?: number }) => s + (e.amount ?? 0), 0)
  const totalPaid       = (payments ?? []).reduce((s: number, p: { amount?: number }) => s + (p.amount ?? 0), 0)
  const thisMonthPaid   = (payments ?? [])
    .filter((p: { paid_date?: string }) => (p.paid_date ?? "") >= monthStart)
    .reduce((s: number, p: { amount?: number }) => s + (p.amount ?? 0), 0)
  const pendingBalance  = totalEarned - totalPaid

  return (
    <FreelancerProfileClient
      freelancer={freelancer}
      workEntries={workEntries ?? []}
      payments={payments ?? []}
      activityLogs={activityLogs ?? []}
      currentUserId={user.id}
      currentUserName={profile.name}
      currentUserRole={profile.role}
      stats={{
        pendingBalance,
        thisMonthEarned,
        totalEarned,
        thisMonthPaid,
        totalWorks: approvedEntries.length,
      }}
    />
  )
}
```

- [ ] **Step 2: Run typecheck (will fail — profile-client not created yet, that's OK)**

```bash
pnpm typecheck 2>&1 | grep "freelancers/\[id\]"
```
Expected: error about missing `profile-client` module — that's fine, next task creates it.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/freelancers/[id]/page.tsx"
git commit -m "feat: freelancer profile server page — fetches all 5-tab data"
```

---

## Task 6: Freelancer Profile Client — Tabs Shell + Tab 1 Overview

**Files:**
- Create: `app/admin/freelancers/[id]/profile-client.tsx`

Build the shell with 5 tabs and implement Tab 1 (Overview) fully.

- [ ] **Step 1: Create the file with the tab shell and Overview tab**

Create `app/admin/freelancers/[id]/profile-client.tsx`:

```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, User, Briefcase, Phone, MapPin, CreditCard,
  IndianRupee, CheckCircle2, Clock, X, TrendingUp,
  FileText, Activity, Plus,
} from "lucide-react"
import Link from "next/link"

// ── Types ────────────────────────────────────────────────────────────────────

export type FreelancerRecord = {
  id: string; name: string; type: string; phone?: string | null
  whatsapp?: string | null; location?: string | null; upi_id?: string | null
  bank_name?: string | null; account_number?: string | null; ifsc?: string | null
  notes?: string | null; status: string; rating?: number
  cost_per_video?: number | null; cost_per_minute?: number | null; cost_per_hour?: number | null
  created_at: string
}

export type WorkEntryRecord = {
  id: string; date: string; client_name?: string | null; work_title: string
  work_type?: string | null; quantity?: number | null; rate?: number | null
  amount: number; approval_status: string; rejected_reason?: string | null
  notes?: string | null; created_at: string
}

export type PaymentRecord = {
  id: string; amount: number; payment_method: string
  reference_number?: string | null; notes?: string | null
  paid_date: string; created_at: string
}

export type ActivityRecord = {
  id: string; action: string; actor_name?: string | null
  remarks?: string | null; created_at: string
}

type Stats = {
  pendingBalance: number
  thisMonthEarned: number
  totalEarned: number
  thisMonthPaid: number
  totalWorks: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

const TYPE_LABEL: Record<string, string> = {
  voice_over: "Voice Artist", video_editor: "Video Editor",
  video_shooter: "Video Shooter", other: "Other",
}

const TYPE_COLOR: Record<string, string> = {
  voice_over: "#8b5cf6", video_editor: "#0ea5e9",
  video_shooter: "#10b981", other: "#6b7280",
}

// ── Main Component ───────────────────────────────────────────────────────────

const TABS = [
  { key: "overview",     label: "Overview",     Icon: User },
  { key: "work_entries", label: "Work Entries",  Icon: Briefcase },
  { key: "payments",     label: "Payments",      Icon: IndianRupee },
  { key: "statements",   label: "Statements",    Icon: FileText },
  { key: "activity",     label: "Activity",      Icon: Activity },
]

export default function FreelancerProfileClient({
  freelancer, workEntries, payments, activityLogs,
  currentUserId, currentUserName, currentUserRole, stats,
}: {
  freelancer: FreelancerRecord
  workEntries: WorkEntryRecord[]
  payments: PaymentRecord[]
  activityLogs: ActivityRecord[]
  currentUserId: string
  currentUserName: string
  currentUserRole: string
  stats: Stats
}) {
  const [activeTab, setActiveTab] = useState("overview")
  const router = useRouter()

  const typeColor = TYPE_COLOR[freelancer.type] ?? "#6b7280"
  const typeLabel = TYPE_LABEL[freelancer.type] ?? "Other"

  const CARD: React.CSSProperties = {
    background: "#FFFFFF", borderRadius: 16,
    border: "1px solid #E5E7EB",
    boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
  }

  return (
    <div style={{ background: "#F5F6FA", minHeight: "100vh" }} className="p-4 lg:p-6 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link href="/admin/freelancers"
          style={{ width: 36, height: 36, borderRadius: 10, background: "#FFFFFF", border: "1px solid #E5E7EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ArrowLeft size={16} style={{ color: "#374151" }} />
        </Link>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: "#111827", margin: 0 }}>{freelancer.name}</h1>
          <p style={{ fontSize: 12, color: typeColor, fontWeight: 700, margin: 0 }}>{typeLabel}</p>
        </div>
        <span style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700,
          background: freelancer.status === "active" ? "rgba(22,163,74,0.08)" : "rgba(107,114,128,0.08)",
          color: freelancer.status === "active" ? "#16A34A" : "#6B7280" }}>
          {freelancer.status === "active" ? "Active" : "Inactive"}
        </span>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ ...CARD, padding: "4px 8px", display: "flex", gap: 4, overflowX: "auto" }}>
        {TABS.map(t => {
          const active = activeTab === t.key
          const Icon = t.Icon
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all flex-shrink-0"
              style={active
                ? { background: "#DE1A1A", color: "#FFFFFF" }
                : { color: "#6B7280", background: "transparent" }}>
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "overview"     && <OverviewTab freelancer={freelancer} stats={stats} CARD={CARD} fmt={fmt} fmtDate={fmtDate} typeColor={typeColor} />}
      {activeTab === "work_entries" && <div style={CARD} className="p-5"><p className="text-gray-400 text-sm">Work Entries tab — coming in Task 7</p></div>}
      {activeTab === "payments"     && <div style={CARD} className="p-5"><p className="text-gray-400 text-sm">Payments tab — coming in Task 8</p></div>}
      {activeTab === "statements"   && <div style={CARD} className="p-5"><p className="text-gray-400 text-sm">Statements tab — coming in Task 9</p></div>}
      {activeTab === "activity"     && <div style={CARD} className="p-5"><p className="text-gray-400 text-sm">Activity tab — coming in Task 10</p></div>}
    </div>
  )
}

// ── Tab 1: Overview ───────────────────────────────────────────────────────────

function OverviewTab({ freelancer, stats, CARD, fmt, fmtDate, typeColor }: {
  freelancer: FreelancerRecord
  stats: Stats
  CARD: React.CSSProperties
  fmt: (n: number) => string
  fmtDate: (d: string) => string
  typeColor: string
}) {
  const statCards = [
    { label: "Pending Balance",      value: fmt(stats.pendingBalance),    color: stats.pendingBalance > 0 ? "#DE1A1A" : "#16A34A" },
    { label: "This Month Earnings",  value: fmt(stats.thisMonthEarned),   color: "#0EA5E9" },
    { label: "Total Earnings",       value: fmt(stats.totalEarned),       color: "#6366F1" },
    { label: "This Month Paid",      value: fmt(stats.thisMonthPaid),     color: "#10B981" },
    { label: "Works Completed",      value: String(stats.totalWorks),     color: "#D97706" },
  ]

  return (
    <div className="space-y-4">

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map(s => (
          <div key={s.label} style={{ ...CARD, padding: 16 }}>
            <p style={{ fontSize: 20, fontWeight: 900, color: s.color, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0", fontWeight: 600 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Personal Details */}
      <div style={{ ...CARD, padding: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Personal Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { label: "Name",     value: freelancer.name },
            { label: "Role",     value: TYPE_LABEL[freelancer.type] ?? freelancer.type },
            { label: "Phone",    value: freelancer.phone ?? "—" },
            { label: "WhatsApp", value: freelancer.whatsapp ?? "—" },
            { label: "Location", value: freelancer.location ?? "—" },
            { label: "UPI ID",   value: freelancer.upi_id ?? "—" },
            { label: "Bank",     value: freelancer.bank_name ? `${freelancer.bank_name} · ${freelancer.account_number ?? ""} · ${freelancer.ifsc ?? ""}` : "—" },
            { label: "Notes",    value: freelancer.notes ?? "—" },
            { label: "Joined",   value: fmtDate(freelancer.created_at) },
          ].map(row => (
            <div key={row.label} className="flex flex-col gap-0.5">
              <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>{row.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Default Rates */}
      {(freelancer.cost_per_video || freelancer.cost_per_minute || freelancer.cost_per_hour) && (
        <div style={{ ...CARD, padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Default Rates</h3>
          <div className="flex flex-wrap gap-3">
            {freelancer.cost_per_video && (
              <div style={{ padding: "10px 16px", borderRadius: 10, background: `${typeColor}10`, border: `1px solid ${typeColor}30` }}>
                <p style={{ fontSize: 18, fontWeight: 900, color: typeColor, margin: 0 }}>₹{freelancer.cost_per_video}</p>
                <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>Per Video</p>
              </div>
            )}
            {freelancer.cost_per_minute && (
              <div style={{ padding: "10px 16px", borderRadius: 10, background: `${typeColor}10`, border: `1px solid ${typeColor}30` }}>
                <p style={{ fontSize: 18, fontWeight: 900, color: typeColor, margin: 0 }}>₹{freelancer.cost_per_minute}</p>
                <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>Per Minute</p>
              </div>
            )}
            {freelancer.cost_per_hour && (
              <div style={{ padding: "10px 16px", borderRadius: 10, background: `${typeColor}10`, border: `1px solid ${typeColor}30` }}>
                <p style={{ fontSize: 18, fontWeight: 900, color: typeColor, margin: 0 }}>₹{freelancer.cost_per_hour}</p>
                <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>Per Hour</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/freelancers/[id]/profile-client.tsx"
git commit -m "feat: freelancer profile 5-tab shell + Overview tab"
```

---

## Task 7: Tab 2 — Work Entries (with Approval Flow)

**Files:**
- Modify: `app/admin/freelancers/[id]/profile-client.tsx`

Replace the placeholder for `work_entries` tab with a full implementation.

- [ ] **Step 1: Add imports at the top of profile-client.tsx**

Add to existing imports:
```typescript
import { useTransition } from "react"
import { createWorkEntry, updateWorkEntryStatus, approveWorkEntry, rejectWorkEntry, deleteWorkEntry } from "@/lib/actions/freelancers"
```

- [ ] **Step 2: Add WorkEntriesTab component below OverviewTab in the file**

```typescript
function WorkEntriesTab({
  freelancer, workEntries, currentUserRole, CARD, fmt, fmtDate,
}: {
  freelancer: FreelancerRecord
  workEntries: WorkEntryRecord[]
  currentUserRole: string
  CARD: React.CSSProperties
  fmt: (n: number) => string
  fmtDate: (d: string) => string
}) {
  const [showAdd, setShowAdd]         = useState(false)
  const [rejectId, setRejectId]       = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [isPending, startTransition]  = useTransition()

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    client_name: "",
    work_title: "",
    quantity: "",
    rate: String(
      freelancer.type === "video_editor"  ? (freelancer.cost_per_video ?? "") :
      freelancer.type === "video_shooter" ? (freelancer.cost_per_minute ?? "") :
      freelancer.cost_per_hour ?? ""
    ),
    notes: "",
  })

  const total = (parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0)

  const rateLabel =
    freelancer.type === "video_editor"  ? "Rate Per Video"   :
    freelancer.type === "video_shooter" ? "Rate Per Minute"  :
    freelancer.type === "voice_over"    ? "Rate Per VO"      : "Rate"

  const qtyLabel =
    freelancer.type === "video_editor"  ? "Video Count"   :
    freelancer.type === "video_shooter" ? "Minutes"       :
    freelancer.type === "voice_over"    ? "Voice Over Name (1 entry)" : "Quantity"

  function handleAdd() {
    startTransition(async () => {
      const fd = new FormData()
      fd.append("freelancer_id", freelancer.id)
      fd.append("date",          form.date)
      fd.append("client_name",   form.client_name)
      fd.append("work_title",    form.work_title)
      fd.append("quantity",      form.quantity)
      fd.append("rate",          form.rate)
      fd.append("notes",         form.notes)
      fd.append("work_type",     freelancer.type)
      fd.append("amount",        String(total))
      await createWorkEntry(fd)
      setShowAdd(false)
      setForm(f => ({ ...f, work_title: "", quantity: "", client_name: "", notes: "" }))
    })
  }

  const APPROVAL_COLOR: Record<string, string> = {
    pending: "#D97706", approved: "#16A34A", rejected: "#DE1A1A",
  }
  const APPROVAL_BG: Record<string, string> = {
    pending: "rgba(217,119,6,0.08)", approved: "rgba(22,163,74,0.08)", rejected: "rgba(222,26,26,0.06)",
  }

  const canApprove = currentUserRole === "ADMIN" || currentUserRole === "MEMBER"

  return (
    <div className="space-y-4">

      {/* Add Entry Button */}
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
          <Plus size={14} /> Add Work Entry
        </button>
      </div>

      {/* Add Entry Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#FFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>Add Work Entry</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} style={{ color: "#6B7280" }} /></button>
            </div>
            <div className="space-y-3">
              {[
                { label: "Date",        key: "date",        type: "date" },
                { label: "Client Name", key: "client_name", type: "text", placeholder: "Client / Brand" },
                { label: "Work Title",  key: "work_title",  type: "text", placeholder: "e.g. Product Reel Edit" },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>{f.label}</label>
                  <input type={f.type} placeholder={f.placeholder ?? ""}
                    value={(form as Record<string, string>)[f.key]}
                    onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none" }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>{qtyLabel}</label>
                <input type="number" min="1" placeholder="e.g. 10"
                  value={form.quantity}
                  onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>{rateLabel}</label>
                <input type="number" min="0" step="0.01"
                  value={form.rate}
                  onChange={e => setForm(p => ({ ...p, rate: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none" }} />
              </div>
              {total > 0 && (
                <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)" }}>
                  <p style={{ fontSize: 16, fontWeight: 800, color: "#16A34A", margin: 0 }}>Total: {fmt(total)}</p>
                </div>
              )}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>Notes</label>
                <textarea placeholder="Optional notes..." value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none", resize: "vertical" }} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFF", fontSize: 13, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleAdd} disabled={isPending || !form.work_title || total <= 0}
                style={{ flex: 2, padding: "11px", borderRadius: 10, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}>
                {isPending ? "Saving..." : "Add Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#FFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 400 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", marginBottom: 16 }}>Reject Entry</h2>
            <textarea placeholder="Reason for rejection..." value={rejectReason}
              onChange={e => setRejectReason(e.target.value)} rows={3}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none", resize: "vertical" }} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setRejectId(null); setRejectReason("") }}
                style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFF", fontSize: 13, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => {
                startTransition(async () => {
                  await rejectWorkEntry(rejectId, rejectReason)
                  setRejectId(null); setRejectReason("")
                })
              }} disabled={isPending || !rejectReason.trim()}
                style={{ flex: 2, padding: 10, borderRadius: 10, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}>
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entries List */}
      {workEntries.length === 0 ? (
        <div style={{ ...CARD, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>No work entries yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workEntries.map(e => {
            const aColor = APPROVAL_COLOR[e.approval_status] ?? "#6B7280"
            const aBg    = APPROVAL_BG[e.approval_status]   ?? "rgba(107,114,128,0.08)"
            return (
              <div key={e.id} style={{ ...CARD, padding: 16 }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0 }}>{e.work_title}</p>
                    <p style={{ fontSize: 12, color: "#6B7280", margin: "2px 0 0" }}>
                      {e.client_name && `${e.client_name} · `}{fmtDate(e.date)}
                      {e.quantity && e.rate ? ` · ${e.quantity} × ₹${e.rate}` : ""}
                    </p>
                    {e.notes && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>{e.notes}</p>}
                    {e.approval_status === "rejected" && e.rejected_reason && (
                      <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>Rejected: {e.rejected_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontSize: 16, fontWeight: 800, color: "#111827" }}>{fmt(e.amount)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: aBg, color: aColor }}>
                      {e.approval_status === "pending" ? "Pending Approval" : e.approval_status === "approved" ? "Approved" : "Rejected"}
                    </span>
                    {canApprove && e.approval_status === "pending" && (
                      <>
                        <button onClick={() => startTransition(() => approveWorkEntry(e.id))}
                          style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.3)", color: "#16A34A", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          Approve
                        </button>
                        <button onClick={() => setRejectId(e.id)}
                          style={{ padding: "4px 10px", borderRadius: 6, background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.2)", color: "#DE1A1A", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire WorkEntriesTab into the tab switcher**

Replace the placeholder line:
```typescript
{activeTab === "work_entries" && <div style={CARD} className="p-5"><p className="text-gray-400 text-sm">Work Entries tab — coming in Task 7</p></div>}
```
With:
```typescript
{activeTab === "work_entries" && (
  <WorkEntriesTab
    freelancer={freelancer}
    workEntries={workEntries}
    currentUserRole={currentUserRole}
    CARD={CARD}
    fmt={fmt}
    fmtDate={fmtDate}
  />
)}
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/freelancers/[id]/profile-client.tsx"
git commit -m "feat: work entries tab with role-specific form + approve/reject flow"
```

---

## Task 8: Tab 3 — Payments

**Files:**
- Modify: `app/admin/freelancers/[id]/profile-client.tsx`

- [ ] **Step 1: Add import for payment action at the top**

```typescript
import { addFreelancerPayment, deleteFreelancerPayment } from "@/lib/actions/freelancer-payments"
```

- [ ] **Step 2: Add PaymentsTab component**

Add below WorkEntriesTab:

```typescript
function PaymentsTab({
  freelancer, payments, stats, currentUserRole, CARD, fmt, fmtDate,
}: {
  freelancer: FreelancerRecord
  payments: PaymentRecord[]
  stats: Stats
  currentUserRole: string
  CARD: React.CSSProperties
  fmt: (n: number) => string
  fmtDate: (d: string) => string
}) {
  const [showAdd, setShowAdd]       = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm]             = useState({
    amount: "", payment_method: "upi", reference_number: "", notes: "",
    paid_date: new Date().toISOString().split("T")[0],
  })

  function handleAdd() {
    startTransition(async () => {
      const fd = new FormData()
      fd.append("freelancer_id",    freelancer.id)
      fd.append("amount",           form.amount)
      fd.append("payment_method",   form.payment_method)
      fd.append("reference_number", form.reference_number)
      fd.append("notes",            form.notes)
      fd.append("paid_date",        form.paid_date)
      await addFreelancerPayment(fd)
      setShowAdd(false)
      setForm(f => ({ ...f, amount: "", reference_number: "", notes: "" }))
    })
  }

  const METHOD_LABEL: Record<string, string> = {
    upi: "UPI", cash: "Cash", bank_transfer: "Bank Transfer",
  }

  const canDelete = currentUserRole === "ADMIN"

  return (
    <div className="space-y-4">

      {/* Balance Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending Balance",  value: fmt(stats.pendingBalance),   color: stats.pendingBalance > 0 ? "#DE1A1A" : "#16A34A" },
          { label: "Total Approved",   value: fmt(stats.totalEarned),      color: "#6366F1" },
          { label: "Total Paid",       value: fmt(stats.thisMonthPaid + (stats.totalEarned - stats.pendingBalance - stats.thisMonthPaid)), color: "#10B981" },
          { label: "This Month Paid",  value: fmt(stats.thisMonthPaid),    color: "#0EA5E9" },
        ].map(s => (
          <div key={s.label} style={{ ...CARD, padding: 16 }}>
            <p style={{ fontSize: 18, fontWeight: 900, color: s.color, margin: 0 }}>{s.value}</p>
            <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Add Payment Button */}
      <div className="flex justify-end">
        <button onClick={() => setShowAdd(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
          <Plus size={14} /> Add Payment
        </button>
      </div>

      {/* Add Payment Modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#FFF", borderRadius: 20, padding: 24, width: "100%", maxWidth: 440 }}>
            <div className="flex items-center justify-between mb-5">
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>Add Payment</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} style={{ color: "#6B7280" }} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>Date</label>
                <input type="date" value={form.paid_date} onChange={e => setForm(p => ({ ...p, paid_date: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>Amount (₹)</label>
                <input type="number" min="1" step="0.01" placeholder="e.g. 5000" value={form.amount}
                  onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>Payment Method</label>
                <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none", appearance: "none" }}>
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>Reference Number</label>
                <input type="text" placeholder="UPI ref / transaction ID" value={form.reference_number}
                  onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>Notes</label>
                <textarea rows={2} placeholder="Optional" value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none", resize: "vertical" }} />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdd(false)}
                style={{ flex: 1, padding: 11, borderRadius: 10, border: "1px solid #E5E7EB", background: "#FFF", fontSize: 13, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleAdd} disabled={isPending || !form.amount}
                style={{ flex: 2, padding: 11, borderRadius: 10, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", opacity: isPending ? 0.6 : 1 }}>
                {isPending ? "Saving..." : "Add Payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment History */}
      {payments.length === 0 ? (
        <div style={{ ...CARD, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>No payments recorded yet.</p>
        </div>
      ) : (
        <div style={CARD}>
          {payments.map((p, i) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
              borderBottom: i < payments.length - 1 ? "1px solid #F3F4F6" : "none",
            }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <IndianRupee size={16} style={{ color: "#10B981" }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0 }}>
                  {fmt(p.amount)} <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280" }}>via {METHOD_LABEL[p.payment_method] ?? p.payment_method}</span>
                </p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>
                  {fmtDate(p.paid_date)}{p.reference_number ? ` · Ref: ${p.reference_number}` : ""}
                </p>
                {p.notes && <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>{p.notes}</p>}
              </div>
              {canDelete && (
                <button onClick={() => startTransition(() => deleteFreelancerPayment(p.id, freelancer.id))}
                  style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.15)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  <X size={12} style={{ color: "#DE1A1A" }} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire PaymentsTab into switcher**

Replace:
```typescript
{activeTab === "payments" && <div style={CARD} className="p-5"><p className="text-gray-400 text-sm">Payments tab — coming in Task 8</p></div>}
```
With:
```typescript
{activeTab === "payments" && (
  <PaymentsTab
    freelancer={freelancer}
    payments={payments}
    stats={stats}
    currentUserRole={currentUserRole}
    CARD={CARD}
    fmt={fmt}
    fmtDate={fmtDate}
  />
)}
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/freelancers/[id]/profile-client.tsx"
git commit -m "feat: payments tab with add/delete payment and balance summary"
```

---

## Task 9: Tab 4 — Statements

**Files:**
- Modify: `app/admin/freelancers/[id]/profile-client.tsx`
- Create: `app/admin/freelancers/[id]/statement/page.tsx`

Statements are printable pages opened in a new tab. No PDF library needed.

- [ ] **Step 1: Create statement print page**

Create `app/admin/freelancers/[id]/statement/page.tsx`:

```typescript
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { redirect, notFound } from "next/navigation"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const { id }   = await params
  const { month: mParam, year: yParam } = await searchParams

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin.from("users").select("company_id").eq("id", user.id).single()
  if (!profile?.company_id) redirect("/login")
  const cid = profile.company_id

  const now   = new Date()
  const year  = parseInt(yParam ?? String(now.getFullYear()))
  const month = parseInt(mParam ?? String(now.getMonth() + 1))
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`
  const monthEnd   = new Date(year, month, 0).toISOString().split("T")[0]
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" })

  const [{ data: freelancer }, { data: entries }, { data: payments }] = await Promise.all([
    admin.from("freelancers").select("name, type, phone, upi_id").eq("id", id).eq("company_id", cid).single(),
    admin.from("freelancer_work_entries")
      .select("work_title, client_name, quantity, rate, amount, date, approval_status")
      .eq("freelancer_id", id).eq("company_id", cid).eq("approval_status", "approved")
      .gte("date", monthStart).lte("date", monthEnd).order("date"),
    admin.from("freelancer_payments")
      .select("amount, payment_method, paid_date, reference_number")
      .eq("freelancer_id", id).eq("company_id", cid)
      .gte("paid_date", monthStart).lte("paid_date", monthEnd).order("paid_date"),
  ])

  if (!freelancer) notFound()

  const TYPE_LABEL: Record<string, string> = {
    voice_over: "Voice Artist", video_editor: "Video Editor",
    video_shooter: "Video Shooter", other: "Other",
  }

  const totalEarned = (entries ?? []).reduce((s, e) => s + (e.amount ?? 0), 0)
  const totalPaid   = (payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0)
  const pending     = totalEarned - totalPaid

  function fmt(n: number) {
    return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0 })}`
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
  }

  return (
    <html>
      <head>
        <title>{`${freelancer.name} — Statement ${monthLabel}`}</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; font-size: 13px; color: #111; background: #fff; padding: 40px; }
          h1 { font-size: 22px; font-weight: 900; }
          h2 { font-size: 15px; font-weight: 800; margin: 24px 0 10px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { padding: 10px 12px; border: 1px solid #E5E7EB; text-align: left; font-size: 12px; }
          th { background: #F9FAFB; font-weight: 700; }
          .summary { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; margin: 16px 0; }
          .summary-box { padding: 14px 16px; border: 1px solid #E5E7EB; border-radius: 8px; }
          .summary-box .val { font-size: 20px; font-weight: 900; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; }
          .meta { text-align: right; font-size: 12px; color: #6B7280; }
          .actions { margin: 30px 0; display: flex; gap: 12px; }
          .btn { padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 700; border: none; }
          .btn-primary { background: #DE1A1A; color: #fff; }
          .btn-secondary { background: #f3f4f6; color: #374151; }
          @media print { .actions { display: none; } body { padding: 20px; } }
        `}</style>
      </head>
      <body>
        <div className="header">
          <div>
            <h1>Monthly Statement</h1>
            <p style={{ color: "#6B7280", marginTop: 4 }}>{monthLabel}</p>
          </div>
          <div className="meta">
            <p style={{ fontWeight: 700, fontSize: 15 }}>{freelancer.name}</p>
            <p>{TYPE_LABEL[freelancer.type] ?? freelancer.type}</p>
            {freelancer.phone && <p>{freelancer.phone}</p>}
          </div>
        </div>

        <div className="actions">
          <button className="btn btn-primary" onClick="window.print()">Download PDF</button>
          {freelancer.phone && (
            <a href={`https://wa.me/91${freelancer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
              `Hi ${freelancer.name},\n\nYour ${monthLabel} statement:\n\nWorks: ${(entries ?? []).length}\nEarned: ${fmt(totalEarned)}\nPaid: ${fmt(totalPaid)}\nPending: ${fmt(pending)}\n\nThank you!`
            )}`} target="_blank" rel="noreferrer">
              <button className="btn btn-secondary">Share WhatsApp</button>
            </a>
          )}
        </div>

        <div className="summary">
          <div className="summary-box">
            <p style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>WORKS COMPLETED</p>
            <p className="val">{(entries ?? []).length}</p>
          </div>
          <div className="summary-box">
            <p style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>AMOUNT EARNED</p>
            <p className="val" style={{ color: "#6366F1" }}>{fmt(totalEarned)}</p>
          </div>
          <div className="summary-box">
            <p style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>AMOUNT PAID</p>
            <p className="val" style={{ color: "#10B981" }}>{fmt(totalPaid)}</p>
          </div>
          <div className="summary-box">
            <p style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>PENDING</p>
            <p className="val" style={{ color: pending > 0 ? "#DE1A1A" : "#16A34A" }}>{fmt(pending)}</p>
          </div>
        </div>

        <h2>Work Entries</h2>
        {(entries ?? []).length === 0 ? (
          <p style={{ color: "#9CA3AF" }}>No approved entries this month.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Work</th><th>Client</th><th>Qty × Rate</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e, i) => (
                <tr key={i}>
                  <td>{fmtDate(e.date)}</td>
                  <td>{e.work_title}</td>
                  <td>{e.client_name ?? "—"}</td>
                  <td>{e.quantity && e.rate ? `${e.quantity} × ₹${e.rate}` : "—"}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(e.amount)}</td>
                </tr>
              ))}
              <tr style={{ background: "#F9FAFB" }}>
                <td colSpan={4} style={{ fontWeight: 800 }}>Total</td>
                <td style={{ fontWeight: 800 }}>{fmt(totalEarned)}</td>
              </tr>
            </tbody>
          </table>
        )}

        <h2>Payments Received</h2>
        {(payments ?? []).length === 0 ? (
          <p style={{ color: "#9CA3AF" }}>No payments this month.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr>
            </thead>
            <tbody>
              {(payments ?? []).map((p, i) => (
                <tr key={i}>
                  <td>{fmtDate(p.paid_date)}</td>
                  <td style={{ fontWeight: 700 }}>{fmt(p.amount)}</td>
                  <td style={{ textTransform: "capitalize" }}>{p.payment_method.replace("_", " ")}</td>
                  <td>{p.reference_number ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p style={{ marginTop: 40, fontSize: 11, color: "#9CA3AF" }}>Generated by GroFast Team Tracking</p>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Add StatementsTab component to profile-client.tsx**

```typescript
function StatementsTab({
  freelancer, CARD,
}: {
  freelancer: FreelancerRecord
  CARD: React.CSSProperties
}) {
  const now     = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const months = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ]

  function openStatement() {
    window.open(`/admin/freelancers/${freelancer.id}/statement?year=${year}&month=${month}`, "_blank")
  }

  return (
    <div style={{ ...CARD, padding: 24, maxWidth: 400 }}>
      <h3 style={{ fontSize: 14, fontWeight: 800, color: "#111827", marginBottom: 20 }}>Generate Monthly Statement</h3>
      <div className="space-y-3">
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>Month</label>
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))}
            style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none", appearance: "none" }}>
            {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase" }}>Year</label>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))}
            style={{ display: "block", width: "100%", marginTop: 4, padding: "10px 12px", borderRadius: 10, border: "1px solid #E5E7EB", fontSize: 13, outline: "none", appearance: "none" }}>
            {[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button onClick={openStatement}
          style={{ width: "100%", marginTop: 8, padding: "12px", borderRadius: 12, background: "#DE1A1A", color: "#FFF", fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer" }}>
          View Statement
        </button>
        <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center" }}>
          Opens in new tab — use browser Print to save as PDF
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire StatementsTab into switcher**

Replace:
```typescript
{activeTab === "statements" && <div style={CARD} className="p-5"><p className="text-gray-400 text-sm">Statements tab — coming in Task 9</p></div>}
```
With:
```typescript
{activeTab === "statements" && (
  <StatementsTab freelancer={freelancer} CARD={CARD} />
)}
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/freelancers/[id]/profile-client.tsx" "app/admin/freelancers/[id]/statement/page.tsx"
git commit -m "feat: statements tab + printable monthly statement page with WhatsApp share"
```

---

## Task 10: Tab 5 — Activity Log

**Files:**
- Modify: `app/admin/freelancers/[id]/profile-client.tsx`

- [ ] **Step 1: Add ActivityTab component**

```typescript
function ActivityTab({
  activityLogs, CARD, fmtDate,
}: {
  activityLogs: ActivityRecord[]
  CARD: React.CSSProperties
  fmtDate: (d: string) => string
}) {
  if (activityLogs.length === 0) {
    return (
      <div style={{ ...CARD, padding: 40, textAlign: "center" }}>
        <p style={{ color: "#9CA3AF", fontSize: 14 }}>No activity yet.</p>
      </div>
    )
  }

  return (
    <div style={CARD}>
      {activityLogs.map((log, i) => (
        <div key={log.id} style={{
          display: "flex", gap: 12, padding: "14px 20px",
          borderBottom: i < activityLogs.length - 1 ? "1px solid #F3F4F6" : "none",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#DE1A1A", marginTop: 5, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#111827", margin: 0 }}>{log.action}</p>
            {log.remarks && <p style={{ fontSize: 11, color: "#6B7280", margin: "2px 0 0" }}>{log.remarks}</p>}
            <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>
              {log.actor_name ?? "System"} · {new Date(log.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Wire ActivityTab into switcher**

Replace:
```typescript
{activeTab === "activity" && <div style={CARD} className="p-5"><p className="text-gray-400 text-sm">Activity tab — coming in Task 10</p></div>}
```
With:
```typescript
{activeTab === "activity" && (
  <ActivityTab activityLogs={activityLogs} CARD={CARD} fmtDate={fmtDate} />
)}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/freelancers/[id]/profile-client.tsx"
git commit -m "feat: activity log tab — full audit trail per freelancer"
```

---

## Task 11: Update List Page — Payment Stats + Pending on Cards

**Files:**
- Modify: `app/admin/freelancers/page.tsx`
- Modify: `app/admin/freelancers/freelancers-client.tsx`

- [ ] **Step 1: Update page.tsx to fetch payment stats**

In `app/admin/freelancers/page.tsx`, add `paymentsResult` to the parallel fetch:
```typescript
const [freelancersResult, workEntriesResult, clientsResult, teamResult, paymentsResult] = await Promise.all([
  admin.from("freelancers").select("*").eq("company_id", cid).order("name"),
  admin.from("freelancer_work_entries").select("freelancer_id, amount, approval_status").eq("company_id", cid),
  admin.from("clients").select("name").eq("company_id", cid).order("name"),
  admin.from("users").select("id, name, employee_id, can_manage_freelancers").eq("company_id", cid).eq("role", "MEMBER").eq("status", "active").order("name"),
  admin.from("freelancer_payments").select("freelancer_id, amount, paid_date").eq("company_id", cid),
])
const payments = (paymentsResult.data ?? []) as { freelancer_id: string; amount: number; paid_date: string }[]
```

Compute pending and this month paid in stats:
```typescript
const now2       = new Date()
const monthStart = `${now2.getFullYear()}-${String(now2.getMonth() + 1).padStart(2, "0")}-01`
const approvedEntries = workEntries.filter(e => e.approval_status === "approved")
const totalApproved   = approvedEntries.reduce((s, e) => s + (e.amount ?? 0), 0)
const totalPaid       = payments.reduce((s, p) => s + (p.amount ?? 0), 0)
const pendingTotal    = totalApproved - totalPaid
const thisMonthPaid   = payments.filter(p => p.paid_date >= monthStart).reduce((s, p) => s + (p.amount ?? 0), 0)
```

Pass `pendingTotal`, `thisMonthPaid`, and per-freelancer `pendingMap` to `FreelancersClient`:
```typescript
// Build per-freelancer pending balance map
const pendingMap: Record<string, number> = {}
for (const f of freelancers) {
  const earned = approvedEntries.filter(e => e.freelancer_id === f.id).reduce((s, e) => s + (e.amount ?? 0), 0)
  const paid   = payments.filter(p => p.freelancer_id === f.id).reduce((s, p) => s + (p.amount ?? 0), 0)
  pendingMap[f.id] = earned - paid
}
```

Update `stats` object:
```typescript
const stats: FreelancerStats = {
  // ... existing fields ...
  pendingTotal,
  thisMonthPaid,
}
```

- [ ] **Step 2: Read FreelancerStats type definition in page.tsx**

Open `app/admin/freelancers/page.tsx` and find the `FreelancerStats` type. Add `pendingTotal` and `thisMonthPaid` fields.

- [ ] **Step 3: Update FreelancersClient props to accept pendingMap**

In `freelancers-client.tsx`, update `FreelancersClient` props type to include:
```typescript
pendingMap: Record<string, number>
```

- [ ] **Step 4: Show pending amount and last payment date on each freelancer card**

In the freelancer card UI (in `freelancers-client.tsx`), add below the name/type:
```typescript
const pending = pendingMap[f.id] ?? 0
// In card JSX:
{pending > 0 && (
  <p style={{ fontSize: 12, fontWeight: 700, color: "#DE1A1A" }}>
    Pending ₹{pending.toLocaleString("en-IN")}
  </p>
)}
```

- [ ] **Step 5: Make freelancer card clickable → navigate to profile**

Wrap the card or add a link:
```typescript
<Link href={`/admin/freelancers/${f.id}`} style={{ textDecoration: "none" }}>
  {/* card content */}
</Link>
```

- [ ] **Step 6: Update stat cards at top of list page**

Find where stat cards are rendered in `freelancers-client.tsx`. Add/update:
```typescript
{ label: "Pending Payments",    value: `₹${stats.pendingTotal?.toLocaleString("en-IN") ?? 0}`, color: "#DE1A1A" },
{ label: "This Month Paid",     value: `₹${stats.thisMonthPaid?.toLocaleString("en-IN") ?? 0}`, color: "#10B981" },
```

- [ ] **Step 7: Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/admin/freelancers/page.tsx app/admin/freelancers/freelancers-client.tsx
git commit -m "feat: freelancer list shows pending payments + this month paid + cards link to profile"
```

---

## Task 12: Final Typecheck + Push

- [ ] **Step 1: Full typecheck**

```bash
pnpm typecheck
```
Expected: no errors.

- [ ] **Step 2: Build check**

```bash
pnpm build 2>&1 | tail -20
```
Expected: build succeeds, all routes listed.

- [ ] **Step 3: Push to sajee branch**

```bash
git push origin master:sajee
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement | Covered In |
|---|---|
| Freelancer list with Total / Pending / This Month Paid stats | Task 11 |
| Add Freelancer with all fields (name, role, phone, UPI, bank, IFSC) | Task 1 (DB adds missing columns), uses existing create form |
| Role selection: Video Editor / Shooter / Voice Artist / Other | Existing |
| Default rates per role | Task 6 (shown in Overview) |
| Freelancer list card: name, role, phone, pending amount, last paid | Task 11 |
| Filters: All / Video Editors / Shooters / Voice Artists / Active / Inactive | Existing |
| Search by name / phone | Existing |
| Freelancer profile with 5 tabs | Tasks 6–10 |
| Tab 1 Overview: stats + personal details + default rates | Task 6 |
| Tab 2 Work Entries: role-specific form + approval flow | Task 7 |
| Work entry status: pending → approved → rejected | Tasks 3, 7 |
| Only approved entries affect balance | Tasks 4, 8 |
| Tab 3 Payments: add/delete + balance | Task 8 |
| Payment methods: UPI / Cash / Bank Transfer + reference | Task 8 |
| Tab 4 Statements: select month, view, print PDF, WhatsApp | Task 9 |
| Tab 5 Activity: audit log of all actions | Tasks 2, 10 |
| Admin: all permissions | Enforced in server actions |
| Team Lead: no delete freelancer | Not added — existing delete is admin-only |
| Workflow: Create → Work → Approve → Balance → Pay → Statement | All tasks combined |

### No Placeholders ✅
All steps contain actual code.

### Type Consistency ✅
- `FreelancerRecord`, `WorkEntryRecord`, `PaymentRecord`, `ActivityRecord`, `Stats` defined once in Task 6, used consistently across Tasks 7–10.
- `logFreelancerActivity` defined in Task 2, imported in Tasks 3 and 4.
- `approveWorkEntry`, `rejectWorkEntry` defined in Task 3, imported in Task 7.
- `addFreelancerPayment`, `deleteFreelancerPayment` defined in Task 4, imported in Task 8.
