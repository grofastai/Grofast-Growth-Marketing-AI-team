# Mobile Responsive + Member Panel Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every page in both the admin and member panels fully mobile-responsive, and ship the approved member panel feature improvements (attendance history, daily-update edits, leaf expiry, task assigned-by, history filters, simplified support).

**Architecture:** All layout changes use Tailwind responsive prefixes (default = mobile, `md:` = 768 px, `lg:` = 1024 px). Pages that use inline `style={{ display:"grid", gridTemplateColumns:"…" }}` for two-column splits get a `className` companion that collapses the columns at mobile widths. Tables get an `overflow-x-auto` scroll wrapper. The admin mobile bottom-nav gets a "More" slide-up sheet (identical pattern to the member sidebar) exposing the 7 pages currently unreachable on mobile.

**Tech Stack:** Next.js 15 App Router · TypeScript · Tailwind CSS v4 · Supabase · @dnd-kit/core · Lucide React · pnpm

---

## Responsive Patterns Reference (read before every task)

```
4-col stat grid    →  className="grid grid-cols-2 lg:grid-cols-4 gap-3"
3-col content grid →  className="grid grid-cols-1 md:grid-cols-3 gap-4"
2-col split layout →  className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4"
page padding       →  className="p-4 md:p-6 lg:p-8"
table wrapper      →  <div className="overflow-x-auto">…</div>
header flex row    →  style={{ display:"flex", flexWrap:"wrap", gap:12 }}
hide on mobile     →  className="hidden md:block"
show only mobile   →  className="md:hidden"
```

---

## Task 1 — Admin Sidebar: Add "More" Sheet for Mobile Nav

**Files:**
- Modify: `components/admin/sidebar.tsx`

The current mobile bottom nav shows only 5 items (Home, Team, Tasks, Leaves, Reports). Attendance, Clients, Announcements, Expenses, Payroll, Documents, Support are unreachable on mobile. This task adds a "More" button + slide-up sheet.

- [ ] **Step 1: Add `useState` + missing imports to sidebar**

Open `components/admin/sidebar.tsx`. Add `useState` to the React import and add `MoreHorizontal, X` to the lucide-react import block. Change the function signature to `"use client"` (already present). Add a `showMore` state variable.

```tsx
// At top — add to existing lucide import:
import {
  LayoutDashboard, Users, Clock, Target,
  CalendarOff, Megaphone, Briefcase, LogOut, BarChart2,
  Receipt, IndianRupee, FolderOpen, LifeBuoy,
  MoreHorizontal, X,            // ← add these two
} from "lucide-react"

// Add to React import:
import { useState } from "react"   // ← add useState
```

- [ ] **Step 2: Define `moreNavItems` array**

Add below the existing `bottomNavItems` definition (around line 34):

```tsx
const moreNavItems = [
  { label: "Attendance",    href: "/admin/attendance",    icon: Clock },
  { label: "Clients",       href: "/admin/clients",       icon: Briefcase },
  { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
  { label: "Expenses",      href: "/admin/expenses",      icon: Receipt },
  { label: "Payroll",       href: "/admin/payroll",       icon: IndianRupee },
  { label: "Documents",     href: "/admin/documents",     icon: FolderOpen },
  { label: "Support",       href: "/admin/support",       icon: LifeBuoy },
]
```

- [ ] **Step 3: Add `showMore` state inside the component**

Inside `export default function Sidebar()`, add:

```tsx
const [showMore, setShowMore] = useState(false)
const isMoreActive = moreNavItems.some(item => isActive(item.href))
```

- [ ] **Step 4: Replace mobile bottom nav JSX**

Find the `{/* ── Mobile Bottom Nav ── */}` section (around line 184) and replace it entirely with:

```tsx
{/* ── Mobile Bottom Nav ─────────────────────────────────────── */}
<nav
  className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2"
  style={{
    background: "linear-gradient(90deg, #0a100d 0%, #de1a1a 100%)",
    borderTop: `1px solid ${DIVIDER}`,
    height: "64px",
    paddingBottom: "env(safe-area-inset-bottom)",
  }}
>
  {bottomNavItems.map(({ label, href, icon: Icon }) => {
    const active = isActive(href)
    return (
      <Link
        key={href} href={href}
        className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all"
        style={active ? { color: "#FFFFFF", background: "rgba(255,255,255,0.12)" } : { color: "rgba(255,255,255,0.5)" }}
      >
        <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
        <span className="text-[10px] font-semibold leading-none">{label}</span>
      </Link>
    )
  })}
  {/* More button */}
  <button
    onClick={() => setShowMore(true)}
    className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all"
    style={{ color: isMoreActive ? "#FFFFFF" : "rgba(255,255,255,0.5)", background: isMoreActive ? "rgba(255,255,255,0.12)" : "none", border: "none", cursor: "pointer" }}
  >
    <MoreHorizontal size={20} strokeWidth={isMoreActive ? 2.5 : 1.8} />
    <span className="text-[10px] font-semibold leading-none">More</span>
  </button>
</nav>

{/* ── More Sheet ─────────────────────────────────────────────── */}
{showMore && (
  <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setShowMore(false)}>
    <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }} />
    <div
      className="absolute bottom-0 left-0 right-0 rounded-t-3xl"
      style={{ background: "#0f0f0f", border: "1px solid rgba(255,255,255,0.08)" }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
        <span className="text-[13px] font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>More Pages</span>
        <button onClick={() => setShowMore(false)}
          style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <X size={15} style={{ color: "rgba(255,255,255,0.7)" }} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4 pb-8">
        {moreNavItems.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href} href={href}
              onClick={() => setShowMore(false)}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-all"
              style={active
                ? { background: "rgba(255,255,255,0.18)", color: "#FFFFFF" }
                : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.7)" }
              }
            >
              <Icon size={22} strokeWidth={active ? 2.2 : 1.7} />
              <span className="text-[11px] font-semibold text-center leading-tight">{label}</span>
            </Link>
          )
        })}
        <form action={logoutAction}>
          <button type="submit"
            className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl w-full transition-all"
            style={{ background: "rgba(222,26,26,0.08)", color: "rgba(239,68,68,0.8)", border: "none", cursor: "pointer" }}>
            <LogOut size={22} strokeWidth={1.7} />
            <span className="text-[11px] font-semibold">Sign Out</span>
          </button>
        </form>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify build**

```bash
pnpm build
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add components/admin/sidebar.tsx
git commit -m "feat: add More sheet to admin mobile bottom nav — exposes 7 hidden pages"
```

---

## Task 2 — Admin Dashboard: Mobile Responsive

**Files:**
- Modify: `app/admin/dashboard/page.tsx`

The stat grid and middle row already use Tailwind responsive classes. Fix: the header row search bar + icons overflow on narrow screens, and the Quick Actions / bottom sections need responsive grids.

- [ ] **Step 1: Fix header row overflow**

Find the header `<div>` (the red gradient banner, around line 168). Change its inline style padding so it collapses on mobile and add `flexDirection` switching:

```tsx
// Find:
style={{ ..., padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, ... }}

// Replace padding + add flexDirection responsive:
// Keep the existing style but add className for padding
className="p-4 md:p-6"
// and ensure flexWrap:"wrap" is present (it already is)
```

Then find the icons row (search + bell + avatar, around line 178) and ensure it wraps gracefully — it already has `gap:10`. Hide the search bar on mobile since it's decorative:

```tsx
// Find the search input wrapper div and add className:
<div style={{ position: "relative" }} className="hidden sm:flex items-center ...">
```

- [ ] **Step 2: Fix Quick Actions grid**

Find the Quick Actions section (the 6-button grid). Change its grid to be 3-col on mobile, 6-col on lg:

```tsx
// Find:
style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10 }}

// Replace with className (remove inline grid style):
className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3"
// Keep the rest of the inline style for colors/border only
```

- [ ] **Step 3: Fix bottom two-column section**

Find any `gridTemplateColumns: "1fr 1fr"` or `"1fr 340px"` sections near the bottom of the page and replace with:

```tsx
className="grid grid-cols-1 lg:grid-cols-2 gap-4"
// or
className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4"
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/admin/dashboard/page.tsx
git commit -m "fix: admin dashboard mobile responsive — header, quick actions, bottom grid"
```

---

## Task 3 — Admin Activities: Mobile Responsive

**Files:**
- Modify: `app/admin/activities/activities-client.tsx`

- [ ] **Step 1: Fix filter bar**

Find the filter row (date input + member dropdown). It likely uses `display:"flex"` with no wrap. Add `flexWrap:"wrap"` and responsive gap:

```tsx
// Find the filter bar container div. Change:
style={{ display: "flex", gap: 12 }}
// To:
style={{ display: "flex", gap: 12, flexWrap: "wrap" }}
```

- [ ] **Step 2: Fix update cards grid**

The updates list likely uses a vertical stack — ensure each card has responsive padding:

```tsx
// Each update card outer div: replace fixed padding
style={{ padding: "16px 20px" }}
// with className="p-4 md:p-5" (keep color/border in style)
```

- [ ] **Step 3: Make member info in cards wrap on mobile**

Find the card inner flex row (avatar + name + status badges). Add `flexWrap:"wrap"`:

```tsx
style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/admin/activities/activities-client.tsx
git commit -m "fix: admin activities page mobile responsive"
```

---

## Task 4 — Admin Team: Mobile Responsive

**Files:**
- Modify: `app/admin/team/team-client.tsx`

- [ ] **Step 1: Find and fix member cards grid**

Search for where member cards are rendered (likely a `grid` or `flex` container mapping over members). Replace the inline grid with:

```tsx
// Replace:
style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}
// With className (remove gridTemplateColumns from inline style):
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
style={{ /* only non-layout styles */ }}
```

- [ ] **Step 2: Fix header actions bar**

The header row (title + "Add Member" button + search) needs to wrap on mobile:

```tsx
// Find the header container. Ensure:
className="flex flex-wrap items-center gap-3 mb-6"
```

- [ ] **Step 3: Fix member card modal / slide-out panel**

The add/edit member form is likely a modal or sheet. Ensure it uses `w-full max-w-lg` and scrolls on mobile:

```tsx
// Modal inner div:
className="w-full max-w-lg mx-auto max-h-[90vh] overflow-y-auto rounded-2xl"
```

- [ ] **Step 4: Fix form field grid inside modal**

Two-column field grids inside forms need to collapse:

```tsx
// Replace:
style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
// With className:
className="grid grid-cols-1 md:grid-cols-2 gap-3"
style={{ /* remove gridTemplateColumns */ }}
```

- [ ] **Step 5: Build check + commit**

```bash
pnpm build
git add app/admin/team/team-client.tsx
git commit -m "fix: admin team page mobile responsive — card grid, form modals"
```

---

## Task 5 — Admin Attendance: Mobile Responsive

**Files:**
- Modify: `app/admin/attendance/page.tsx`
- Modify: `app/admin/attendance/attendance-charts.tsx`

- [ ] **Step 1: Fix stat card row**

Find the row of 4 stat cards at the top. Ensure it uses:

```tsx
className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"
```

- [ ] **Step 2: Wrap attendance table in scroll container**

Find the `<table>` element. Wrap it:

```tsx
<div className="overflow-x-auto rounded-2xl">
  <table style={{ minWidth: 640 }}>
    {/* existing table content unchanged */}
  </table>
</div>
```

- [ ] **Step 3: Fix two-column chart + table layout**

Find any `gridTemplateColumns: "1fr 340px"` or similar two-column layout. Replace with:

```tsx
className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4"
style={{ /* remove gridTemplateColumns */ }}
```

- [ ] **Step 4: Fix charts on mobile**

In `attendance-charts.tsx`, ensure chart containers use `w-full` and responsive heights:

```tsx
// Each chart wrapper:
className="w-full"
style={{ height: 220 }}   // keep fixed height but let width be 100%
```

- [ ] **Step 5: Build check + commit**

```bash
pnpm build
git add app/admin/attendance/page.tsx app/admin/attendance/attendance-charts.tsx
git commit -m "fix: admin attendance page mobile responsive — table scroll, charts, stat grid"
```

---

## Task 6 — Admin Leaves: Mobile Responsive

**Files:**
- Modify: `app/admin/leaves/leaves-client.tsx`

- [ ] **Step 1: Fix status tab bar overflow**

The tabs (Pending / Approved / Rejected / All) overflow on small screens. Wrap in horizontal scroll:

```tsx
<div className="overflow-x-auto pb-1">
  <div className="flex gap-2 min-w-max">
    {STATUS_TABS.map(t => ( ... ))}
  </div>
</div>
```

- [ ] **Step 2: Fix leave cards layout**

Leave cards likely use `display:"flex"` with a lot of content. Add `flexWrap:"wrap"` and responsive padding:

```tsx
// Card outer:
className="p-4 md:p-5 rounded-2xl border"
style={{ background: ..., border: ... }}

// Card inner flex row (avatar + info + actions):
style={{ display: "flex", gap: 14, flexWrap: "wrap" }}
```

- [ ] **Step 3: Fix upcoming leaves sidebar**

If there's a two-column layout (leave list + upcoming sidebar), collapse it:

```tsx
className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4"
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/admin/leaves/leaves-client.tsx
git commit -m "fix: admin leaves page mobile responsive — tabs scroll, cards wrap"
```

---

## Task 7 — Admin Goals (Kanban): Mobile Responsive

**Files:**
- Modify: `app/admin/goals/goals-client.tsx`

The Kanban board is three columns side by side. On mobile it must scroll horizontally or collapse to a tabbed view.

- [ ] **Step 1: Wrap Kanban columns in horizontal scroll**

Find the columns container. Replace:

```tsx
// Find the 3-column Kanban container. Replace:
style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}

// With — horizontal scroll on mobile, 3-col on md+:
className="hidden md:grid md:grid-cols-3 gap-4"
```

- [ ] **Step 2: Add mobile single-column tabbed view**

Above the grid, add a mobile-only tab selector + single column view:

```tsx
{/* Mobile: tab selector */}
<div className="md:hidden flex gap-2 mb-4 overflow-x-auto pb-1">
  {(["todo","in_progress","completed"] as const).map(col => (
    <button
      key={col}
      onClick={() => setMobileCol(col)}
      className="flex-shrink-0 px-4 py-2 rounded-xl text-[13px] font-bold transition-all"
      style={mobileCol === col
        ? { background: STATUS_CONFIG[col].color, color: "#fff" }
        : { background: "#F3F4F6", color: "#6B7280" }}
    >
      {STATUS_CONFIG[col].label}
    </button>
  ))}
</div>
{/* Mobile: single column */}
<div className="md:hidden flex flex-col gap-3">
  {tasks.filter(t => t.status === mobileCol).map(task => (
    /* existing task card JSX — copy from the desktop column render */ 
    <TaskCard key={task.id} task={task} />
  ))}
</div>
```

Add `const [mobileCol, setMobileCol] = useState<"todo"|"in_progress"|"completed">("todo")` to state.

- [ ] **Step 3: Fix header + create task form**

Ensure the "Add Task" button and header wrap on mobile:

```tsx
className="flex flex-wrap items-center justify-between gap-3 mb-5"
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/admin/goals/goals-client.tsx
git commit -m "fix: admin goals Kanban mobile — tab view on mobile, horizontal scroll on md+"
```

---

## Task 8 — Admin Expenses: Mobile Responsive

**Files:**
- Modify: `app/admin/expenses/expenses-client.tsx`

- [ ] **Step 1: Fix stat card row**

```tsx
className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"
```

- [ ] **Step 2: Wrap expense table in scroll container**

```tsx
<div className="overflow-x-auto">
  <table style={{ minWidth: 700 }}>
    {/* existing */}
  </table>
</div>
```

- [ ] **Step 3: Fix header search + filter row**

```tsx
className="flex flex-wrap gap-3 items-center mb-4"
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/admin/expenses/expenses-client.tsx
git commit -m "fix: admin expenses page mobile responsive"
```

---

## Task 9 — Admin Clients: Mobile Responsive

**Files:**
- Modify: `app/admin/clients/clients-sheet-view.tsx`
- Modify: `app/admin/clients/[id]/project-detail-client.tsx`

- [ ] **Step 1: Fix client cards grid**

```tsx
// Replace fixed grid with:
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
```

- [ ] **Step 2: Wrap client table in scroll container**

```tsx
<div className="overflow-x-auto">
  <table style={{ minWidth: 600 }}>…</table>
</div>
```

- [ ] **Step 3: Fix project detail two-column layout**

```tsx
className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5"
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/admin/clients/clients-sheet-view.tsx app/admin/clients/[id]/project-detail-client.tsx
git commit -m "fix: admin clients pages mobile responsive"
```

---

## Task 10 — Admin Reports: Mobile Responsive

**Files:**
- Modify: `app/admin/reports/reports-client.tsx`

- [ ] **Step 1: Fix stat card row**

```tsx
className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"
```

- [ ] **Step 2: Fix chart grid**

```tsx
className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5"
```

- [ ] **Step 3: Wrap any tables in scroll container**

```tsx
<div className="overflow-x-auto">
  <table style={{ minWidth: 560 }}>…</table>
</div>
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/admin/reports/reports-client.tsx
git commit -m "fix: admin reports page mobile responsive"
```

---

## Task 11 — Admin Announcements + Support + Payroll + Documents: Mobile Responsive

**Files:**
- Modify: `app/admin/announcements/announcements-client.tsx`
- Modify: `app/admin/support/support-client.tsx`
- Modify: `app/admin/payroll/payroll-client.tsx`
- Modify: `app/admin/documents/documents-client.tsx`

Apply the same patterns to all four pages in one commit:

- [ ] **Step 1: Announcements — fix header + grid**

In `announcements-client.tsx`:
- Header controls (search + button): `className="flex flex-wrap gap-3 items-center"`
- Announcement cards: already vertical stack, just fix padding: `className="p-4 md:p-5"`

- [ ] **Step 2: Support — fix ticket list**

In `support-client.tsx`:
- Two-column layout (ticket list + detail): `className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4"`
- Ticket list scrolls on mobile by nature of vertical stack

- [ ] **Step 3: Payroll — fix table + stat row**

In `payroll-client.tsx`:
- Stat cards: `className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"`
- Payroll table: `<div className="overflow-x-auto"><table style={{ minWidth: 700 }}>…</table></div>`

- [ ] **Step 4: Documents — fix grid**

In `documents-client.tsx`:
- Document cards grid: `className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"`

- [ ] **Step 5: Build check + commit**

```bash
pnpm build
git add app/admin/announcements/announcements-client.tsx app/admin/support/support-client.tsx app/admin/payroll/payroll-client.tsx app/admin/documents/documents-client.tsx
git commit -m "fix: admin announcements, support, payroll, documents mobile responsive"
```

---

## Task 12 — Member Attendance: Date History Viewer

**Files:**
- Modify: `app/member/attendance/attendance-client.tsx`
- Modify: `lib/actions/attendance.ts`

- [ ] **Step 1: Add server action to fetch a specific date's log**

Open `lib/actions/attendance.ts` and add at the bottom:

```typescript
export async function getAttendanceByDate(date: string): Promise<{
  success: boolean
  log: { clock_in: string | null; clock_out: string | null; work_type: string | null; status: string } | null
  error?: string
}> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, log: null, error: "Not authenticated" }

  const { data, error } = await supabase
    .from("attendance_logs")
    .select("clock_in, clock_out, work_type, status")
    .eq("user_id", user.id)
    .eq("date", date)
    .maybeSingle()

  if (error) return { success: false, log: null, error: error.message }
  return { success: true, log: data }
}
```

- [ ] **Step 2: Add date history section to attendance client**

In `attendance-client.tsx`, add these imports:

```tsx
import { useState, useTransition } from "react"  // already imported; add CalendarSearch
import { CalendarSearch } from "lucide-react"     // add to existing lucide import
import { getAttendanceByDate } from "@/lib/actions/attendance"
```

Add new state variables inside the component (after existing state):

```tsx
const [historyDate, setHistoryDate] = useState("")
const [historyLog, setHistoryLog] = useState<{
  clock_in: string | null; clock_out: string | null; work_type: string | null; status: string
} | null | "loading" | "empty">(null)
const [historyPending, startHistoryTransition] = useTransition()

function handleHistoryDate(date: string) {
  setHistoryDate(date)
  if (!date) { setHistoryLog(null); return }
  setHistoryLog("loading")
  startHistoryTransition(async () => {
    const res = await getAttendanceByDate(date)
    if (!res.success || !res.log) setHistoryLog("empty")
    else setHistoryLog(res.log)
  })
}
```

- [ ] **Step 3: Add history section JSX**

Add this block at the very end of the component's returned JSX, below the `{/* ── Daily Insight + Summary ── */}` section:

```tsx
{/* ── View Past Attendance ─────────────────────────────────────── */}
<div className="rounded-3xl p-5 mt-5" style={{ background: "#FFFFFF", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
  <div className="flex items-center gap-3 mb-4">
    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.1)" }}>
      <CalendarSearch size={16} style={{ color: "#6366F1" }} />
    </div>
    <div>
      <h3 className="text-[15px] font-bold" style={{ color: "#111111" }}>View Past Attendance</h3>
      <p className="text-[11px]" style={{ color: "#9CA3AF" }}>Select a date to see your log</p>
    </div>
  </div>

  <input
    type="date"
    max={today}
    value={historyDate}
    onChange={e => handleHistoryDate(e.target.value)}
    className="rounded-xl px-3 py-2 text-[13px] font-semibold mb-4"
    style={{ border: "1.5px solid #EBEDF2", outline: "none", color: "#111111", background: "#F9FAFB" }}
  />

  {historyLog === "loading" && (
    <p className="text-[13px]" style={{ color: "#9CA3AF" }}>Loading…</p>
  )}
  {historyLog === "empty" && (
    <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No attendance record found for this date.</p>
  )}
  {historyLog && historyLog !== "loading" && historyLog !== "empty" && (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: "Status",    value: historyLog.status === "present" ? "Present" : historyLog.status === "absent" ? "Absent" : "No record", color: historyLog.status === "present" ? "#22C55E" : "#EF4444" },
        { label: "Work Mode", value: historyLog.work_type === "wfh" ? "WFH" : historyLog.work_type === "office" ? "Office" : "—", color: "#111111" },
        { label: "Log In",    value: fmtTime(historyLog.clock_in),  color: "#111111" },
        { label: "Log Out",   value: fmtTime(historyLog.clock_out), color: "#111111" },
      ].map(r => (
        <div key={r.label} className="rounded-2xl p-3" style={{ background: "#F9FAFB", border: "1px solid #EBEDF2" }}>
          <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#9CA3AF" }}>{r.label}</p>
          <p className="text-[14px] font-bold" style={{ color: r.color }}>{r.value}</p>
        </div>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/member/attendance/attendance-client.tsx lib/actions/attendance.ts
git commit -m "feat: member attendance — date history viewer"
```

---

## Task 13 — Member Daily Update: Remove Gauge, Fix Timeline, Edit After Submit

**Files:**
- Modify: `app/member/update/daily-update-form.tsx`
- Modify: `app/member/update/page.tsx`

- [ ] **Step 1: Remove Productivity Score gauge from media-team right sidebar**

In `daily-update-form.tsx`, find the `{/* Productivity Score */}` section inside the right sidebar panel (around line 956). Delete the entire block:

```tsx
// DELETE this entire div (from "Productivity Score" comment to its closing </div>):
<div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)" }}>
  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:12 }}>
    <BarChart2 size={14} style={{ color:"#DE1A1A" }} />
    <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:0 }}>Productivity Score</p>
  </div>
  <GaugeChart score={productivity} />
  <p style={{ fontSize:10, color:"#9CA3AF", textAlign:"center", marginTop:6 }}>
    {productivity === 0 ? "Fill in your entries above ✍️" : productivity >= 70 ? "You're on fire! 🔥" : "Keep going! 💪"}
  </p>
</div>
```

- [ ] **Step 2: Remove "Consistency is the key!" card**

Find and delete the consistency card block (around line 968):

```tsx
// DELETE this entire div:
<div style={{ background:"#FFFFFF", borderRadius:20, border:"1px solid #EBEDF2", padding:"18px 16px", boxShadow:"0 2px 10px rgba(0,0,0,0.05)", display:"flex", alignItems:"flex-start", gap:14 }}>
  <div style={{ fontSize:38, flexShrink:0, lineHeight:1 }}>🏆</div>
  <div>
    <p style={{ fontSize:13, fontWeight:800, color:"#111111", margin:"0 0 6px" }}>Consistency is the key!</p>
    <p style={{ fontSize:11, color:"#6B7280", margin:0, lineHeight:1.55 }}>Keep logging your shoots and edits to improve your productivity.</p>
  </div>
</div>
```

Also remove the Productivity Score from the non-media team sidebar (same pattern, around line 524).

- [ ] **Step 3: Fix non-media team time options to skip 7am–9am**

Find the `TIME_OPTIONS_15` constant (around line 57):

```tsx
// Replace:
const TIME_OPTIONS_15 = Array.from({ length: 65 }, (_, i) => {
  const mins = 6 * 60 + i * 15
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
})

// With two bands (6:00–7:00, then 9:00–22:00):
const TIME_OPTIONS_15 = [
  // 6:00 AM – 7:00 AM (5 slots)
  ...Array.from({ length: 5 }, (_, i) => {
    const mins = 6 * 60 + i * 15
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
  }),
  // 9:00 AM – 10:00 PM (53 slots)
  ...Array.from({ length: 53 }, (_, i) => {
    const mins = 9 * 60 + i * 15
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
  }),
]
```

- [ ] **Step 4: Add edit-after-submission support**

In `app/member/update/page.tsx`, check if today's update exists and pass it as a prop:

```tsx
// In the server component, add to the existing query:
const { data: todayUpdate } = await supabase
  .from("daily_updates")
  .select("id, active_tab, work_entries, learning_hours, learning_topic, learning_notes")
  .eq("user_id", user.id)
  .eq("date", today)
  .maybeSingle()

// Pass to the form:
<DailyUpdateForm
  projects={projects}
  userName={profile?.name ?? "Member"}
  team={profile?.team ?? null}
  existingUpdate={todayUpdate}   // ← add this prop
/>
```

In `daily-update-form.tsx`, add the `existingUpdate` prop and an "Edit" button on the submitted state:

```tsx
// Add to function signature:
existingUpdate?: { id: string; active_tab: string; work_entries: unknown[] | null; learning_hours: number | null; learning_topic: string | null; learning_notes: string | null } | null

// Change the initial submitted state:
const [submitted, setSubmitted] = useState(!!existingUpdate && !editMode)
const [editMode, setEditMode] = useState(false)
```

When `submitted && !editMode`, show the existing "Submitted" UI with an Edit button:

```tsx
{submitted && !editMode && (
  <div style={{ background:"#F5F6FA", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
    <div style={{ textAlign:"center" }}>
      <CheckCircle2 size={56} style={{ color:"#22C55E", marginBottom:16 }} />
      <p style={{ fontSize:20, fontWeight:900, color:"#111111", margin:"0 0 8px" }}>Already submitted today!</p>
      <p style={{ fontSize:13, color:"#6B7280", margin:"0 0 24px" }}>You've already logged your update for today.</p>
      <button
        onClick={() => { setSubmitted(false); setEditMode(true) }}
        style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"11px 24px", borderRadius:14, background:"#DE1A1A", color:"#FFFFFF", border:"none", cursor:"pointer", fontSize:13, fontWeight:700 }}
      >
        Edit Today&apos;s Update
      </button>
    </div>
  </div>
)}
```

The existing submit action already upserts (or if it doesn't, pass `{ onConflict: "user_id,date" }` to the supabase upsert call in the action).

- [ ] **Step 5: Build check + commit**

```bash
pnpm build
git add app/member/update/daily-update-form.tsx app/member/update/page.tsx
git commit -m "feat: member daily update — remove gauge, fix timeline, edit after submission"
```

---

## Task 14 — Member Tasks: Useful Search + Assigned-By Avatar

**Files:**
- Create: `supabase/migrations/027_tasks_created_by.sql`
- Modify: `app/member/tasks/page.tsx`
- Modify: `app/member/tasks/tasks-client.tsx`

- [ ] **Step 1: Create migration for `created_by` column**

Create `supabase/migrations/027_tasks_created_by.sql`:

```sql
-- Add created_by to tasks table to track who assigned the task
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Backfill: set created_by to the company's first admin for existing tasks
UPDATE tasks t
SET created_by = (
  SELECT u.id FROM users u
  WHERE u.company_id = t.company_id AND u.role = 'ADMIN'
  ORDER BY u.created_at ASC
  LIMIT 1
)
WHERE created_by IS NULL;
```

- [ ] **Step 2: Update tasks query to include assigner info**

In `app/member/tasks/page.tsx`, update the tasks select:

```tsx
// Replace:
.select("id, title, description, status, priority, due_date, projects(id, business_name)")

// With:
.select("id, title, description, status, priority, due_date, projects(id, business_name), assignedBy:users!tasks_created_by_fkey(id, name, position)")
```

- [ ] **Step 3: Update Task interface in tasks-client.tsx**

```tsx
interface Task {
  id: string
  title: string
  description: string | null
  status: "todo" | "in_progress" | "completed"
  priority: "low" | "medium" | "high"
  due_date: string | null
  projects: { id: string; business_name: string } | null
  assignedBy: { id: string; name: string; position: string | null } | null   // ← add
}
```

- [ ] **Step 4: Make search filter useful (title + description + project)**

Find the search filtering logic in `tasks-client.tsx`. Replace or augment:

```tsx
// Find where tasks are filtered for the search. Replace:
const filtered = tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))

// With:
const filtered = tasks.filter(t => {
  const q = search.toLowerCase()
  return (
    t.title.toLowerCase().includes(q) ||
    (t.description ?? "").toLowerCase().includes(q) ||
    (t.projects?.business_name ?? "").toLowerCase().includes(q)
  )
})
```

- [ ] **Step 5: Add assigned-by avatar to each task card**

In the task card JSX, add an avatar below or beside the task title:

```tsx
{/* Add inside each task card, after the title: */}
{task.assignedBy && (
  <div className="flex items-center gap-1.5 mt-1">
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black flex-shrink-0"
      style={{ background: "#de1a1a", color: "#FFFFFF" }}
      title={`Assigned by ${task.assignedBy.name}${task.assignedBy.position ? ` · ${task.assignedBy.position}` : ""}`}
    >
      {task.assignedBy.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
    </div>
    <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
      by {task.assignedBy.name}
      {task.assignedBy.position && ` · ${task.assignedBy.position}`}
    </span>
  </div>
)}
```

- [ ] **Step 6: Build check + commit**

```bash
pnpm build
git add supabase/migrations/027_tasks_created_by.sql app/member/tasks/page.tsx app/member/tasks/tasks-client.tsx
git commit -m "feat: member tasks — useful search, assigned-by avatar, created_by migration"
```

---

## Task 15 — Member Leaves: Auto-Expire + 3-Dot Menu

**Files:**
- Modify: `app/member/leaves/leaves-client.tsx`

- [ ] **Step 1: Compute and visually mark expired leaves**

At the top of the component (inside the function), add:

```tsx
const todayStr = new Date().toISOString().split("T")[0]

function isExpired(leave: Leave) {
  return leave.status === "pending" && leave.to_date < todayStr
}
```

- [ ] **Step 2: Show "Expired" badge on past-pending leaves**

Find where the status badge is rendered for each leave card. Add a condition before the normal status badge:

```tsx
// Replace the status badge render with:
{isExpired(leave) ? (
  <span style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:99, background:"rgba(107,114,128,0.1)", fontSize:11, fontWeight:700, color:"#6B7280" }}>
    Expired
  </span>
) : (
  // existing status badge JSX
  <span style={{ ... }}>
    <StatusIcon size={12} /> {STATUS_CFG[leave.status as keyof typeof STATUS_CFG]?.label}
  </span>
)}
```

- [ ] **Step 3: Add 3-dot dropdown on pending (non-expired) leaves**

Add state for tracking which leave's menu is open:

```tsx
const [menuOpen, setMenuOpen] = useState<string | null>(null)
const [editingLeave, setEditingLeave] = useState<Leave | null>(null)
```

Add the 3-dot button to each pending (not expired) leave card:

```tsx
{leave.status === "pending" && !isExpired(leave) && (
  <div style={{ position: "relative" }}>
    <button
      onClick={() => setMenuOpen(menuOpen === leave.id ? null : leave.id)}
      style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, display: "flex", alignItems: "center" }}
    >
      <MoreVertical size={16} style={{ color: "#9CA3AF" }} />
    </button>
    {menuOpen === leave.id && (
      <div style={{ position: "absolute", right: 0, top: "100%", background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 50, minWidth: 140, overflow: "hidden" }}>
        <button
          onClick={() => { setEditingLeave(leave); setMenuOpen(null) }}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}
        >
          <Pencil size={13} /> Edit
        </button>
        <button
          onClick={() => { if (confirm("Delete this leave request?")) { startTransition(async () => { await deleteLeaveRequest(leave.id); router.refresh() }) }; setMenuOpen(null) }}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#EF4444" }}
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>
    )}
  </div>
)}
```

Note: `Pencil` and `Trash2` should already be imported (check existing imports and add if missing).

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/member/leaves/leaves-client.tsx
git commit -m "feat: member leaves — expired badge on past-pending, 3-dot edit/delete menu"
```

---

## Task 16 — Member History: Description Search + Date/Month Filter

**Files:**
- Modify: `app/member/history/history-client.tsx`

- [ ] **Step 1: Add month and date filter state**

Inside the component add:

```tsx
const [monthFilter, setMonthFilter] = useState("")   // "YYYY-MM"
const [dateFilter, setDateFilter]   = useState("")    // "YYYY-MM-DD"
```

Build a list of available months from the updates data:

```tsx
const availableMonths = useMemo(() => {
  const set = new Set(updates.map(u => u.date.slice(0, 7)))
  return Array.from(set).sort().reverse()
}, [updates])
```

- [ ] **Step 2: Update filter logic to search descriptions**

Find the existing `filtered` / `useMemo` that filters updates. Replace with:

```tsx
const filtered = useMemo(() => {
  return updates.filter(u => {
    // Month filter
    if (monthFilter && !u.date.startsWith(monthFilter)) return false
    // Date filter (overrides month filter)
    if (dateFilter && u.date !== dateFilter) return false
    // Search: title, client name, notes across all work entries
    if (search) {
      const q = search.toLowerCase()
      const inEntries = (u.work_entries ?? []).some(e =>
        (e.title ?? "").toLowerCase().includes(q) ||
        (e.client_name ?? "").toLowerCase().includes(q) ||
        (e.notes ?? "").toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q)
      )
      if (!inEntries) return false
    }
    return true
  })
}, [updates, search, monthFilter, dateFilter])
```

- [ ] **Step 3: Add month + date filter UI**

Find the search bar section at the top of the page. Add the two new controls immediately below the search bar:

```tsx
{/* Month picker */}
<select
  value={monthFilter}
  onChange={e => { setMonthFilter(e.target.value); setDateFilter("") }}
  style={{ background: "#F5F6FA", border: "1px solid #EBEDF2", borderRadius: 12, padding: "9px 12px", fontSize: 13, color: monthFilter ? "#111111" : "#9CA3AF", outline: "none" }}
>
  <option value="">All months</option>
  {availableMonths.map(m => (
    <option key={m} value={m}>
      {new Date(m + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
    </option>
  ))}
</select>

{/* Specific date picker */}
<input
  type="date"
  value={dateFilter}
  onChange={e => { setDateFilter(e.target.value); setMonthFilter("") }}
  style={{ background: "#F5F6FA", border: "1px solid #EBEDF2", borderRadius: 12, padding: "9px 12px", fontSize: 13, color: "#111111", outline: "none" }}
/>

{(monthFilter || dateFilter) && (
  <button onClick={() => { setMonthFilter(""); setDateFilter("") }}
    style={{ fontSize: 12, fontWeight: 600, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer" }}>
    Clear
  </button>
)}
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/member/history/history-client.tsx
git commit -m "feat: member history — description search, month + date filter"
```

---

## Task 17 — Member Support: Simplify UI

**Files:**
- Modify: `app/member/support/support-client.tsx`

- [ ] **Step 1: Remove complex stats section and Priority dropdown**

Find any stats/metric cards at the top of the support page. Delete them entirely — keep only the new ticket form and the ticket list.

- [ ] **Step 2: Simplify the new ticket form**

Replace the existing form with a simpler version that has only Subject, Category (3 options), and Message:

```tsx
{/* Simplified create ticket form */}
<div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", marginBottom: 20 }}>
  <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111111", margin: "0 0 16px" }}>New Support Request</h2>
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <input
      value={title}
      onChange={e => setTitle(e.target.value)}
      placeholder="Subject…"
      style={{ background: "#F9FAFB", border: "1.5px solid #EBEDF2", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#111827", outline: "none" }}
    />
    <select
      value={category}
      onChange={e => setCategory(e.target.value)}
      style={{ background: "#F9FAFB", border: "1.5px solid #EBEDF2", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#111827", outline: "none" }}
    >
      <option value="">Category…</option>
      <option value="Technical">Technical</option>
      <option value="HR">HR</option>
      <option value="General">General</option>
    </select>
    <textarea
      value={description}
      onChange={e => setDescription(e.target.value)}
      placeholder="Describe your issue…"
      rows={4}
      style={{ background: "#F9FAFB", border: "1.5px solid #EBEDF2", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#111827", outline: "none", resize: "vertical" }}
    />
    {error && <p style={{ fontSize: 12, color: "#DE1A1A", fontWeight: 600, margin: 0 }}>{error}</p>}
    <button
      onClick={handleSubmit}
      disabled={isPending || !title.trim() || !description.trim()}
      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 24px", borderRadius: 14, background: "#DE1A1A", color: "#FFFFFF", border: "none", cursor: isPending ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 700, opacity: isPending ? 0.7 : 1 }}
    >
      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
      {isPending ? "Submitting…" : "Submit Request"}
    </button>
  </div>
</div>
```

- [ ] **Step 3: Simplify ticket list**

Each ticket card shows: Title + status badge + date + "View reply" expander (if a response exists). Remove priority badges, ticket ID badges, and complex meta.

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/member/support/support-client.tsx
git commit -m "feat: member support — simplified UI, remove stats and priority"
```

---

## Task 18 — Member Pages: Mobile Responsive

**Files:**
- Modify: `app/member/dashboard/page.tsx`
- Modify: `app/member/profile/profile-client.tsx`
- Modify: `app/member/update/daily-update-form.tsx`
- Modify: `app/member/tasks/tasks-client.tsx`
- Modify: `app/member/announcements/announcements-client.tsx`

Apply these patterns to each page:

- [ ] **Step 1: Member Dashboard**

Find the stat cards row and any two-column content sections:

```tsx
// Stat cards:
className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"

// Two-column content:
className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4"
```

- [ ] **Step 2: Member Profile**

Profile page likely has a two-column layout (avatar/info + form fields):

```tsx
className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6"
```

Form field pairs inside profile:

```tsx
className="grid grid-cols-1 md:grid-cols-2 gap-3"
```

- [ ] **Step 3: Daily Update form — mobile layout**

The main form uses `gridTemplateColumns: "1fr 280px"` which breaks on mobile. Replace with:

```tsx
// Find the main grid div in the media-team form (around line 604):
style={{ display:"grid", gridTemplateColumns:"1fr 280px", gap:18, alignItems:"start" }}
// Change to:
className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4"
style={{ alignItems: "start" }}

// Same for non-media form (around line 392):
style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:18, alignItems:"start" }}
// Change to:
className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4"
style={{ alignItems: "start" }}
```

Also fix the page header to wrap on mobile (around line 583):

```tsx
// Find:
style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:22, flexWrap:"wrap", gap:12 }}
// This already has flexWrap — verify it. Also hide the greeting card on very small screens:
className="hidden sm:flex"   // add to the greeting card div
```

- [ ] **Step 4: Member Tasks — mobile Kanban**

Apply the same pattern as Task 7 (admin goals) for the member Kanban:

```tsx
// Hide desktop 3-col grid on mobile:
className="hidden md:grid md:grid-cols-3 gap-4"

// Add mobile tab + single-column view above it:
const [mobileCol, setMobileCol] = useState<"todo"|"in_progress"|"completed">("todo")
```

Add mobile tab selector and single-column list (same JSX pattern as Task 7).

- [ ] **Step 5: Member Announcements — stat cards**

```tsx
// Stat cards row:
className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"
```

- [ ] **Step 6: Build check + commit**

```bash
pnpm build
git add app/member/dashboard/page.tsx app/member/profile/profile-client.tsx app/member/update/daily-update-form.tsx app/member/tasks/tasks-client.tsx app/member/announcements/announcements-client.tsx
git commit -m "fix: member panel pages mobile responsive — dashboard, profile, update, tasks, announcements"
```

---

## Task 19 — Member History + Leaves + Attendance: Mobile Responsive

**Files:**
- Modify: `app/member/history/history-client.tsx`
- Modify: `app/member/leaves/leaves-client.tsx`
- Modify: `app/member/attendance/attendance-client.tsx`

- [ ] **Step 1: History — fix filter bar + card layout**

Filter bar (search + month picker + date picker) needs to wrap on mobile:

```tsx
className="flex flex-wrap gap-3 items-center mb-5"
```

Each history card (date heading + work entries list) is already vertical — just fix padding:

```tsx
className="p-4 md:p-5"
```

- [ ] **Step 2: Leaves — mobile layout**

Leave stats cards at top:

```tsx
className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5"
```

Holiday countdown section on mobile — reduce padding:

```tsx
className="p-4 md:p-6"
```

- [ ] **Step 3: Attendance — fix main grid**

The attendance page uses `grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_360px_260px]` — this already handles mobile. Verify the week stats card and the "Daily Insight" section padding:

```tsx
// Daily insight flex row (around line 422):
style={{ display:"flex", flexDirection:"column", gap:16 }}
// Change to:
className="flex flex-col md:flex-row md:items-center gap-4 pr-0 md:pr-28"
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/member/history/history-client.tsx app/member/leaves/leaves-client.tsx app/member/attendance/attendance-client.tsx
git commit -m "fix: member history, leaves, attendance mobile responsive"
```

---

## Task 20 — Admin Shoots + Blast + Birthdays: Mobile Responsive

**Files:**
- Modify: `app/admin/shoots/shoots-client.tsx`
- Modify: `app/admin/blast/blast-client.tsx`
- Modify: `app/admin/birthdays/page.tsx`

- [ ] **Step 1: Shoots**

Shoot cards grid:

```tsx
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
```

- [ ] **Step 2: Blast**

Blast page (WhatsApp blast UI) — fix form layout:

```tsx
// If it uses two-column layout:
className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5"
```

- [ ] **Step 3: Birthdays**

Birthday cards grid:

```tsx
className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
```

- [ ] **Step 4: Build check + commit**

```bash
pnpm build
git add app/admin/shoots/shoots-client.tsx app/admin/blast/blast-client.tsx app/admin/birthdays/page.tsx
git commit -m "fix: admin shoots, blast, birthdays mobile responsive"
```

---

## Task 21 — Final Build + Deploy

- [ ] **Step 1: Full production build**

```bash
pnpm build
```

Expected: 0 TypeScript errors, all routes compile.

- [ ] **Step 2: Push to GitHub**

```bash
git push origin master
```

- [ ] **Step 3: Deploy to Vercel production**

```bash
vercel --prod
```

Expected output: `✓ Production deployment ready` with the production URL `https://grofastteam.vercel.app`.

- [ ] **Step 4: Smoke test on mobile**

Open the deployed URL on a phone or use Chrome DevTools device emulation at 375 px width. Verify:
- Admin: Home, Team, Tasks, Leaves, Reports visible in bottom nav; tap "More" → Attendance, Clients, Announcements, Expenses, Payroll, Documents, Support all visible
- Member: History, Announcements, Support, Profile accessible via "More" sheet
- Daily update form: no side-by-side columns bleeding off screen
- Kanban: tab view shows on mobile
- All table pages: horizontal scroll works without layout breaking

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Admin mobile nav "More" sheet — Task 1
- ✅ Admin dashboard mobile — Task 2
- ✅ Admin activities — Task 3
- ✅ Admin team — Task 4
- ✅ Admin attendance — Task 5
- ✅ Admin leaves — Task 6
- ✅ Admin goals Kanban — Task 7
- ✅ Admin expenses — Task 8
- ✅ Admin clients — Task 9
- ✅ Admin reports — Task 10
- ✅ Admin announcements + support + payroll + documents — Task 11
- ✅ Member attendance date history — Task 12
- ✅ Member daily update (gauge removal, timeline, edit) — Task 13
- ✅ Member tasks (search + assigned-by + migration) — Task 14
- ✅ Member leaves (expire + 3-dot) — Task 15
- ✅ Member history (search + filter) — Task 16
- ✅ Member support simplify — Task 17
- ✅ Member pages mobile responsive — Task 18
- ✅ Member history + leaves + attendance mobile — Task 19
- ✅ Admin shoots + blast + birthdays — Task 20
- ✅ Final build + deploy — Task 21
