# Mobile View Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the batch of mobile-view UI bugs and small feature gaps the client reported across Admin Dashboard, Team, Leave Requests, Attendance, Activities, and Freelancers, plus a real present-count data bug found during investigation.

**Architecture:** This is a Next.js 15 App Router codebase (no separate backend). Every task below is either (a) a pure UI/CSS edit to an existing Server or Client Component, (b) a small server-side query change in a `page.tsx`, or (c) a scoped new feature (calendar popover, leave-type filter) built on data that's already mostly available. No new tables or migrations are needed — see Task 12/13 for the one data-shape change (extending `leaveCalMap`).

**Tech Stack:** Next.js 15 App Router, Supabase (service-role client via `createClient` in each `page.tsx`), inline React `style` objects (this codebase's established pattern — not Tailwind-first), Tailwind utility classes only for responsive breakpoints (`sm:`, `lg:`) layered on top of inline styles.

## Global Constraints

- No automated UI test harness exists for these pages (Vitest is used for logic, not component/visual tests in this codebase) — verification for every UI task is manual: run `pnpm dev`, view the page in a browser at ~375px (mobile) and ~1280px (desktop) width, confirm the fix, confirm nothing else broke.
- Follow the existing inline-`style` + Tailwind-responsive-prefix pattern already used in each file being touched. Don't introduce a new styling approach (no CSS modules, no styled-components).
- Every removed piece of UI must also remove its now-dead state/imports (no unused `useState`, no unused icon imports) — this codebase has `pnpm lint` / `pnpm typecheck` as gates.
- Do not touch `SUPABASE_SERVICE_ROLE_KEY` usage patterns — every `page.tsx` here already uses a service-role `adminSupabase()`/`adminClient()` helper for its queries; keep using the same helper already defined in each file.
- Company-scoping (`.eq("company_id", cid)`) must be preserved on every query touched or added — this is a multi-tenant app.

---

## Task 1: Admin Dashboard — remove non-functional header icons

**Files:**
- Modify: `app/admin/dashboard/page.tsx:246-262`

**Interfaces:** None — self-contained JSX removal, no other task depends on this.

Both the bell icon and the avatar box in the dashboard header have no `onClick`/`Link` — they render a notification dot and initials but do nothing when tapped. The client flagged them as pointless; confirmed via code that they're dead UI, not partially-wired.

- [ ] **Step 1: Remove the bell + avatar block**

In `app/admin/dashboard/page.tsx`, delete lines 246-262 (the `<div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>...</div>` wrapper containing the search box, bell, and avatar) and replace with just the search box, so the header's right side keeps `DashboardSearch` but drops the bell/avatar:

```tsx
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          <div className="hidden sm:flex" style={{ alignItems: "center", gap: 8, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 10, padding: "7px 12px", backdropFilter: "blur(8px)" }}>
            <DashboardSearch />
          </div>
        </div>
```

- [ ] **Step 2: Check for now-unused imports**

Run: `grep -n "Bell\|Image" "app/admin/dashboard/page.tsx" | head -20`

If `Bell` from `lucide-react` is no longer referenced anywhere else in the file, remove it from the import list at the top of the file. Check `Image` (from `next/image`) separately — it's likely still used elsewhere (character illustrations), so only remove imports confirmed fully unused by grep.

- [ ] **Step 3: Verify in browser**

Run: `pnpm dev`, open `/admin/dashboard` at 375px width. Confirm the header shows greeting + date on the left and just the search box (hidden on mobile anyway via `hidden sm:flex`) on the right — no bell, no avatar circle. Confirm no console errors.

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no new errors.

```bash
git add "app/admin/dashboard/page.tsx"
git commit -m "fix(dashboard): remove non-functional bell/avatar header icons"
```

---

## Task 2: Admin Dashboard — repoint "View Reports" to Activities

**Files:**
- Modify: `app/admin/dashboard/page.tsx:227`

**Interfaces:** None.

The client wants the Daily Intelligence report page gone; Activities becomes the report surface. Fix the dashboard's quick-action link now (before Task 4 deletes the reports page) so nothing 404s in between.

- [ ] **Step 1: Change the href**

In `app/admin/dashboard/page.tsx`, line 227:

```tsx
    { label: "View Reports",     href: "/admin/reports",       icon: BarChart3,   color: "#6366F1", bg: "rgba(99,102,241,0.06)"  },
```

becomes:

```tsx
    { label: "View Reports",     href: "/admin/activities",    icon: BarChart3,   color: "#6366F1", bg: "rgba(99,102,241,0.06)"  },
```

- [ ] **Step 2: Verify in browser**

`pnpm dev`, open `/admin/dashboard`, click "View Reports" in Quick Actions, confirm it lands on `/admin/activities` and not a 404.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/dashboard/page.tsx"
git commit -m "fix(dashboard): point View Reports at Activities instead of removed reports page"
```

---

## Task 3: Attendance — remove hero avatar, remove Quick Actions, repoint Full Report

**Files:**
- Modify: `app/admin/attendance/page.tsx:8, 179-184, 229-237, 378, 418-450`

**Interfaces:** None.

Three independent-but-adjacent fixes in one file, all client-confirmed removals/repoints, reviewed together since they're all in the same component and touch nearby lines.

- [ ] **Step 1: Repoint Full Report link**

Line 378, change:
```tsx
            <Link href="/admin/reports" style={{ fontSize: 12, fontWeight: 800, color: "#de1a1a", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 16px", borderRadius: 10, background: "rgba(222,26,26,0.07)" }}>
```
to:
```tsx
            <Link href="/admin/activities" style={{ fontSize: 12, fontWeight: 800, color: "#de1a1a", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 16px", borderRadius: 10, background: "rgba(222,26,26,0.07)" }}>
```

- [ ] **Step 2: Remove the hero avatar box**

Lines 229-237, delete the "Right: date nav + avatar" block's avatar `<div>` but keep the date nav:

```tsx
          {/* Right: date nav */}
          <div className="flex items-center gap-3 mt-3 sm:mt-0" style={{ flexShrink: 0 }}>
            <div style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, padding: "4px 6px" }}>
              <AttendanceDateNav selectedDate={selectedDate} today={today} />
            </div>
          </div>
```

(This removes the `<div style={{ width: 40, height: 40, ... }}><span>...{(adminName[0]...}</span></div>` avatar box entirely — lines 234-236 from the original.)

- [ ] **Step 3: Remove the Quick Actions card**

Delete lines 418-450 (the entire `{/* Quick Actions */}` `<div>` block) from the RIGHT SIDEBAR, leaving Attendance Overview and Weekly Trend as the sidebar's only two cards.

- [ ] **Step 4: Remove the now-dead `quickActions` array and its icon imports**

Delete lines 179-184 (`const quickActions = [...]`).

In the `lucide-react` import at line 8, remove `FileBarChart` and `ClipboardList` (confirm via grep first that they're not used elsewhere in the file):

Run: `grep -n "FileBarChart\|ClipboardList" "app/admin/attendance/page.tsx"`
Expected: only the import line and the now-deleted `quickActions` array should have matched before this edit — after Step 4, zero matches.

Change:
```tsx
  CalendarDays, Users, FileBarChart, ClipboardList,
  ArrowRight, Clock, TrendingUp, CheckCircle2, XCircle,
  AlertCircle, Sparkles, UserCheck, BarChart3,
```
to:
```tsx
  CalendarDays, Users,
  ArrowRight, Clock, TrendingUp, CheckCircle2, XCircle,
  AlertCircle, Sparkles, UserCheck, BarChart3,
```

- [ ] **Step 5: Verify in browser**

`pnpm dev`, open `/admin/attendance` at 375px and 1280px. Confirm: no avatar circle in the header, no "Quick Actions" card in the sidebar (just Attendance Overview + Weekly Trend), "Full Report" link at the bottom of the table goes to `/admin/activities`.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add "app/admin/attendance/page.tsx"
git commit -m "fix(attendance): remove dead hero avatar and Quick Actions, repoint Full Report to Activities"
```

---

## Task 4: Delete the Daily Intelligence reports page

**Files:**
- Delete: `app/admin/reports/page.tsx`
- Delete: `app/admin/reports/reports-client.tsx`
- Modify: `lib/actions/daily-updates.ts:337, 377`

**Interfaces:** None — this must run after Tasks 2 and 3 (which already repointed the only two in-app links to it) so nothing breaks mid-way.

Confirmed via `grep` that `reports-client.tsx` is only imported by `app/admin/reports/page.tsx`, and `/admin/reports` is not referenced from any nav/sidebar component — safe to delete outright rather than leave a redirect stub.

- [ ] **Step 1: Delete the route directory**

```bash
rm "app/admin/reports/page.tsx" "app/admin/reports/reports-client.tsx"
```

- [ ] **Step 2: Remove dead cache-revalidation calls**

In `lib/actions/daily-updates.ts`, there are two `revalidatePath('/admin/reports')` calls (lines 337 and 377) alongside `revalidatePath('/admin/activities')` — the activities revalidation already covers the new report surface, so just delete the two `/admin/reports` lines:

Line 336-337 currently:
```ts
      revalidatePath('/admin/activities')
      revalidatePath('/admin/reports')
```
becomes:
```ts
      revalidatePath('/admin/activities')
```

Line 376-377 currently:
```ts
  revalidatePath('/admin/activities')
  revalidatePath('/admin/reports')
```
becomes:
```ts
  revalidatePath('/admin/activities')
```

- [ ] **Step 3: Confirm nothing else references the deleted route**

Run: `grep -rn "/admin/reports\|reports-client\|ReportsClient" app lib components --include="*.tsx" --include="*.ts"`
Expected: no matches (the two `page.tsx` files it used to appear in are now deleted).

- [ ] **Step 4: Build check**

Run: `pnpm typecheck`
Expected: no errors (a missing-module error here would mean something still imports the deleted files — go find and fix it before proceeding).

- [ ] **Step 5: Verify in browser**

`pnpm dev`, navigate to `/admin/reports` directly — confirm Next.js renders its normal 404, not a crash. Confirm `/admin/dashboard` → "View Reports" and `/admin/attendance` → "Full Report" both still land on `/admin/activities`.

- [ ] **Step 6: Commit**

```bash
git add -A "app/admin/reports" "lib/actions/daily-updates.ts"
git commit -m "chore(reports): remove unfinished Daily Intelligence page, Activities is now the report surface"
```

---

## Task 5: Team Task Board — remove "9 Members" stat, remove Sync Clients, fix mobile stat-row overflow

**Files:**
- Modify: `app/admin/goals/goals-client.tsx:13, 247-248, 359-372, 391-434`

**Interfaces:** None.

Three edits in the same hero header block, reviewed together.

- [ ] **Step 1: Remove the "Members" mini-stat and fix row wrapping for mobile**

Lines 359-372, change:
```tsx
            {/* Mini stats row */}
            <div style={{ display: "flex", gap: 10, marginTop: 16, overflowX: "auto", flexWrap: "nowrap" }}>
              {[
                { icon: <CheckSquare size={12} />, label: `${done} Done` },
                { icon: <Clock size={12} />, label: `${inprog} Active` },
                { icon: <BarChart3 size={12} />, label: `${members.length} Members` },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 12px", flexShrink: 0, whiteSpace: "nowrap" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>{s.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF" }}>{s.label}</span>
                </div>
              ))}
            </div>
```
to:
```tsx
            {/* Mini stats row */}
            <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { icon: <CheckSquare size={12} />, label: `${done} Done` },
                { icon: <Clock size={12} />, label: `${inprog} Active` },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 12px", flexShrink: 0, whiteSpace: "nowrap" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>{s.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF" }}>{s.label}</span>
                </div>
              ))}
            </div>
```
(Dropped the `Members` entry and its `BarChart3` icon usage; switched `overflowX:auto`/`flexWrap:nowrap` to `flexWrap:wrap` so the two remaining chips wrap cleanly instead of requiring horizontal scroll on narrow screens.)

Run: `grep -n "BarChart3" "app/admin/goals/goals-client.tsx"` — if this was the only use of `BarChart3` in the file, remove it from the `lucide-react` import at the top; otherwise leave the import alone.

- [ ] **Step 2: Fix the controls row (By Member/By Status + buttons) wrapping on mobile**

The "Right: controls" wrapper (around line 374) already has `className="flex items-center flex-wrap justify-center sm:justify-end"` — confirm this is still in place after Step 3 removes the Sync Clients button from inside it (it should be, since we're only removing one child, not the wrapper).

- [ ] **Step 3: Remove the Sync Clients button and its dead state**

Delete the `syncClientsNow` import (line 13):
```tsx
import { syncClientsNow } from "@/lib/actions/sync"
```

Delete the `syncing`/`syncMsg` state (lines 247-248):
```tsx
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)
```

Delete the Sync Clients `<button>` (the block starting `<button onClick={async () => { setSyncing(true); ...` through its closing `</button>`, i.e. lines 391-415 in the original file).

Delete the `syncMsg` toast render block that followed it (lines 425-434 in the original):
```tsx
            {syncMsg && (
              <div style={{
                position: "fixed", bottom: 24, right: 24, zIndex: 9999,
                background: syncMsg.ok ? "#10B981" : "#EF4444", color: "#fff",
                padding: "12px 20px", borderRadius: 12, fontSize: 13, fontWeight: 700,
                boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
              }}>
                {syncMsg.text}
              </div>
            )}
```

After these deletions, the controls row should contain only the By Member/By Status toggle and the "Create Task" button.

- [ ] **Step 4: Verify no other references to removed state/imports remain**

Run: `grep -n "syncing\|syncMsg\|syncClientsNow" "app/admin/goals/goals-client.tsx"`
Expected: no matches.

- [ ] **Step 5: Verify in browser**

`pnpm dev`, open `/admin/goals` at 375px. Confirm: hero stat row shows only "Done" and "Active" chips and wraps instead of overflowing, no "Sync Clients" button anywhere, By Member/By Status + Create Task still work. Check 1280px too — confirm the header still looks intentional (not oddly sparse).

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add "app/admin/goals/goals-client.tsx"
git commit -m "fix(goals): remove Sync Clients button and Members stat, fix mobile stat-row wrapping"
```

---

## Task 6: Team page — reconcile mobile vs desktop empty/illustration state

**Files:**
- Investigate: `app/admin/team/team-client.tsx:2036-2075` (the "Build a stronger team" indigo sidebar card, uses `/brand/team-image.png`)
- Investigate: `app/admin/goals/goals-client.tsx:518-526` (per-column "No tasks assigned yet" empty state, uses `col.illustration`)
- Possible modify: whichever of the above is confirmed to be the mismatched element

**Interfaces:** None.

This is the one item in the batch that couldn't be pinned to an exact code diff from static reading — the client's screenshot shows a three-person illustration card that renders differently between mobile and desktop, but neither of the two candidate locations above has an obvious mobile/desktop branch in the code (no `hidden md:block` or conditional asset swap was found guarding either one). This needs a live visual diff to resolve correctly instead of guessing.

- [ ] **Step 1: Reproduce and identify**

Run: `pnpm dev`, open `/admin/team`. View at 1280px width, screenshot the full page. Resize to 375px width, screenshot the full page. Compare: find the specific card/illustration that looks different between the two (different image, different crop, different visibility, or different layout).

- [ ] **Step 2: Locate the responsible code**

Once identified, grep for unique text near that element (e.g. a heading string visible in the screenshot) to find its exact file/line, the same way `grep -rn "Build a stronger team"` or `grep -rn "No tasks assigned"` would. Read the surrounding ~30 lines to find what differs by breakpoint — likely candidates: a `hidden sm:block`/`hidden md:block` class hiding it on one breakpoint, an `objectPosition`/`object-fit` that crops differently at different container widths, or a fixed pixel size that doesn't scale down for mobile (same category of bug as the freelancer card in Task 14).

- [ ] **Step 3: Fix to be visually consistent**

Apply the minimal fix so the same illustration/card renders (scaled appropriately) on both breakpoints rather than looking like two different designs — prefer a responsive `clamp()` size or a Tailwind responsive width class over hiding the element on one breakpoint, unless hiding it entirely on mobile is clearly the better call once you see it live (use judgment same as Task 14's illustration-scaling approach).

- [ ] **Step 4: Verify in browser**

Re-screenshot both breakpoints, confirm they now show the same card/illustration content (scaled appropriately for viewport), not two different designs.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add -A
git commit -m "fix(team): reconcile mobile/desktop illustration mismatch"
```

---

## Task 7: Leave Requests — fix mobile KPI-row alignment

**Files:**
- Modify: `app/admin/leaves/leaves-client.tsx:390-404`

**Interfaces:** None.

The 6 KPI boxes (Full Day/WFH/Shoot/Half Day/Approved/Rejected) currently center the value text but the code doesn't explicitly center the label — on mobile this reads as "label left, value centered." Fix by explicitly centering both within each box (matches the client's report that desktop already looked right, so bring mobile in line with that, not the other way around).

- [ ] **Step 1: Read current styles**

The KPI box grid at lines 390-404:
```tsx
        <div className="grid grid-cols-3 lg:grid-cols-6 w-fit mx-auto lg:mx-0" style={{ gap: 8, position: "relative", zIndex: 1 }}>
          {[
            { label: "Full Day",  value: fullDayCount,  color: "#FCA5A5" },
            { label: "WFH",       value: wfhCount,       color: "#6EE7B7" },
            { label: "Shoot",     value: shootCount,     color: "#93C5FD" },
            { label: "Half Day",  value: halfDayCount,   color: "#FDE68A" },
            { label: "Approved",  value: approvedCount,  color: "#6EE7B7" },
            { label: "Rejected",  value: rejectedCount,  color: "#FCA5A5" },
          ].map(s => (
            <div key={s.label} style={{ textAlign: "center", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, padding: "8px 10px" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.72)", fontWeight: 600, marginTop: 3, whiteSpace: "nowrap" }}>{s.label}</div>
            </div>
          ))}
        </div>
```

The box itself already has `textAlign: "center"`, which should apply to both children — the misalignment the client saw is caused by `className="grid grid-cols-3 lg:grid-cols-6 w-fit mx-auto lg:mx-0"`: on mobile, `grid-cols-3` combined with `w-fit` can let box widths differ per row depending on content width, making labels/values look inconsistently positioned relative to each other across boxes. Force each box to a consistent, full-width-of-its-grid-cell box instead of `w-fit`-driven sizing.

- [ ] **Step 2: Apply the fix**

Change the grid wrapper's className from:
```tsx
        <div className="grid grid-cols-3 lg:grid-cols-6 w-fit mx-auto lg:mx-0" style={{ gap: 8, position: "relative", zIndex: 1 }}>
```
to:
```tsx
        <div className="grid grid-cols-3 lg:grid-cols-6 mx-auto lg:mx-0" style={{ gap: 8, position: "relative", zIndex: 1, width: "100%", maxWidth: 420 }}>
```
(Dropping `w-fit` so grid cells are evenly sized via the grid itself rather than shrink-wrapping to content, which is what was producing the inconsistent left/center appearance; capping `maxWidth` keeps it from stretching too wide on `lg:grid-cols-6` desktop.)

- [ ] **Step 3: Verify in browser**

`pnpm dev`, open `/admin/leaves` at 375px. Confirm all 6 boxes have their number and label both centered consistently, no box's label appearing to sit left of its neighbors' labels. Check 1280px — confirm the desktop layout (which the client said already looked correct) is unchanged.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/leaves/leaves-client.tsx"
git commit -m "fix(leaves): center KPI box labels consistently on mobile"
```

---

## Task 8: Leave Requests — empty state: white background, bigger illustration

**Files:**
- Modify: `app/admin/leaves/leaves-client.tsx:561-573`

**Interfaces:** None.

- [ ] **Step 1: Apply the fix**

Current code:
```tsx
            <div style={{
              background: gradBg, borderRadius: 18, padding: "60px 24px", textAlign: "center",
              position: "relative", overflow: "hidden", boxShadow: "0 8px 32px rgba(180,0,0,0.3)",
            }}>
              <div style={{ position: "absolute", top: -30, right: -20, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
              <div style={{ position: "relative", width: 200, height: 160, margin: "0 auto 20px" }}>
                <Image src="\brand\leave\vacation-hero.png" alt="" fill style={{ objectFit: "contain" }} />
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF", margin: "0 0 6px", fontFamily: "var(--font-jakarta)" }}>
                No {statusFilter === "all" ? "" : statusFilter} leave requests
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0 }}>Your team is fully available today.</p>
            </div>
```

becomes (white background, no decorative gradient circle, larger illustration, text recolored to be legible on white):
```tsx
            <div style={{
              background: "#FFFFFF", borderRadius: 18, padding: "60px 24px", textAlign: "center",
              border: "1px solid #F0F0F5", boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
            }}>
              <div style={{ position: "relative", width: 280, height: 220, margin: "0 auto 20px", maxWidth: "100%" }}>
                <Image src="\brand\leave\vacation-hero.png" alt="" fill style={{ objectFit: "contain" }} />
              </div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#111827", margin: "0 0 6px", fontFamily: "var(--font-jakarta)" }}>
                No {statusFilter === "all" ? "" : statusFilter} leave requests
              </p>
              <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Your team is fully available today.</p>
            </div>
```

(Removed the `position:"relative"/overflow:"hidden"` decorative-circle wrapper since the circle itself — `rgba(255,255,255,0.06)` — was only visible against the dark gradient and would be invisible on white anyway; enlarged the illustration from 200×160 to 280×220 with `maxWidth:"100%"` so it still shrinks on very narrow phones instead of overflowing.)

- [ ] **Step 2: Verify in browser**

`pnpm dev`, open `/admin/leaves`, filter to a status with zero results (e.g. "Rejected" if empty, or temporarily check "All" if no data). Confirm the empty-state card is white with a visible border/shadow, the illustration is noticeably bigger than before, and both text lines are legible (dark text on white, not white-on-white).

- [ ] **Step 3: Commit**

```bash
git add "app/admin/leaves/leaves-client.tsx"
git commit -m "fix(leaves): white empty-state background, larger illustration"
```

---

## Task 9: Leave Requests — add Permission/Leave type filter (server query)

**Files:**
- Modify: `app/admin/leaves/page.tsx:16-135`

**Interfaces:**
- Produces: `LeavesPage` now reads an additional `searchParams.type` (`"permission" | "leave" | undefined`) and passes a `typeFilter: string` prop to `LeavesClient` — Task 10 (client UI) consumes this prop and must read/write the same `type` URL param name.

Confirmed grouping (client verified after initially flip-flopping): **Permission** tab = `leave_type` in (`wfh`, `shoot_day`); **Leave** tab = `leave_type` in (`full_day`, `half_day`, `permission`). The DB's `leave_type = "permission"` value (hour permission) is a different concept from the new UI category also named "Permission" — it belongs in the **Leave** group, not the "Permission" group. This is easy to get backwards, so the values are spelled out explicitly below.

- [ ] **Step 1: Add the type param and query filter**

In `app/admin/leaves/page.tsx`, change the `searchParams` type (line 19) from:
```tsx
  searchParams: Promise<{ status?: string }>
```
to:
```tsx
  searchParams: Promise<{ status?: string; type?: string }>
```

After line 26 (`const statusFilter = params.status ?? "pending"`), add:
```tsx
  const typeFilter = params.type ?? "all_types"
  const PERMISSION_TYPES = ["wfh", "shoot_day"]
  const LEAVE_TYPES = ["full_day", "half_day", "permission"]
```

After the existing status filter block (lines 49-51):
```tsx
  if (statusFilter !== "all") {
    leavesQuery = leavesQuery.eq("status", statusFilter)
  }
```
add:
```tsx
  if (typeFilter === "permission") {
    leavesQuery = leavesQuery.in("leave_type", PERMISSION_TYPES)
  } else if (typeFilter === "leave") {
    leavesQuery = leavesQuery.in("leave_type", LEAVE_TYPES)
  }
```

- [ ] **Step 2: Pass the new prop to `LeavesClient`**

In the `<LeavesClient ... />` call (around line 119-133), add:
```tsx
      typeFilter={typeFilter}
```

- [ ] **Step 3: Typecheck (expect a temporary error)**

Run: `pnpm typecheck`
Expected: FAIL — `LeavesClientProps` doesn't yet declare `typeFilter`. This confirms the wiring is in place; Task 10 adds the prop type and consumes it.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/leaves/page.tsx"
git commit -m "feat(leaves): add server-side leave-type filter query (permission/leave groups)"
```

---

## Task 10: Leave Requests — add Permission/Leave type filter (client UI)

**Files:**
- Modify: `app/admin/leaves/leaves-client.tsx:29-53, 412-428`

**Interfaces:**
- Consumes: `typeFilter: string` prop from Task 9 (`"all_types" | "permission" | "leave"`), and the URL param name `type` that Task 9's server query reads.

Adds a second row of pill buttons directly below the existing status tabs, same visual style (reusing the same button styling already used for `STATUS_TABS`), placed in the same area the client asked for ("in same place" as the existing All/Approved/Rejected tabs).

- [ ] **Step 1: Add `typeFilter` to props and a `TYPE_TABS` constant**

In the `LeavesClientProps` interface (lines 29-43), add:
```tsx
  typeFilter: string
```

After the `STATUS_TABS` constant (lines 47-53), add:
```tsx
const TYPE_TABS = [
  { key: "all_types",  label: "All Types" },
  { key: "permission", label: "Permission" },
  { key: "leave",      label: "Leave" },
]
```

- [ ] **Step 2: Destructure the new prop**

Find the component's prop destructuring (around line 284-286, where `leaves, statusFilter, upcomingLeaves, ...` are destructured) and add `typeFilter` to that list.

- [ ] **Step 3: Add a `navigateType` helper next to the existing `navigate` function**

Find the existing `navigate` function used by the status tabs (it builds a URL with the `status` param — check its exact implementation near where `STATUS_TABS.map` is used, around line 414-428, since it's referenced there as `onClick={() => navigate(tab.key)}`). Add a sibling function that preserves the current `status` param while setting `type`:

```tsx
  function navigateType(type: string) {
    const params = new URLSearchParams()
    if (statusFilter !== "pending") params.set("status", statusFilter)
    if (type !== "all_types") params.set("type", type)
    router.push(`${pathname}?${params.toString()}`)
  }
```

(Match this to whatever `router`/`pathname` variables the existing `navigate` function already uses in this component — reuse those, don't create new ones.)

- [ ] **Step 4: Render the second tab row**

Directly after the closing `</div>` of the existing "Status tabs" block (after line 428, i.e. right after `{STATUS_TABS.map(...)}` closes), add:

```tsx
          {/* Type tabs */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {TYPE_TABS.map((tab) => {
              const active = typeFilter === tab.key
              return (
                <button key={tab.key} onClick={() => navigateType(tab.key)} style={{
                  padding: "8px 22px", borderRadius: 24, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  whiteSpace: "nowrap", transition: "all 0.15s", border: "none",
                  background: active ? gradBg : "#FFFFFF",
                  color: active ? "#FFFFFF" : "#6B7280",
                  boxShadow: active ? "0 4px 16px rgba(180,0,0,0.35)" : "0 1px 4px rgba(0,0,0,0.06)",
                }}>
                  {tab.label}
                </button>
              )
            })}
          </div>
```

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (the prop mismatch from Task 9 Step 3 is now resolved).

- [ ] **Step 6: Verify in browser**

`pnpm dev`, open `/admin/leaves`. Confirm a second row of pills ("All Types / Permission / Leave") appears directly below the status tabs, same visual style. Click "Permission" — confirm the list filters to only WFH/Shoot Day entries. Click "Leave" — confirm it filters to Full Day/Half Day/Hour Permission entries. Confirm switching status tabs (Pending/Approved/etc.) while a type filter is active keeps the type filter applied (URL should carry both `status` and `type` params as needed).

- [ ] **Step 7: Commit**

```bash
git add "app/admin/leaves/leaves-client.tsx"
git commit -m "feat(leaves): add Permission/Leave type filter tabs to Leave Requests UI"
```

---

## Task 11: Leave calendar — data: extend `leaveCalMap` with member id + name

**Files:**
- Modify: `app/admin/dashboard/page.tsx:41-44, 130-133, 167-178, 372-376`

**Interfaces:**
- Produces: `MiniCalendar` now receives `leaveMap: Record<string, { id: string; name: string }[]>` instead of `Record<string, string[]>` — Task 12 (calendar UI) consumes this exact shape.

Currently `leaveCalMap` only stores names (`string[]`) per date, enough for a count but not enough to render per-person avatars in a popover. Extend the query and map-building to carry `id` too.

- [ ] **Step 1: Update the `CalLeaveRow` type**

Line 41-44, change:
```tsx
type CalLeaveRow = {
  from_date: string
  to_date: string
  users: { name: string } | { name: string }[] | null
```
to:
```tsx
type CalLeaveRow = {
  from_date: string
  to_date: string
  users: { id: string; name: string } | { id: string; name: string }[] | null
```

- [ ] **Step 2: Update the Supabase query to select `id`**

Line 130-133, change:
```tsx
    admin.from("leaves")
      .select("from_date, to_date, users(name)")
      .eq("company_id", cid).eq("status", "approved")
      .lte("from_date", monthEnd).gte("to_date", monthStart),
```
to:
```tsx
    admin.from("leaves")
      .select("from_date, to_date, users(id, name)")
      .eq("company_id", cid).eq("status", "approved")
      .lte("from_date", monthEnd).gte("to_date", monthStart),
```

- [ ] **Step 3: Update `leaveCalMap` construction**

Lines 167-178, change:
```tsx
  // Build leave calendar map
  const leaveCalMap: Record<string, string[]> = {}
  for (const leave of (monthLeavesRaw ?? []) as unknown as CalLeaveRow[]) {
    const u    = Array.isArray(leave.users) ? leave.users[0] : leave.users
    const name = u?.name ?? "?"
```
to:
```tsx
  // Build leave calendar map
  const leaveCalMap: Record<string, { id: string; name: string }[]> = {}
  for (const leave of (monthLeavesRaw ?? []) as unknown as CalLeaveRow[]) {
    const u    = Array.isArray(leave.users) ? leave.users[0] : leave.users
    const id   = u?.id ?? ""
    const name = u?.name ?? "?"
```

Find the loop body that pushes into `leaveCalMap[ds]` (immediately below, inside the `while (curr <= end)` loop) — change:
```tsx
      if (!leaveCalMap[ds]) leaveCalMap[ds] = []
      leaveCalMap[ds].push(name)
```
to:
```tsx
      if (!leaveCalMap[ds]) leaveCalMap[ds] = []
      leaveCalMap[ds].push({ id, name })
```

- [ ] **Step 4: Typecheck (expect a temporary error)**

Run: `pnpm typecheck`
Expected: FAIL — `MiniCalendar`'s `leaveMap` prop type still expects `Record<string, string[]>`. This confirms the data-side change is wired; Task 12 updates `MiniCalendar` to match.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/dashboard/page.tsx"
git commit -m "feat(dashboard): extend leave calendar map with member id for avatar popover"
```

---

## Task 12: Leave calendar — UI: multi-dot cap + tap-to-open avatar popover

**Files:**
- Modify: `app/admin/dashboard/mini-calendar.tsx` (full rewrite of the day-cell rendering + new popover state)

**Interfaces:**
- Consumes: `leaveMap: Record<string, { id: string; name: string }[]>` from Task 11.

Design (from approved spec): up to 3 dots per date, "+N" badge beyond that; tapping a date with leave opens a small popover anchored near the date showing avatar-initials + name per person; tapping the same date again or tapping outside closes it.

- [ ] **Step 1: Update the `Props` type and add popover state**

Change:
```tsx
type Props = {
  leaveMap: Record<string, string[]>
  today: string
  initYear: number
  initMonth: number
}

export default function MiniCalendar({ leaveMap, today, initYear, initMonth }: Props) {
  const [year, setYear]   = useState(initYear)
  const [month, setMonth] = useState(initMonth)
```
to:
```tsx
type Props = {
  leaveMap: Record<string, { id: string; name: string }[]>
  today: string
  initYear: number
  initMonth: number
}

export default function MiniCalendar({ leaveMap, today, initYear, initMonth }: Props) {
  const [year, setYear]   = useState(initYear)
  const [month, setMonth] = useState(initMonth)
  const [openDay, setOpenDay] = useState<string | null>(null)

  function getInitials(name: string) {
    return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
  }
```

- [ ] **Step 2: Update the day-cell rendering — multi-dot cap + click handler**

Replace the day-cell block:
```tsx
          return (
            <div key={day} style={{
              height: 30, borderRadius: 6, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", position: "relative",
              background: isToday ? "#DE1A1A" : hasLeave ? "rgba(217,119,6,0.08)" : "transparent",
            }}>
              <span style={{
                fontSize: 10, fontWeight: isToday ? 800 : 500,
                color: isToday ? "#FFFFFF" : isWeekend ? "#D1D5DB" : "#374151",
              }}>{day}</span>
              {hasLeave && !isToday && (
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#D97706", position: "absolute", bottom: 2 }} />
              )}
            </div>
          )
```
with:
```tsx
          const peopleOnLeave = leaveMap[dayStr] ?? []
          const visibleDots = peopleOnLeave.slice(0, 3)
          const extraCount  = peopleOnLeave.length - visibleDots.length
          const isOpen = openDay === dayStr

          return (
            <div key={day} style={{ position: "relative" }}>
              <div
                onClick={() => hasLeave && setOpenDay(o => o === dayStr ? null : dayStr)}
                style={{
                  height: 30, borderRadius: 6, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", position: "relative",
                  background: isToday ? "#DE1A1A" : hasLeave ? "rgba(217,119,6,0.08)" : "transparent",
                  cursor: hasLeave ? "pointer" : "default",
                }}>
                <span style={{
                  fontSize: 10, fontWeight: isToday ? 800 : 500,
                  color: isToday ? "#FFFFFF" : isWeekend ? "#D1D5DB" : "#374151",
                }}>{day}</span>
                {hasLeave && !isToday && (
                  <div style={{ display: "flex", alignItems: "center", gap: 1, position: "absolute", bottom: 2 }}>
                    {visibleDots.map((p, i) => (
                      <div key={p.id || i} style={{ width: 4, height: 4, borderRadius: "50%", background: "#D97706" }} />
                    ))}
                    {extraCount > 0 && (
                      <span style={{ fontSize: 6, fontWeight: 800, color: "#D97706", marginLeft: 1, lineHeight: 1 }}>+{extraCount}</span>
                    )}
                  </div>
                )}
              </div>

              {isOpen && (
                <>
                  <div onClick={() => setOpenDay(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                  <div style={{
                    position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
                    marginTop: 4, zIndex: 50, background: "#FFFFFF", borderRadius: 12,
                    border: "1px solid #E5E7EB", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    padding: 8, minWidth: 160, maxWidth: 220,
                  }}>
                    {peopleOnLeave.map((p, i) => (
                      <div key={p.id || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 4px" }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "rgba(217,119,6,0.12)", color: "#D97706", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {getInitials(p.name)}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
```

Note the `hasLeave` variable already exists above this block (`const hasLeave = (leaveMap[dayStr]?.length ?? 0) > 0`) — no change needed there, it still works with the new object-array shape since `.length` works the same way.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Verify in browser**

`pnpm dev`, open `/admin/dashboard` at 375px. Find a date with dots (or temporarily approve a test leave for today+1 to get one). Tap it — confirm a small popover appears below the date showing an initials-avatar + name per person. Tap the same date again — confirm it closes. Tap elsewhere on the page — confirm it also closes. If you can get 4+ people on leave the same day in test data, confirm it shows 3 dots + "+1" instead of 4 dots.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/dashboard/mini-calendar.tsx"
git commit -m "feat(dashboard): tap-to-open leave avatar popover on mini calendar, cap dots at 3+N"
```

---

## Task 13: Activities — fix present-count and member-count to use clock-in data

**Files:**
- Modify: `app/admin/activities/activities-client.tsx:36, 259-289, 333-366`
- Modify: `app/admin/activities/page.tsx:50-56`

**Interfaces:** None — self-contained within Activities; doesn't change what Task 14 (Dashboard count) touches.

Two bugs found during investigation, fixed together since they're both in the `stats` calculation:

1. **Present/On-Leave counts** currently come from each `daily_updates` row's own `attendance_status` field — which only gets set when a member submits a daily update, completely independent of the actual clock-in/out (`attendance_logs`) flow the client described as "login/logout." The page already fetches the correct `clockInDays`/`leaveDays` data server-side (`app/admin/activities/page.tsx:148-151, 137-146`) and passes it down as props — but the client component currently discards them (`void clockInDays; void leaveDays;` at line 289). Fix: actually use them.
2. **Member count** (denominator for "Not Updated") includes management/freelancer-login accounts because the server query is missing the `is_management`/`is_freelancer_login` filters that the Attendance page's equivalent query already has — this is what inflated "8 real team members" into 9 in the client's math.

- [ ] **Step 1: Fix the member-count query (page.tsx)**

In `app/admin/activities/page.tsx`, lines 50-56, change:
```tsx
    admin
      .from("users")
      .select("id, name, employee_id, role, team, monthly_salary, hourly_rate")
      .eq("company_id", companyId)
      .eq("role", "MEMBER")
      .eq("status", "active")
      .order("name"),
```
to:
```tsx
    admin
      .from("users")
      .select("id, name, employee_id, role, team, monthly_salary, hourly_rate")
      .eq("company_id", companyId)
      .eq("role", "MEMBER")
      .eq("status", "active")
      .eq("is_management", false)
      .eq("is_freelancer_login", false)
      .order("name"),
```

- [ ] **Step 2: Stop discarding `clockInDays`/`leaveDays` in the client component**

In `app/admin/activities/activities-client.tsx`, line 289, change:
```tsx
  void onLeaveIds; void leaveDays; void clockInDays; void pendingLeaves; void pendingCollabs
```
to:
```tsx
  void onLeaveIds; void pendingLeaves; void pendingCollabs
```
(Dropping `leaveDays` and `clockInDays` from the void list since Step 3 now uses them — leave the other three voided, they're out of scope for this fix.)

- [ ] **Step 3: Rewrite the `stats` calculation to source present/on-leave from clock-in data**

Lines 333-366, change:
```tsx
  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const presentSet = new Set<string>()
    const onLeaveSet = new Set<string>()
    let totalHours = 0

    for (const u of updates) {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) continue
      const collabH = collabHoursMap[`${user.id}:${u.date}`] ?? 0
      const hrs = getUpdateHours(u) + collabH
      if (u.attendance_status === "present") {
        presentSet.add(user.id)
        totalHours += hrs
      } else if (u.attendance_status === "leave") {
        onLeaveSet.add(user.id)
      }
    }

    const activeMembers = members.filter(m => m.role !== "ADMIN")
    const updatedIds = new Set(updates.map(u => {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      return user?.id
    }).filter(Boolean))
    const notUpdated = activeMembers.filter(m => !updatedIds.has(m.id))

    return {
      totalUpdates: updates.length,
      present: presentSet.size,
      onLeave: onLeaveSet.size,
      totalHours,
      notUpdated: notUpdated.length,
      notUpdatedMembers: notUpdated,
    }
  }, [updates, members, collabHoursMap])
```
to:
```tsx
  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const activeMembers = members.filter(m => m.role !== "ADMIN")
    const activeMemberIds = new Set(activeMembers.map(m => m.id))

    // Present/on-leave come from the same clock-in / approved-leave data the
    // Dashboard and Attendance pages use — not from each update's own
    // attendance_status flag, which only exists if that member happened to
    // submit a daily update (independent of whether they actually clocked in).
    const presentSet = new Set<string>()
    for (const key of clockInDays ?? []) {
      const sep = key.lastIndexOf(":")
      const userId = key.slice(0, sep)
      if (activeMemberIds.has(userId)) presentSet.add(userId)
    }

    const onLeaveSet = new Set<string>()
    for (const key of leaveDays ?? []) {
      const sep = key.lastIndexOf(":")
      const userId = key.slice(0, sep)
      if (activeMemberIds.has(userId)) onLeaveSet.add(userId)
    }

    let totalHours = 0
    for (const u of updates) {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      if (!user) continue
      if (u.attendance_status !== "present") continue
      const collabH = collabHoursMap[`${user.id}:${u.date}`] ?? 0
      totalHours += getUpdateHours(u) + collabH
    }

    const updatedIds = new Set(updates.map(u => {
      const user = Array.isArray(u.users) ? u.users[0] : u.users
      return user?.id
    }).filter(Boolean))
    const notUpdated = activeMembers.filter(m => !updatedIds.has(m.id))

    return {
      totalUpdates: updates.length,
      present: presentSet.size,
      onLeave: onLeaveSet.size,
      totalHours,
      notUpdated: notUpdated.length,
      notUpdatedMembers: notUpdated,
    }
  }, [updates, members, collabHoursMap, clockInDays, leaveDays])
```

(`totalHours` is left sourced from each update's own `attendance_status === "present"` flag intentionally — that's an hours-worked metric, not a headline present-count, and the client didn't report it as wrong; changing it isn't in scope here.)

- [ ] **Step 4: Check the other `u.attendance_status !== "present"` usage in the file**

Run: `grep -n 'attendance_status' "app/admin/activities/activities-client.tsx"`

There's a second spot (originally around line 386, inside `donutData` or a similar derived value) that also gated on `u.attendance_status !== "present"` — read its surrounding ~10 lines. If it's computing something else derived from the same per-update flag (e.g. a chart slice), leave it as-is unless it's directly duplicating the same "who's present" headline number Task 13 just fixed — in that case apply the same `clockInDays`-based logic for consistency. Use judgment: only change it if it visibly disagrees with the now-fixed `stats.present` value when tested in Step 6.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Verify in browser**

`pnpm dev`, open `/admin/activities` for "Today". Cross-check the "Present" number against `/admin/attendance`'s "Present Today" number for the same date — they should now match (same underlying `attendance_logs` data, same member-filtering rules). Confirm "Total Updates" + "Not Updated" no longer sums to more than the actual team member count (verify against `/admin/team` member list count, non-admin, non-management, non-freelancer-login).

- [ ] **Step 7: Commit**

```bash
git add "app/admin/activities/activities-client.tsx" "app/admin/activities/page.tsx"
git commit -m "fix(activities): source present/on-leave counts from clock-in data, exclude management/freelancer accounts from member count"
```

---

## Task 14: Dashboard — filter "Present Today" count to real team members

**Files:**
- Modify: `app/admin/dashboard/page.tsx:79-109`

**Interfaces:** None.

The dashboard's `presentToday` stat currently counts every `attendance_logs` row with `status = 'present'` for today, company-wide, with no role/management/freelancer-login/active-status filtering at all — unlike Attendance (Task-verified correct) and Activities (fixed in Task 13). This is the last of the three "present" numbers to bring in line.

- [ ] **Step 1: Change the `presentToday` query to filter through the `users` join**

Lines 79-81, change:
```tsx
      admin.from("attendance_logs").select("*", { count: "exact", head: true })
        .eq("company_id", cid).eq("date", today).eq("status", "present"),
```
to:
```tsx
      admin.from("attendance_logs").select("*, users!inner(role, status, is_management, is_freelancer_login)", { count: "exact", head: true })
        .eq("company_id", cid).eq("date", today).eq("status", "present")
        .eq("users.role", "MEMBER").eq("users.status", "active")
        .eq("users.is_management", false).eq("users.is_freelancer_login", false),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (this is a runtime/query-shape change, not a type change, so typecheck alone won't catch a bad join — Step 3 does the real verification).

- [ ] **Step 3: Verify in browser against a live query**

`pnpm dev`, open `/admin/dashboard`. Confirm the "Present Today" stat card renders a number (not an error, not 0 if there's genuinely someone clocked in today) and that the number now matches `/admin/attendance`'s "Present Today" card and the fixed `/admin/activities` "Present" number from Task 13, for the same day.

If the `users!inner(...)` embedded-filter syntax throws a Supabase/PostgREST error (check the terminal running `pnpm dev` and the browser console) — this usually means the foreign key relationship between `attendance_logs.user_id` and `users.id` isn't uniquely resolvable via that shorthand. In that case, fall back to a two-step query instead: fetch the filtered member id list first (mirroring `app/admin/attendance/page.tsx:67-69`'s query), then count `attendance_logs` rows scoped with `.in("user_id", memberIds)` instead of the embedded join filter.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/dashboard/page.tsx"
git commit -m "fix(dashboard): scope Present Today count to active non-management team members"
```

---

## Task 15: Freelancer hero card — responsive character illustration

**Files:**
- Modify: `app/member/freelancers/freelancers-member-client.tsx:1244-1312`

**Interfaces:** None — this component is shared by the member Freelancers page and the embedded admin Freelancers tab (`app/admin/freelancers/admin-freelancers-tabs.tsx`), so this fix applies to both automatically.

The character image (`voiceover-rj-character.png`) is currently `position: absolute; bottom: -50px; height: 270px` — a fixed height that hangs below the card regardless of viewport, overlapping the KPI strip and Work History card on mobile, and not scaling sensibly on desktop either.

- [ ] **Step 1: Cap the hero banner's height so the character can't escape it**

The outer hero container currently has `minHeight: 210` with no max — change it to also set a responsive max via `clamp()` so the banner (and everything absolutely positioned inside it) scales with viewport instead of being a fixed 210px floor with an oversized image escaping the bottom.

Line 1244, change:
```tsx
                <div style={{ margin: "16px 16px 0", position: "relative", minHeight: 210, borderRadius: 24, boxShadow: `0 10px 38px rgba(0,0,0,0.4)` }}>
```
to:
```tsx
                <div style={{ margin: "16px 16px 0", position: "relative", minHeight: 210, maxHeight: "clamp(210px, 38vw, 320px)", overflow: "hidden", borderRadius: 24, boxShadow: `0 10px 38px rgba(0,0,0,0.4)` }}>
```

- [ ] **Step 2: Make the character image scale with the banner instead of using a fixed pixel height**

Line 1260-1263, change:
```tsx
                  {selectedFreelancer.team === "Freelance RJ Voiceover" && (
                    <img src="/brand/voiceover-rj-character.png" alt="" aria-hidden="true"
                      style={{ position: "absolute", bottom: -50, right: 16, height: 270, width: "auto", objectFit: "contain", pointerEvents: "none", filter: "drop-shadow(0 8px 32px rgba(168,85,247,0.5))", zIndex: 1 }} />
                  )}
```
to:
```tsx
                  {selectedFreelancer.team === "Freelance RJ Voiceover" && (
                    <img src="/brand/voiceover-rj-character.png" alt="" aria-hidden="true"
                      style={{ position: "absolute", bottom: 0, right: 16, height: "88%", maxHeight: 260, width: "auto", objectFit: "contain", pointerEvents: "none", filter: "drop-shadow(0 8px 32px rgba(168,85,247,0.5))", zIndex: 1 }} />
                  )}
```

(Switching from a fixed `height: 270` hanging `bottom: -50` past the card's edge, to `height: "88%"` of the now `overflow: "hidden"` banner, anchored at `bottom: 0` — this keeps the character fully inside the card's rounded-corner clipping at every viewport width instead of spilling into the KPI strip or Work History card below.)

- [ ] **Step 3: Verify the KPI glass strip still has room**

The KPI strip (`{/* KPI glass strip */}`, lines 1296-1310) sits inside the same padded container as the header row, with `marginTop: 22, paddingBottom: 24`. With Step 1's `maxHeight` cap and `overflow: hidden` on the outer banner, confirm in Step 4 that the KPI strip doesn't get visually clipped — if it does, increase the `clamp()` max in Step 1 (e.g. `clamp(230px, 42vw, 340px)`) rather than removing `overflow: hidden` (removing it would reintroduce the original bug).

- [ ] **Step 4: Verify in browser at three widths**

`pnpm dev`, open `/member/freelancers` (or the embedded admin `/admin/freelancers` tab) and select a "Freelance RJ Voiceover" freelancer. Check at 360px, 768px, and 1280px+ widths. Confirm at every width: the character illustration stays visually inside the gradient card (no overlap with the KPI stat boxes below it, no overlap with the Work History card further down), and the card doesn't leave awkward empty space either.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`

```bash
git add "app/member/freelancers/freelancers-member-client.tsx"
git commit -m "fix(freelancers): make hero card character illustration responsive, stop it overflowing the card"
```

---

## Task 16: Full regression pass

**Files:** None modified — verification only.

**Interfaces:** None.

Since every change in this plan was scoped and committed independently, this final task is a single end-to-end pass to catch anything that only shows up once everything is combined (e.g. two tasks touching the same file in ways that look fine individually but clash visually).

- [ ] **Step 1: Full build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all three pass with no new errors/warnings.

- [ ] **Step 2: Walk every touched page at 375px and 1280px**

`pnpm dev` (or run against the production build from Step 1), and for each of: `/admin/dashboard`, `/admin/team`, `/admin/goals`, `/admin/leaves`, `/admin/attendance`, `/admin/activities`, `/member/freelancers` (and the embedded admin Freelancers tab) — load at 375px, then 1280px, and confirm:
- No leftover reference to the deleted `/admin/reports` route.
- No console errors.
- Every item from the original client PDF report is visibly addressed.

- [ ] **Step 3: Report status**

Summarize pass/fail per page for the user — do not push or open a PR at this stage; per this repo's workflow, ask the user "sajee or master?" before pushing anything (see `feedback_deploy_branch` — always ask before pushing, never auto-push).
