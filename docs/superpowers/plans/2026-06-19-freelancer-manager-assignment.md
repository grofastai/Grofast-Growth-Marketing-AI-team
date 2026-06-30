# Freelancer Manager Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the "Assign Manager" modal so already-assigned managers are shown with a Remove button at the top, and only unassigned members appear as selectable options below.

**Architecture:** Add two new server actions (`addManagerToAllFreelancers`, `removeManagerFromAllFreelancers`) to the existing `freelancer-manager.ts`. Fetch assigned manager IDs in `team/page.tsx` and pass them as a new prop. Redesign `AssignManagerSheet` in `team-client.tsx` to split into Assigned / Available sections with optimistic UI.

**Tech Stack:** Next.js 15 App Router, Supabase (admin client), React `useTransition`, TypeScript strict mode.

## Global Constraints

- Admin-only mutations — always verify `role === 'ADMIN'` server-side before any DB write
- Use `adminSupabase()` (service role) for all DB operations — never the user client
- Tenant isolation — every query filters by `company_id`
- No DB migrations needed — `freelancer_assignments` table already exists with `UNIQUE (freelancer_id, user_id)`
- Revalidate `/admin/team` and `/member/freelancers` after every mutation
- Follow existing code style: inline `style={{}}` objects, no Tailwind for custom colors, `useTransition` for async actions

---

## File Map

| File | Change |
|------|--------|
| `lib/actions/freelancer-manager.ts` | Add `addManagerToAllFreelancers`, `removeManagerFromAllFreelancers` |
| `app/admin/team/page.tsx` | Fetch distinct assigned manager `user_id`s, pass as `assignedManagerIds` prop |
| `app/admin/team/team-client.tsx` | Add `assignedManagerIds` prop to `TeamClient` + `AssignManagerSheet`; redesign sheet UI |

---

## Task 1: New server actions — add and remove manager

**Files:**
- Modify: `lib/actions/freelancer-manager.ts`

**Interfaces:**
- Produces:
  - `addManagerToAllFreelancers(userId: string): Promise<{ success: boolean; error?: string }>`
  - `removeManagerFromAllFreelancers(userId: string): Promise<{ success: boolean; error?: string }>`

- [ ] **Step 1: Open `lib/actions/freelancer-manager.ts` and replace the entire file with the following**

```typescript
"use server"

import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function getAdminContext(): Promise<{ companyId: string } | { error: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }
  const admin = adminSupabase()
  const { data: profile } = await admin.from("users").select("role, company_id").eq("id", user.id).single()
  if (profile?.role !== "ADMIN") return { error: "Admin only" }
  return { companyId: profile.company_id as string }
}

export async function assignFreelancerManager(targetUserId: string | null): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminContext()
  if ("error" in ctx) return { success: false, error: ctx.error }
  const admin = adminSupabase()

  const { error: clearErr } = await admin
    .from("users")
    .update({ can_manage_freelancers: false })
    .eq("company_id", ctx.companyId)
  if (clearErr) return { success: false, error: clearErr.message }

  if (targetUserId) {
    const { error: setErr } = await admin
      .from("users")
      .update({ can_manage_freelancers: true })
      .eq("id", targetUserId)
      .eq("company_id", ctx.companyId)
    if (setErr) return { success: false, error: setErr.message }
  }

  revalidatePath("/admin/freelancers")
  return { success: true }
}

export async function addManagerToAllFreelancers(userId: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminContext()
  if ("error" in ctx) return { success: false, error: ctx.error }
  const admin = adminSupabase()

  const { data: allFreelancers } = await admin
    .from("freelancers")
    .select("id")
    .eq("company_id", ctx.companyId)

  if (!allFreelancers?.length) return { success: true }

  const rows = allFreelancers.map((f: { id: string }) => ({
    company_id: ctx.companyId,
    freelancer_id: f.id,
    user_id: userId,
  }))

  const { error } = await admin
    .from("freelancer_assignments")
    .upsert(rows, { onConflict: "freelancer_id,user_id", ignoreDuplicates: true })

  if (error) return { success: false, error: error.message }

  revalidatePath("/admin/team")
  revalidatePath("/member/freelancers")
  return { success: true }
}

export async function removeManagerFromAllFreelancers(userId: string): Promise<{ success: boolean; error?: string }> {
  const ctx = await getAdminContext()
  if ("error" in ctx) return { success: false, error: ctx.error }
  const admin = adminSupabase()

  const { error } = await admin
    .from("freelancer_assignments")
    .delete()
    .eq("company_id", ctx.companyId)
    .eq("user_id", userId)

  if (error) return { success: false, error: error.message }

  revalidatePath("/admin/team")
  revalidatePath("/member/freelancers")
  return { success: true }
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
pnpm typecheck 2>&1 | grep freelancer-manager
```
Expected: no output (no errors for this file).

- [ ] **Step 3: Commit**

```bash
git add lib/actions/freelancer-manager.ts
git commit -m "feat: add addManagerToAllFreelancers and removeManagerFromAllFreelancers actions"
```

---

## Task 2: Fetch assigned manager IDs in the team page

**Files:**
- Modify: `app/admin/team/page.tsx`

**Interfaces:**
- Consumes: `freelancer_assignments` table columns `user_id, company_id`
- Produces: `assignedManagerIds: string[]` prop passed to `<TeamClient />`

- [ ] **Step 1: Add the assigned manager IDs query to the `Promise.all` in `page.tsx`**

Current `Promise.all` at line 32 fetches `[members, pastMembers, freelancersData]`. Add a fourth query and extract distinct user IDs.

Replace the entire `Promise.all` block and the `return` statement (lines 32–57) with:

```typescript
  const [
    { data: members, error: membersError },
    { data: pastMembers },
    { data: freelancersData },
    { data: assignmentRows },
  ] = await Promise.all([
    admin
      .from('users')
      .select('id, name, employee_id, role, email, phone, status, team, position, created_at, employment_type, monthly_salary, hourly_rate, paid_leave_days, deleted_at, date_of_birth, joined_at, gender, passport_photo_url')
      .eq('company_id', profile.company_id)
      .neq('role', 'FREELANCER')
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    admin
      .from('users')
      .select('id, name, employee_id, role, email, phone, status, team, position, created_at, employment_type, monthly_salary, hourly_rate, paid_leave_days, deleted_at, date_of_birth, joined_at, gender, passport_photo_url')
      .eq('company_id', profile.company_id)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),
    admin
      .from('freelancers')
      .select('id, name, type, phone, upi_id, rating, status, cost_per_minute, cost_per_video, cost_per_hour, voice_type, editing_software, created_at, gender, title')
      .eq('company_id', profile.company_id)
      .order('name'),
    admin
      .from('freelancer_assignments')
      .select('user_id')
      .eq('company_id', profile.company_id),
  ])

  if (membersError) {
    console.error('[TeamPage] members query failed:', membersError.message)
  }

  const assignedManagerIds = [
    ...new Set((assignmentRows ?? []).map((r: { user_id: string }) => r.user_id))
  ]

  return (
    <TeamClient
      members={members ?? []}
      pastMembers={pastMembers ?? []}
      freelancers={freelancersData ?? []}
      initialSearch={initialSearch ?? ""}
      assignedManagerIds={assignedManagerIds}
    />
  )
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck 2>&1 | grep "admin/team/page"
```
Expected: no errors. (TypeScript will flag the missing prop on `TeamClient` — that gets fixed in Task 3.)

- [ ] **Step 3: Commit**

```bash
git add app/admin/team/page.tsx
git commit -m "feat: fetch assigned manager IDs and pass to TeamClient"
```

---

## Task 3: Redesign AssignManagerSheet in team-client.tsx

**Files:**
- Modify: `app/admin/team/team-client.tsx`

**Interfaces:**
- Consumes:
  - `addManagerToAllFreelancers(userId: string): Promise<{ success: boolean; error?: string }>` (Task 1)
  - `removeManagerFromAllFreelancers(userId: string): Promise<{ success: boolean; error?: string }>` (Task 1)
  - `assignedManagerIds: string[]` (Task 2)

- [ ] **Step 1: Add the two new imports to the import line at the top of `team-client.tsx`**

Find this line (line 13):
```typescript
import { createFreelancer, assignAllFreelancersToMembers, deleteFreelancer } from "@/lib/actions/freelancers"
```
Add a new import line directly below it:
```typescript
import { addManagerToAllFreelancers, removeManagerFromAllFreelancers } from "@/lib/actions/freelancer-manager"
```

- [ ] **Step 2: Add `assignedManagerIds` prop to `TeamClient`**

Find line 999:
```typescript
export default function TeamClient({ members, pastMembers, freelancers: initFreelancers = [], initialSearch = "" }: { members: Member[]; pastMembers: Member[]; freelancers?: FreelancerBasic[]; initialSearch?: string }) {
```
Replace with:
```typescript
export default function TeamClient({ members, pastMembers, freelancers: initFreelancers = [], initialSearch = "", assignedManagerIds = [] }: { members: Member[]; pastMembers: Member[]; freelancers?: FreelancerBasic[]; initialSearch?: string; assignedManagerIds?: string[] }) {
```

- [ ] **Step 3: Pass `assignedManagerIds` to `AssignManagerSheet` at the call site**

Find lines 1862–1866:
```typescript
      <AssignManagerSheet
        open={assignSheetOpen}
        onClose={() => setAssignSheetOpen(false)}
        members={members}
      />
```
Replace with:
```typescript
      <AssignManagerSheet
        open={assignSheetOpen}
        onClose={() => setAssignSheetOpen(false)}
        members={members}
        assignedManagerIds={assignedManagerIds}
      />
```

- [ ] **Step 4: Replace the entire `AssignManagerSheet` function (lines 891–993) with the new implementation**

```typescript
// ── Assign Manager Sheet ──────────────────────────────────────────────────────

function AssignManagerSheet({
  open, onClose, members, assignedManagerIds: initialAssignedIds = [],
}: {
  open: boolean
  onClose: () => void
  members: Member[]
  assignedManagerIds?: string[]
}) {
  const router = useRouter()
  const [assigned, setAssigned]   = useState<string[]>(initialAssignedIds)
  const [selected, setSelected]   = useState<string[]>([])
  const [removing, setRemoving]   = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [removeErr, setRemoveErr] = useState<string | null>(null)
  const [assignErr, setAssignErr] = useState<string | null>(null)

  // Sync when modal opens with fresh server data
  useEffect(() => {
    if (open) {
      setAssigned(initialAssignedIds)
      setSelected([])
      setRemoving(null)
      setSaving(false)
      setRemoveErr(null)
      setAssignErr(null)
    }
  }, [open, initialAssignedIds.join(",")])

  function close() { onClose() }

  const idNum = (id: string) => { const m = id.match(/\d+/); return m ? parseInt(m[0]) : 99999 }

  const allMembers = [...members]
    .filter(m => m.role === "MEMBER")
    .sort((a, b) => idNum(a.employee_id) - idNum(b.employee_id))

  const assignedMembers   = allMembers.filter(m => assigned.includes(m.id))
  const availableMembers  = allMembers.filter(m => !assigned.includes(m.id))

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleRemove(userId: string) {
    setRemoving(userId)
    setRemoveErr(null)
    const res = await removeManagerFromAllFreelancers(userId)
    setRemoving(null)
    if (!res.success) { setRemoveErr(res.error ?? "Failed to remove"); return }
    setAssigned(prev => prev.filter(id => id !== userId))
    router.refresh()
  }

  async function handleAssign() {
    if (selected.length === 0) return
    setSaving(true)
    setAssignErr(null)
    for (const userId of selected) {
      const res = await addManagerToAllFreelancers(userId)
      if (!res.success) { setAssignErr(res.error ?? "Failed to assign"); setSaving(false); return }
    }
    setAssigned(prev => [...prev, ...selected])
    setSelected([])
    setSaving(false)
    router.refresh()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div className="relative ml-auto h-full w-full max-w-[420px] bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">Assign Manager</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">Select who manages all freelancers</p>
          </div>
          <button onClick={close}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

          {/* ── Currently Assigned ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
              Currently Assigned <span className="normal-case font-normal text-gray-400">({assignedMembers.length})</span>
            </p>
            {assignedMembers.length === 0 ? (
              <p className="text-[12px] text-gray-400 italic px-1">No managers assigned yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {assignedMembers.map(m => (
                  <div key={m.id}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
                    style={{ border: "2px solid rgba(249,115,22,0.35)", background: "rgba(249,115,22,0.04)" }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: "#F97316" }}>
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800 truncate">{m.name}</p>
                      <p className="text-[11px] text-gray-400">{m.employee_id} · {m.role}</p>
                    </div>
                    <button
                      onClick={() => handleRemove(m.id)}
                      disabled={removing === m.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50"
                      style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                      {removing === m.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <X size={11} />}
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {removeErr && (
              <p className="text-[11px] text-red-600 bg-red-50 px-3 py-2 rounded-xl mt-2">{removeErr}</p>
            )}
          </div>

          {/* ── Add Manager ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
              Add Manager <span className="normal-case font-normal text-gray-400">({selected.length} selected)</span>
            </p>
            {availableMembers.length === 0 ? (
              <p className="text-[12px] text-gray-400 italic px-1">All members are already assigned.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {availableMembers.map(m => {
                  const checked = selected.includes(m.id)
                  return (
                    <button key={m.id} type="button" onClick={() => toggleSelect(m.id)}
                      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all"
                      style={{
                        border: checked ? "2px solid #F97316" : "2px solid #E5E7EB",
                        background: checked ? "rgba(249,115,22,0.05)" : "#FAFAFA",
                      }}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                        style={{ background: checked ? "#F97316" : "#E5E7EB" }}>
                        {checked && <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{m.name}</p>
                        <p className="text-[11px] text-gray-400">{m.employee_id} · {m.role}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {assignErr && (
              <p className="text-[11px] text-red-600 bg-red-50 px-3 py-2 rounded-xl mt-2">{assignErr}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={close}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all">
            Close
          </button>
          <button type="button" onClick={handleAssign}
            disabled={saving || selected.length === 0}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: saving ? "#fdba74" : "#F97316" }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  )
}
```

Note: `useEffect` is already imported at the top of `team-client.tsx`. `Loader2` is already imported. `useRouter` is already imported.

- [ ] **Step 5: Typecheck the full file**

```bash
pnpm typecheck 2>&1 | grep "admin/team"
```
Expected: no errors.

- [ ] **Step 6: Start dev server and manually test**

```bash
pnpm dev
```

Open `http://localhost:3000/admin/team`, switch to the Freelancer tab, click "Assign Manager":
- Verify "Currently Assigned" section shows members who were previously assigned (orange checkmark rows)
- Verify "Add Manager" section shows only unassigned MEMBER-role users
- Select one member from "Add Manager" and click Assign → member moves to "Currently Assigned"; selected list clears
- Click Remove on an assigned manager → they move back to "Add Manager"; no page freeze
- If all members assigned → "Add Manager" shows "All members are already assigned."
- If none assigned → "Currently Assigned" shows "No managers assigned yet."

- [ ] **Step 7: Commit**

```bash
git add app/admin/team/team-client.tsx
git commit -m "feat: redesign AssignManagerSheet with assigned/available sections and remove support"
```

---

## Self-Review

**Spec coverage:**
- ✅ Assigned managers no longer appear in the "add" list
- ✅ Assigned managers show in top section with Remove button
- ✅ Remove action deletes all `freelancer_assignments` rows for that user
- ✅ Assign action upserts with `ignoreDuplicates` — no duplicate rows possible
- ✅ Unassigning makes the member immediately available in the add list (optimistic)
- ✅ Real-time update via optimistic state + `router.refresh()`
- ✅ No new migrations required

**Placeholder scan:** None found.

**Type consistency:**
- `addManagerToAllFreelancers(userId: string)` defined in Task 1, consumed in Task 3 ✅
- `removeManagerFromAllFreelancers(userId: string)` defined in Task 1, consumed in Task 3 ✅
- `assignedManagerIds: string[]` produced by Task 2, consumed by `TeamClient` + `AssignManagerSheet` in Task 3 ✅
