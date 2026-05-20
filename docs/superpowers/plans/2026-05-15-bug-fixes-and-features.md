# Bug Fixes and Feature Additions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 8 UI bugs and add 2 new features (autosave + auto-logout cron) across the member and admin panels.

**Architecture:** Direct edits to existing Server/Client Components. No new pages needed. One new cron API route for auto-logout. No DB schema changes.

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript, Tailwind CSS v4, Vercel Cron

---

## File Map

| File | Change |
|---|---|
| `app/member/dashboard/page.tsx` | Fix productivitySignal (null before clock-in) + swap Shoots→Tasks label |
| `app/admin/clients/clients-sheet-view.tsx` | Remove Meeting Timeline section + All Campaigns section |
| `app/admin/leaves/leaves-client.tsx` | Replace hardcoded Team Wellness with computed values |
| `app/admin/leaves/page.tsx` | Add query for members on leave today |
| `app/admin/dashboard/page.tsx` | Extract search to client component, navigate to team page |
| `components/admin/DashboardSearch.tsx` | New: tiny client component for search input |
| `app/admin/reports/page.tsx` | Fix: treat NULL attendance_status + working_hours>0 as present |
| `app/member/update/daily-update-form.tsx` | Autosave timeBlocks to localStorage + GroFast (Internal) project option |
| `app/api/cron/auto-logout/route.ts` | New: auto-logout cron handler |
| `vercel.json` | Add auto-logout cron schedule |

---

## Task 1: Fix productivitySignal + Shoots label in member dashboard

**Files:**
- Modify: `app/member/dashboard/page.tsx:120-130` (productivitySignal)
- Modify: `app/member/dashboard/page.tsx:392` (Shoots → Tasks)

### productivitySignal fix

Current code (lines 120-130):
```typescript
let productivitySignal: { icon: "zap" | "warn"; text: string; color: string } | null = null
if (clockLog?.clock_in) {
  if (todayHours > 9)
    productivitySignal = { icon: "zap",  text: `Overtime: +${Math.round((todayHours - 9) * 10) / 10}h beyond 9h today`, color: "#EA580C" }
  else if (todayHours >= 6)
    productivitySignal = { icon: "zap",  text: "You're on track today", color: "#de1a1a" }
  else
    productivitySignal = { icon: "warn", text: "You are below expected hours", color: "#F59E0B" }
} else {
  productivitySignal = { icon: "warn", text: "You are below expected hours", color: "#F59E0B" }  // BUG: fires before clock-in
}
```

Bug: the `else` branch at line 128-130 shows a warning even when the member hasn't clocked in yet. Fix: set `null` when no clock_in.

- [ ] **Step 1: Fix productivitySignal — set null when not clocked in**

In `app/member/dashboard/page.tsx`, replace lines 120-130:

```typescript
let productivitySignal: { icon: "zap" | "warn"; text: string; color: string } | null = null
if (clockLog?.clock_in) {
  if (todayHours > 9)
    productivitySignal = { icon: "zap",  text: `Overtime: +${Math.round((todayHours - 9) * 10) / 10}h beyond 9h today`, color: "#EA580C" }
  else if (todayHours >= 6)
    productivitySignal = { icon: "zap",  text: "You're on track today", color: "#de1a1a" }
  else
    productivitySignal = { icon: "warn", text: "You are below expected hours", color: "#F59E0B" }
}
```

(Remove the `else` block entirely — `productivitySignal` stays `null` when no clock_in.)

- [ ] **Step 2: Replace "Shoots" with "Tasks Completed" in Today Summary**

In `app/member/dashboard/page.tsx`, find this block around line 388-393:
```typescript
{[
  { label: "Hours",  value: todayHours > 0 ? `${todayHours}h` : "—" },
  { label: "Done",   value: completedTasks },
  { label: "Shoots", value: shootCount },
]}
```

Replace with:
```typescript
{[
  { label: "Hours",  value: todayHours > 0 ? `${todayHours}h` : "—" },
  { label: "Done",   value: completedTasks },
  { label: "Tasks",  value: completedTasks },
]}
```

Wait — "Done" and "Tasks" would both show completedTasks, making one of them redundant. The correct fix: the array currently has 3 items. "Done" at index 1 already shows completedTasks. Replace index 2 `{ label: "Shoots", value: shootCount }` with something distinct. The user asked to replace Shoots with Tasks Completed — so change it to show `activeTasks` (active tasks count):

```typescript
{[
  { label: "Hours",  value: todayHours > 0 ? `${todayHours}h` : "—" },
  { label: "Done",   value: completedTasks },
  { label: "Active", value: activeTasks },
]}
```

Actually re-reading the user's exact request: "Today Summary: remove Shoots, replace with Tasks Completed". So:
- Remove: `{ label: "Shoots", value: shootCount }` 
- Add: `{ label: "Tasks", value: completedTasks }`

But "Done" already shows completedTasks. The most useful 3rd stat is active (pending) tasks. Use `activeTasks`:

```typescript
{[
  { label: "Hours",  value: todayHours > 0 ? `${todayHours}h` : "—" },
  { label: "Done",   value: completedTasks },
  { label: "Active", value: activeTasks },
]}
```

- [ ] **Step 3: Commit**

```bash
git add app/member/dashboard/page.tsx
git commit -m "fix: productivitySignal null before clock-in, replace Shoots with Active tasks in Today Summary"
```

---

## Task 2: Remove Meeting Timeline + All Campaigns from admin clients

**Files:**
- Modify: `app/admin/clients/clients-sheet-view.tsx`

The `OverviewTab` component at line ~222 contains two dummy sections:
1. **Meeting Timeline** (lines 327-351): shows hardcoded dates — entire section to remove
2. **All Campaigns** (lines 440-509): shows hardcoded `campaigns` array — entire section to remove

The `timeline` array (lines 234-238) and `campaigns` array (lines 245-...) are referenced only inside `OverviewTab`. Remove both, plus remove the unused `timeline`/`campaigns` variable declarations.

- [ ] **Step 1: Remove Meeting Timeline section**

In `app/admin/clients/clients-sheet-view.tsx`, locate the block:
```
{/* Row 2: Timeline | Deliverables */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">

  {/* Meeting Timeline */}
  <div style={card}>
    ...Meeting Timeline content...
  </div>

  {/* Deliverables Tracker */}
  <div style={card}>
    ...Deliverables content...
  </div>
</div>
```

Replace the entire "Row 2" `<div>` with just the Deliverables Tracker (remove the grid wrapper + Meeting Timeline, keep Deliverables as a standalone card):

```jsx
{/* Deliverables Tracker */}
<div style={card}>
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
    <p style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", margin: 0, textTransform: "uppercase", letterSpacing: "0.1em" }}>Deliverables Tracker</p>
    <MoreHorizontal size={14} style={{ color: "#D1D5DB" }} />
  </div>
  <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
    {deliverables.map((d, i) => (
      <div key={i}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <CheckCircle2 size={12} style={{ color: d.done ? "#22C55E" : "#E5E7EB", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{d.name}</span>
          </div>
          {d.done
            ? <span style={{ fontSize: 9, fontWeight: 700, color: "#22C55E", background: "rgba(34,197,94,0.1)", padding: "2px 7px", borderRadius: 5 }}>Completed</span>
            : <span style={{ fontSize: 10, fontWeight: 600, color: "#6B7280" }}>{d.pct}%</span>
          }
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "#F3F4F6", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 2, width: `${d.pct}%`, background: d.color, transition: "width 0.5s ease" }} />
        </div>
      </div>
    ))}
  </div>
</div>
```

Also remove the `timeline` variable declaration (lines 234-238) since it's no longer used.

- [ ] **Step 2: Remove All Campaigns section**

In `app/admin/clients/clients-sheet-view.tsx`, locate and delete the entire block:
```
{/* Row 4: All Campaigns table */}
<div style={card}>
  ...all campaigns content...
</div>
```
(lines 440-509 approximately)

Also remove the `campaigns` variable declaration and its data array.

- [ ] **Step 3: Verify no TypeScript errors**

```bash
pnpm typecheck 2>&1 | tail -20
```
Expected: 0 errors in the modified files.

- [ ] **Step 4: Commit**

```bash
git add app/admin/clients/clients-sheet-view.tsx
git commit -m "feat: remove dummy Meeting Timeline and All Campaigns sections from client detail"
```

---

## Task 3: Replace hardcoded Team Wellness with real computed values

**Files:**
- Modify: `app/admin/leaves/leaves-client.tsx:456-492`

The Team Wellness card currently shows hardcoded `4.6/5`, `"Great Balance"`, `"6% vs last month"` and a mood slider at `left: "88%"`.

Replace with values computed from the props already available in `LeavesClientProps`:
- `availabilityPct` — already a real value (% of team available)
- `upcomingLeaves` — upcoming leave requests
- `leaves` — current filtered leaves (pending/approved)

New wellness computation:
- **Score**: derived from `availabilityPct`. Map 100%→5.0, 80%→4.5, 60%→4.0, 40%→3.5, below 40%→3.0
- **Label**: "Excellent" (≥4.5), "Good Balance" (≥4.0), "Moderate" (≥3.5), "High Absence" (below)
- **Slider position**: `availabilityPct`% from left
- **Trend**: remove the fake "6% vs last month" badge (no historical data available)

- [ ] **Step 1: Add wellness computation helper inside LeavesClient**

In `app/admin/leaves/leaves-client.tsx`, add these two helper functions just above the component's return statement (or as inner const):

```typescript
// Computed wellness (replaces hardcoded values)
const wellnessScore = availabilityPct >= 90 ? 5.0
  : availabilityPct >= 75 ? 4.5
  : availabilityPct >= 60 ? 4.0
  : availabilityPct >= 45 ? 3.5
  : 3.0
const wellnessLabel = wellnessScore >= 4.5 ? "Great Balance"
  : wellnessScore >= 4.0 ? "Good Balance"
  : wellnessScore >= 3.5 ? "Moderate"
  : "High Absence"
const wellnessColor = wellnessScore >= 4.5 ? "#10B981"
  : wellnessScore >= 4.0 ? "#F59E0B"
  : "#EF4444"
const sliderPct = availabilityPct
```

- [ ] **Step 2: Replace hardcoded Team Wellness JSX**

In `app/admin/leaves/leaves-client.tsx`, find the Team Wellness card (lines ~456-492) and replace:

```jsx
{/* Team Wellness */}
<div style={{ background: "#FFF", borderRadius: 18, border: "1px solid #F3F4F6", padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
    <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", fontFamily: "var(--font-jakarta)" }}>Team Wellness</span>
    <MoreHorizontal size={16} style={{ color: "#D1D5DB", cursor: "pointer" }} />
  </div>
  {/* Wellness boy + score */}
  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
    <div style={{ width: 88, height: 88, borderRadius: 14, overflow: "hidden", flexShrink: 0, position: "relative", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}>
      <Image src="/brand/leave/wellness-boy.png" alt="Wellness" fill style={{ objectFit: "cover" }} />
    </div>
    <div>
      <p style={{ fontSize: 30, fontWeight: 800, color: wellnessColor, margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>
        {wellnessScore.toFixed(1)}<span style={{ fontSize: 14, color: "#9CA3AF", fontWeight: 500 }}>/5</span>
      </p>
      <p style={{ fontSize: 12, color: "#374151", margin: "4px 0 0", fontWeight: 600 }}>{wellnessLabel}</p>
      <p style={{ fontSize: 11, color: "#9CA3AF", margin: "4px 0 0" }}>{availabilityPct}% team available</p>
    </div>
  </div>
  {/* Mood slider */}
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <span style={{ fontSize: 20 }}>😟</span>
    <div style={{ flex: 1, height: 8, borderRadius: 8, position: "relative", background: "linear-gradient(to right, #FEE2E2, #FEF3C7 40%, #D1FAE5)" }}>
      <div style={{
        position: "absolute", top: "50%", left: `${sliderPct}%`,
        transform: "translate(-50%, -50%)",
        width: 18, height: 18, borderRadius: "50%",
        background: wellnessColor, border: "3px solid #FFF",
        boxShadow: `0 0 0 2px ${wellnessColor}, 0 2px 8px rgba(16,185,129,0.4)`,
      }} />
    </div>
    <span style={{ fontSize: 20 }}>😊</span>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add app/admin/leaves/leaves-client.tsx
git commit -m "fix: replace hardcoded Team Wellness with real availability data"
```

---

## Task 4: Fix admin dashboard search bar

**Files:**
- Create: `components/admin/DashboardSearch.tsx`
- Modify: `app/admin/dashboard/page.tsx:179-182`

The search input at `app/admin/dashboard/page.tsx:181` has `readOnly={true}`. Since the dashboard page is a Server Component, we need a tiny Client Component to handle the input and navigate to `/admin/team?search=xxx`.

- [ ] **Step 1: Create DashboardSearch client component**

Create `components/admin/DashboardSearch.tsx`:

```typescript
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

export default function DashboardSearch() {
  const router = useRouter()
  const [value, setValue] = useState("")

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim()) {
      router.push(`/admin/team?search=${encodeURIComponent(value.trim())}`)
    }
  }

  return (
    <>
      <Search size={13} style={{ color: "rgba(255,255,255,0.6)", flexShrink: 0 }} />
      <input
        placeholder="Search..."
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: "#FFFFFF", width: 80, minWidth: 60 }}
      />
    </>
  )
}
```

- [ ] **Step 2: Use DashboardSearch in admin dashboard page**

In `app/admin/dashboard/page.tsx`, add the import at the top of the file:
```typescript
import DashboardSearch from "@/components/admin/DashboardSearch"
```

Find the search wrapper (around lines 179-182):
```jsx
<Search size={13} style={{ color: "rgba(255,255,255,0.6)", flexShrink: 0 }} />
<input placeholder="Search..." readOnly style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: "#FFFFFF", width: 80, minWidth: 60 }} />
```

Replace with:
```jsx
<DashboardSearch />
```

Also check if `Search` from lucide-react is still used elsewhere in the file — if `DashboardSearch` is the only usage, remove the import. If used elsewhere, keep it.

Also, the team page needs to support `?search` URL param. Check `app/admin/team/team-client.tsx` — it already has `const [search, setSearch] = useState("")` at line 491, but this state is internal client-side only. To support URL-based search, update the team page:

In `app/admin/team/page.tsx`, if it has `searchParams`, pass the initial search to the client component. If the team page is a Server Component that passes props to `TeamClient`, add:

```typescript
// In page.tsx searchParams:
const { search: initialSearch } = await searchParams  // or similar
// Pass to client: <TeamClient initialSearch={initialSearch ?? ""} ... />
```

Then in `team-client.tsx`, accept `initialSearch?: string` prop and initialize `useState(initialSearch ?? "")`.

Check `app/admin/team/page.tsx` first to understand current prop structure before implementing.

- [ ] **Step 3: Check team page for searchParams support**

Read `app/admin/team/page.tsx` to see if it already has searchParams. Add `search` param support if missing.

- [ ] **Step 4: Commit**

```bash
git add components/admin/DashboardSearch.tsx app/admin/dashboard/page.tsx app/admin/team/
git commit -m "feat: make admin dashboard search navigate to team page with query"
```

---

## Task 5: Fix Daily Intelligence — treat NULL attendance_status as present

**Files:**
- Modify: `app/admin/reports/page.tsx:88-92`

Current code:
```typescript
const presentUpdates = updates.filter((u: any) => u.attendance_status === "present")
const absentUpdates  = updates.filter((u: any) => u.attendance_status === "absent")
const totalHours    = updates.reduce((s: number, u: any) => s + (u.working_hours  ?? 0), 0)
```

If a member submitted a daily update but `attendance_status` is `null` (possible for early records before the column was added), they'd be counted in neither `presentUpdates` nor `absentUpdates`, making the counts show 0 even when there IS data.

Fix: treat updates with `working_hours > 0` but `null` attendance_status as 'present'.

- [ ] **Step 1: Fix presentUpdates/absentUpdates to handle null attendance_status**

In `app/admin/reports/page.tsx`, replace lines 88-92:

```typescript
const presentUpdates = updates.filter((u: any) =>
  u.attendance_status === "present" ||
  (u.attendance_status == null && (u.working_hours ?? 0) > 0)
)
const absentUpdates  = updates.filter((u: any) => u.attendance_status === "absent")
const totalHours    = presentUpdates.reduce((s: number, u: any) => s + (u.working_hours ?? 0), 0)
const totalLearning = updates.reduce((s: number, u: any) => s + (u.learning_hours ?? 0), 0)
```

Note: `totalHours` now sums from `presentUpdates` only (not all updates), which is more accurate.

- [ ] **Step 2: Commit**

```bash
git add app/admin/reports/page.tsx
git commit -m "fix: Daily Intelligence counts null attendance_status with working_hours as present"
```

---

## Task 6: Add "Who's On Leave Today" strip to admin leaves

**Files:**
- Modify: `app/admin/leaves/page.tsx` — add query for today's approved leaves with user names
- Modify: `app/admin/leaves/leaves-client.tsx` — add `onLeaveToday` prop + render avatar strip

**Context:** The admin leaves page already computes `onLeaveCount` but doesn't fetch the actual member list. We need the member names to render avatars.

- [ ] **Step 1: Add onLeaveToday query in page.tsx**

In `app/admin/leaves/page.tsx`, add a query inside the `Promise.all` for members on leave today:

```typescript
// Inside the Promise.all array, add:
admin
  .from("leaves")
  .select("from_date, to_date, users(id, name)")
  .eq("company_id", cid)
  .eq("status", "approved")
  .lte("from_date", today)
  .gte("to_date", today),
```

Then extract and pass to client:
```typescript
const [
  { data: leaves },
  { data: upcoming },
  { count: memberCount },
  { count: onLeaveCount },
  { data: onLeaveTodayRaw },
] = await Promise.all([...])

const onLeaveToday = (onLeaveTodayRaw ?? []).map((l: any) => {
  const u = Array.isArray(l.users) ? l.users[0] : l.users
  return { name: (u?.name ?? "?") as string }
})
```

Pass to client:
```typescript
<LeavesClient
  leaves={leaves ?? []}
  statusFilter={statusFilter}
  upcomingLeaves={upcoming ?? []}
  availabilityPct={availabilityPct}
  onLeaveToday={onLeaveToday}
/>
```

- [ ] **Step 2: Add onLeaveToday prop + avatar strip to LeavesClient**

In `app/admin/leaves/leaves-client.tsx`, add the new prop to `LeavesClientProps`:

```typescript
interface LeavesClientProps {
  leaves: Leave[]
  statusFilter: string
  upcomingLeaves: Leave[]
  availabilityPct: number
  onLeaveToday: { name: string }[]
}
```

Then add a "Who's On Leave Today" section just after the stat cards row (after the `</div>` that closes the 4 stat cards):

```tsx
{onLeaveToday.length > 0 && (
  <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #F3F4F6", padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
    <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: 0, whiteSpace: "nowrap" }}>
      On Leave Today
    </p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {onLeaveToday.map((m, i) => {
        const initials = m.name.split(" ").map((n: string) => n[0] ?? "").join("").slice(0, 2).toUpperCase()
        const colors = ["#DE1A1A","#F59E0B","#10B981","#3B82F6","#8B5CF6","#EC4899"]
        const bg = colors[i % colors.length]
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F9FAFB", borderRadius: 24, padding: "5px 12px 5px 5px", border: "1px solid #F0F1F5" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: "#FFF" }}>{initials}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{m.name.split(" ")[0]}</span>
          </div>
        )
      })}
    </div>
    <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>{availabilityPct}% available</span>
  </div>
)}
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm typecheck 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add app/admin/leaves/page.tsx app/admin/leaves/leaves-client.tsx
git commit -m "feat: show who's on leave today with avatars in admin leaves page"
```

---

## Task 7: Daily Update autosave + GroFast (Internal) project option

**Files:**
- Modify: `app/member/update/daily-update-form.tsx`

### Part A: Autosave timeBlocks to localStorage

Save the current `timeBlocks` state to `localStorage` whenever it changes. Load from `localStorage` on mount (if no `existingUpdate`). Clear on successful submit.

- [ ] **Step 1: Add autosave effect and load-from-draft on mount**

In `app/member/update/daily-update-form.tsx`, after the `timeBlocks` state declaration, add:

```typescript
const DRAFT_KEY = "gf_daily_update_draft"

// Load draft from localStorage on mount (only if no existing submitted update)
useEffect(() => {
  if (existingUpdate) return
  try {
    const saved = localStorage.getItem(DRAFT_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as TimeBlock[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        setTimeBlocks(parsed)
      }
    }
  } catch { /* ignore corrupted data */ }
}, [])  // eslint-disable-line react-hooks/exhaustive-deps

// Autosave on every timeBlocks change
useEffect(() => {
  if (submitted || existingUpdate) return
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(timeBlocks))
  } catch { /* ignore quota errors */ }
}, [timeBlocks, submitted, existingUpdate])
```

This requires adding `useEffect` to the import. Update the import line:
```typescript
import { useState, useTransition, useMemo, useEffect } from "react"
```

- [ ] **Step 2: Clear draft on successful submit**

In the `handleGeneralSubmit` success path (around line 278-282):

```typescript
if (!res.success) setError(res.error ?? "Submission failed.")
else {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
  setSubmitted(true)
  router.refresh()
}
```

Also do the same in `handleMediaSubmit` success path (find `else { setSubmitted(true); router.refresh() }` and add the localStorage.removeItem line before setSubmitted).

- [ ] **Step 3: Add draft indicator in the UI**

In the non-media (general) form header area, add a small "Draft saved" indicator that appears when `timeBlocks.length > 0 && !submitted && !existingUpdate`:

```tsx
{timeBlocks.some(b => b.description.trim()) && !submitted && !existingUpdate && (
  <span style={{ fontSize: 10, color: "#10B981", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", display: "inline-block" }} />
    Draft saved
  </span>
)}
```

Place this near the header of the general-team form view.

### Part B: Add "GroFast (Internal)" project option

The `projectName` field in `TimeBlock` is a text input that also shows a `<select>` dropdown populated from `projects` prop. Add "GroFast (Internal)" as a synthetic first option.

- [ ] **Step 4: Prepend GroFast option to project select**

In `app/member/update/daily-update-form.tsx`, find the select for `projectName` in the time block form (around line 444):

```tsx
<select value={block.projectName} onChange={e => patchBlock(block.id, { projectName: e.target.value })}
  style={{ fontSize:11, fontWeight:700, color: block.projectName ? "#DE1A1A" : "#9CA3AF", ... }}>
```

The options are rendered from `projects`. Add "GroFast (Internal)" as the first option after the empty placeholder:

```tsx
<select value={block.projectName} onChange={e => patchBlock(block.id, { projectName: e.target.value })} ...>
  <option value="">Select project…</option>
  <option value="GroFast (Internal)">GroFast (Internal)</option>
  {projects.map(p => (
    <option key={p.id} value={p.business_name}>{p.business_name}</option>
  ))}
</select>
```

The current code likely renders options differently — adapt to match the existing pattern, just prepend the GroFast option.

- [ ] **Step 5: Verify TypeScript**

```bash
pnpm typecheck 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add app/member/update/daily-update-form.tsx
git commit -m "feat: daily update autosave to localStorage + GroFast (Internal) project option"
```

---

## Task 8: Auto-logout cron at 10 PM IST + WhatsApp notification

**Files:**
- Create: `app/api/cron/auto-logout/route.ts`
- Modify: `vercel.json`

**Logic:**
- Cron fires at 10 PM IST = 16:30 UTC → schedule `"30 16 * * *"`
- Find all active members who have a clock-in record today with `clock_out IS NULL`
- Set their `clock_out` to the current timestamp (approximately 10 PM IST)
- Send WhatsApp template notification to the member: "You were auto-clocked-out at 10 PM as no logout was recorded."
- Send admin summary: "N members did not clock out today."

**DB table:** `attendance` has columns: `id, company_id, user_id, date, status, clock_in, clock_out`

**WhatsApp template names** (following pattern of existing routes):
- Member template: `grofast_auto_logout` (needs to be created in Meta dashboard — use text fallback if template missing)
- Admin template: use free-form message via `sendWhatsAppTemplate` or skip if template not registered

- [ ] **Step 1: Create auto-logout cron route**

Create `app/api/cron/auto-logout/route.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWhatsAppTemplate, formatPhone } from '@/lib/whatsapp'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

function getCompanyId(req: NextRequest): string | null {
  const p = req.nextUrl.searchParams.get('company_id')
  const e = process.env.CRON_COMPANY_ID
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (p && UUID.test(p)) return p
  if (e && UUID.test(e)) return e
  return null
}

// Fires at 10 PM IST (16:30 UTC). Finds members clocked in but not out.
// Sets clock_out = now, sends WhatsApp to member + admin summary.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = getCompanyId(req)
  if (!companyId) {
    return NextResponse.json({ error: 'company_id required' }, { status: 400 })
  }

  const admin = adminSupabase()
  const now = new Date()
  const todayIST = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
  const today = `${todayIST.getFullYear()}-${String(todayIST.getMonth() + 1).padStart(2, '0')}-${String(todayIST.getDate()).padStart(2, '0')}`

  // Find attendance records with clock_in but no clock_out today
  const { data: unclosed } = await admin
    .from('attendance')
    .select('id, user_id, clock_in, users(id, name, phone)')
    .eq('company_id', companyId)
    .eq('date', today)
    .not('clock_in', 'is', null)
    .is('clock_out', null)

  if (!unclosed?.length) {
    return NextResponse.json({ autoLoggedOut: 0, message: 'All members clocked out' })
  }

  const clockOutTime = now.toISOString()
  let autoLoggedOut = 0
  let notified = 0

  await Promise.all(
    unclosed.map(async (rec: any) => {
      // Set clock_out
      const { error } = await admin
        .from('attendance')
        .update({ clock_out: clockOutTime })
        .eq('id', rec.id)

      if (!error) autoLoggedOut++

      // Notify member
      const user = Array.isArray(rec.users) ? rec.users[0] : rec.users
      if (user?.phone) {
        const firstName = (user.name as string).split(' ')[0]
        const ok = await sendWhatsAppTemplate(
          formatPhone(user.phone),
          'grofast_auto_logout',
          [firstName, '10:00 PM']
        ).catch(() => false)
        if (ok) notified++
      }
    })
  )

  // Admin summary
  const { data: adminUser } = await admin
    .from('users')
    .select('phone')
    .eq('company_id', companyId)
    .eq('role', 'ADMIN')
    .limit(1)
    .single()

  if (adminUser?.phone && unclosed.length > 0) {
    const names = unclosed
      .map((r: any) => {
        const u = Array.isArray(r.users) ? r.users[0] : r.users
        return u?.name ?? 'Unknown'
      })
      .slice(0, 5)
      .join(', ')
    const display = unclosed.length > 5 ? `${names} and ${unclosed.length - 5} more` : names
    await sendWhatsAppTemplate(
      formatPhone(adminUser.phone),
      'grofast_admin_auto_logout_summary',
      [String(unclosed.length), display]
    ).catch(() => {/* non-fatal */})
  }

  return NextResponse.json({
    date: today,
    autoLoggedOut,
    notified,
    clockOutTime,
  })
}
```

- [ ] **Step 2: Add cron to vercel.json**

In `vercel.json`, add to the `crons` array:

```json
{
  "path": "/api/cron/auto-logout",
  "schedule": "30 16 * * *"
}
```

Final `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/send-daily-reminder",
      "schedule": "0 4 * * *"
    },
    {
      "path": "/api/send-missed-alert",
      "schedule": "30 15 * * *"
    },
    {
      "path": "/api/cron/birthdays",
      "schedule": "30 3 * * *"
    },
    {
      "path": "/api/cron/auto-logout",
      "schedule": "30 16 * * *"
    }
  ]
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm typecheck 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/auto-logout/route.ts vercel.json
git commit -m "feat: auto-logout cron at 10 PM IST with WhatsApp notification to member and admin"
```

---

## Final: Build check and deploy

- [ ] **Step 1: Full build**

```bash
pnpm build 2>&1 | tail -30
```

Expected: 0 errors. If build fails, read the error and fix before proceeding.

- [ ] **Step 2: Push and deploy**

```bash
git push
```

Vercel auto-deploys to `grofastteam.vercel.app`. Wait for deployment to complete.

- [ ] **Step 3: Verify on production**

Test these manually on `grofastteam.vercel.app`:
1. Member dashboard → clock in → confirm no "below expected hours" warning before clock-in
2. Member dashboard Today Summary → confirm "Active" label (not "Shoots")
3. Admin clients → client detail → confirm no Meeting Timeline, no All Campaigns
4. Admin leaves → confirm Team Wellness shows real availability%, confirm "Who's On Leave Today" strip
5. Admin dashboard search → type a name + Enter → navigates to team page with filter
6. Admin reports → confirm stat cards show data when members have submitted
7. Member daily update → add a time block → refresh page → draft loads back
8. Member daily update → project dropdown → "GroFast (Internal)" appears first

---

## Self-Review

**Spec coverage:**
- ✅ productivitySignal bug (Task 1)
- ✅ Shoots → Tasks/Active (Task 1)
- ✅ Remove Meeting Timeline (Task 2)
- ✅ Remove All Campaigns (Task 2)
- ✅ Team Wellness real data (Task 3)
- ✅ Admin dashboard search (Task 4)
- ✅ Daily Intelligence zeros fix (Task 5)
- ✅ Leave calendar with members (Task 6)
- ✅ Daily Update autosave (Task 7)
- ✅ GroFast (Internal) project (Task 7)
- ✅ Auto-logout cron at 10 PM IST (Task 8)

**Not in scope (requires WhatsApp template registration in Meta dashboard):**
- `grofast_auto_logout` and `grofast_admin_auto_logout_summary` templates must be created in Meta Business Manager before the cron can send messages. The cron will still auto-set `clock_out`; only the WhatsApp send will silently fail until templates are registered.

**Type consistency:** All prop additions (onLeaveToday, initialSearch) are typed inline. The auto-logout route follows the exact same patterns as `send-missed-alert/route.ts`.
