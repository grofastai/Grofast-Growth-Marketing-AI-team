# Media Tracker Schedule Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Schedule" tab to the Media Tracker (after Poster) that gives a
date-first List/Calendar view of upcoming shoots and scheduled posts, with the ability
to act on them (mark posted, mark a shoot done, cancel, reschedule) directly from that
view.

**Architecture:** No new tables or server actions. A new pure logic module
(`lib/media-tracker/schedule.ts`) turns raw entries into agenda groups and month grids;
three new presentational components (`components/media-tracker/schedule/*.tsx`) render
those; `media-tracker-client.tsx` maps its existing `items`/`shoots` state into the
generic `ScheduleEntry` shape and wires real action handlers (`handleShootStatus`,
the platform-posting modal, `EditContentModal`) into each entry — nothing new is
implemented there, only re-exposed through a date-oriented lens.

**Tech Stack:** Next.js 15 App Router, React (client component), TypeScript strict,
Vitest, Tailwind CSS, lucide-react icons.

## Global Constraints

- No new Supabase tables, columns, or server actions — reuse `shoots.start_time`/
  `shoots.status` and `content_items.scheduled_post_date`/`scheduled_post_time` exactly
  as captured today.
- Client filter dropdowns must use the project's universal client-list pattern: "All
  Clients" + the company's active client list + a collapsible "📁 Past Clients"
  optgroup — never a locally-derived or free-typed list. (Existing project convention;
  see the identical pattern already in this file's Pipeline/Shoots/Ads tab filters.)
- No React component-rendering tests — this repo's Vitest setup has no
  `@testing-library/react`/jsdom environment configured. Automated tests are for the
  pure logic in `lib/media-tracker/schedule.ts` only; new components are verified
  manually via the dev server.
- Match existing code style in `media-tracker-client.tsx`: inline `style={{...}}` plus
  Tailwind utility classes for layout, no CSS modules, no new UI library.
- `pnpm typecheck` and `pnpm lint` must stay clean after every task.

---

### Task 1: Pure schedule logic (`lib/media-tracker/schedule.ts`)

**Files:**
- Create: `lib/media-tracker/schedule.ts`
- Create: `lib/media-tracker/schedule.test.ts`

**Interfaces:**
- Consumes: nothing (pure module, no imports from the rest of the app).
- Produces (used by Tasks 2-5):
  - `type ScheduleEntry = { id: string; date: string; time: string | null; title: string; client: string; accent: string; overdue: boolean; actions: { label: string; onClick: () => void; danger?: boolean }[] }`
  - `type ScheduleGroup = { heading: string; entries: ScheduleEntry[] }`
  - `type CalendarDay = { date: string; inCurrentMonth: boolean; isToday: boolean; entries: ScheduleEntry[] }`
  - `function groupSchedule(entries: ScheduleEntry[], today: string): ScheduleGroup[]`
  - `function buildMonthGrid(year: number, month: number, entries: ScheduleEntry[], today: string): CalendarDay[]` (`month` is 1-12)

- [ ] **Step 1: Write the failing tests**

Create `lib/media-tracker/schedule.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupSchedule, buildMonthGrid, type ScheduleEntry } from './schedule'

function entry(overrides: Partial<ScheduleEntry> & Pick<ScheduleEntry, 'id' | 'date'>): ScheduleEntry {
  return {
    time: null, title: 'Test entry', client: 'Acme', accent: '#000000', overdue: false, actions: [],
    ...overrides,
  }
}

describe('groupSchedule', () => {
  it('pulls past-due entries into an Overdue group above Today', () => {
    const entries = [
      entry({ id: 'past', date: '2026-07-20' }),
      entry({ id: 'today', date: '2026-07-28' }),
    ]
    const groups = groupSchedule(entries, '2026-07-28')
    expect(groups[0].heading).toBe('Overdue')
    expect(groups[0].entries.map(e => e.id)).toEqual(['past'])
    expect(groups[1].heading).toBe('Today')
    expect(groups[1].entries.map(e => e.id)).toEqual(['today'])
  })

  it('labels the next day Tomorrow and later dates by weekday/date', () => {
    const entries = [
      entry({ id: 'tmrw', date: '2026-07-29' }),
      entry({ id: 'later', date: '2026-08-02' }),
    ]
    const groups = groupSchedule(entries, '2026-07-28')
    const expectedLaterHeading = new Date('2026-08-02T00:00:00')
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    expect(groups.map(g => g.heading)).toEqual(['Tomorrow', expectedLaterHeading])
  })

  it('sorts same-day entries with untimed first, then by time ascending', () => {
    const entries = [
      entry({ id: 'five-pm', date: '2026-07-28', time: '17:00' }),
      entry({ id: 'untimed', date: '2026-07-28', time: null }),
      entry({ id: 'nine-am', date: '2026-07-28', time: '09:00' }),
    ]
    const groups = groupSchedule(entries, '2026-07-28')
    expect(groups[0].entries.map(e => e.id)).toEqual(['untimed', 'nine-am', 'five-pm'])
  })

  it('returns no groups for an empty entry list', () => {
    expect(groupSchedule([], '2026-07-28')).toEqual([])
  })
})

describe('buildMonthGrid', () => {
  it('returns a 42-day grid covering the full month with complete leading/trailing weeks', () => {
    const grid = buildMonthGrid(2026, 7, [], '2026-07-28')
    expect(grid).toHaveLength(42)
    const julyDays = grid.filter(d => d.inCurrentMonth)
    expect(julyDays).toHaveLength(31)
    expect(julyDays[0].date).toBe('2026-07-01')
    expect(julyDays[30].date).toBe('2026-07-31')
  })

  it('buckets entries onto their date and flags today', () => {
    const entries = [entry({ id: 'a', date: '2026-07-28' })]
    const grid = buildMonthGrid(2026, 7, entries, '2026-07-28')
    const day = grid.find(d => d.date === '2026-07-28')!
    expect(day.entries.map(e => e.id)).toEqual(['a'])
    expect(day.isToday).toBe(true)
    const otherDay = grid.find(d => d.date === '2026-07-27')!
    expect(otherDay.isToday).toBe(false)
    expect(otherDay.entries).toEqual([])
  })

  it('sorts multiple entries on the same day the same way groupSchedule does', () => {
    const entries = [
      entry({ id: 'pm', date: '2026-07-15', time: '15:00' }),
      entry({ id: 'am', date: '2026-07-15', time: '08:00' }),
    ]
    const grid = buildMonthGrid(2026, 7, entries, '2026-07-28')
    const day = grid.find(d => d.date === '2026-07-15')!
    expect(day.entries.map(e => e.id)).toEqual(['am', 'pm'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test lib/media-tracker/schedule.test.ts`
Expected: FAIL — `Cannot find module './schedule'` (the module doesn't exist yet).

- [ ] **Step 3: Implement `lib/media-tracker/schedule.ts`**

```ts
// Pure agenda/calendar maths for the Tracker's Schedule tab. Kept out of the components
// and unit-tested for the same reason lib/media-tracker/overview.ts is: date arithmetic
// (overdue, Today/Tomorrow, month-grid boundaries) is exactly where off-by-one bugs
// silently misreport what's due. All date math here uses local-time Date construction
// (no `Z` suffix, no `.toISOString()`) — matching how the rest of the tracker already
// treats YYYY-MM-DD strings (see `daysAgo`/`fmtDate` in media-tracker-client.tsx) — so a
// browser in any timezone doesn't shift dates by a day via UTC conversion.

export type ScheduleEntry = {
  id: string
  date: string // YYYY-MM-DD
  time: string | null // HH:mm, 24h, null = no time set
  title: string
  client: string
  accent: string
  overdue: boolean
  actions: { label: string; onClick: () => void; danger?: boolean }[]
}

export type ScheduleGroup = {
  heading: string // "Overdue" | "Today" | "Tomorrow" | "Thu, Jul 30"
  entries: ScheduleEntry[]
}

export type CalendarDay = {
  date: string // YYYY-MM-DD
  inCurrentMonth: boolean
  isToday: boolean
  entries: ScheduleEntry[]
}

function toDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return toDateString(d)
}

function compareEntries(a: ScheduleEntry, b: ScheduleEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.time === b.time) return 0
  if (a.time === null) return -1
  if (b.time === null) return 1
  return a.time < b.time ? -1 : 1
}

function formatHeadingDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Overdue entries (date < today, however old) are pulled into their own group above
// Today, regardless of how many different past dates they span — once something's
// late, which day it was due stops being the useful distinction. Everything from today
// forward gets one group per date, in order.
export function groupSchedule(entries: ScheduleEntry[], today: string): ScheduleGroup[] {
  const tomorrow = addDays(today, 1)
  const overdue = entries.filter(e => e.date < today).sort(compareEntries)
  const upcoming = entries.filter(e => e.date >= today).sort(compareEntries)

  const groups: ScheduleGroup[] = []
  if (overdue.length > 0) groups.push({ heading: 'Overdue', entries: overdue })

  let currentDate: string | null = null
  for (const item of upcoming) {
    if (item.date !== currentDate) {
      currentDate = item.date
      const heading = item.date === today ? 'Today' : item.date === tomorrow ? 'Tomorrow' : formatHeadingDate(item.date)
      groups.push({ heading, entries: [] })
    }
    groups[groups.length - 1].entries.push(item)
  }
  return groups
}

// Builds a 42-cell (6-week) grid starting on the Sunday on/before the 1st of `month`
// (1-12), so the grid always shows complete weeks, with a few leading/trailing days
// from adjacent months included (inCurrentMonth: false).
export function buildMonthGrid(year: number, month: number, entries: ScheduleEntry[], today: string): CalendarDay[] {
  const firstOfMonth = new Date(year, month - 1, 1)
  const startOffset = firstOfMonth.getDay() // 0 (Sun) - 6 (Sat)

  const byDate = new Map<string, ScheduleEntry[]>()
  for (const item of entries) {
    const list = byDate.get(item.date)
    if (list) list.push(item)
    else byDate.set(item.date, [item])
  }

  const days: CalendarDay[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month - 1, 1 - startOffset + i)
    const date = toDateString(d)
    days.push({
      date,
      inCurrentMonth: d.getMonth() === month - 1,
      isToday: date === today,
      entries: (byDate.get(date) ?? []).sort(compareEntries),
    })
  }
  return days
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test lib/media-tracker/schedule.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add lib/media-tracker/schedule.ts lib/media-tracker/schedule.test.ts
git commit -m "feat(media-tracker): add pure agenda/calendar logic for Schedule tab"
```

---

### Task 2: Agenda list component

**Files:**
- Create: `components/media-tracker/schedule/schedule-list.tsx`

**Interfaces:**
- Consumes: `ScheduleEntry`, `groupSchedule` from `@/lib/media-tracker/schedule` (Task 1);
  `todayIST` from `@/lib/utils/ist-date` (already exists in the codebase).
- Produces (used by Tasks 3-4): `export function ScheduleRow({ entry }: { entry: ScheduleEntry })`,
  `export function ScheduleList({ entries }: { entries: ScheduleEntry[] })`.

- [ ] **Step 1: Create the component**

```tsx
"use client"

import { todayIST } from "@/lib/utils/ist-date"
import { groupSchedule, type ScheduleEntry } from "@/lib/media-tracker/schedule"

// One row, reused by both ScheduleList and ScheduleCalendar's day-expansion panel —
// so the two views never visually diverge on what a scheduled entry looks like.
export function ScheduleRow({ entry }: { entry: ScheduleEntry }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl p-3 mb-2"
      style={{ background: "#fff", border: "1px solid #E5E7EB", borderLeft: `4px solid ${entry.accent}` }}>
      <div style={{ minWidth: 0 }}>
        <p className="text-[13px] font-bold truncate" style={{ color: "#111827", margin: 0 }}>{entry.title}</p>
        <p className="text-[11px]" style={{ color: "#6B7280", margin: "2px 0 0" }}>
          {entry.client}{entry.time ? ` · ${entry.time}` : ""}
        </p>
      </div>
      <div className="flex gap-1.5 flex-shrink-0">
        {entry.actions.map(a => (
          <button key={a.label} onClick={a.onClick}
            className="text-[11px] font-bold px-2.5 py-1 rounded-lg hover:opacity-90"
            style={{ border: "none", cursor: "pointer", background: a.danger ? "#B91C1C" : "#15803D", color: "#fff" }}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function ScheduleList({ entries }: { entries: ScheduleEntry[] }) {
  const groups = groupSchedule(entries, todayIST())

  if (groups.length === 0) {
    return (
      <p className="text-[13px]" style={{ color: "#9CA3AF", padding: "24px 0", textAlign: "center" }}>
        Nothing scheduled.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(g => (
        <div key={g.heading}>
          <p className="text-[11px] font-bold uppercase tracking-[0.06em]"
            style={{ color: g.heading === "Overdue" ? "#DC2626" : "#9CA3AF", margin: "0 0 6px" }}>
            {g.heading}
          </p>
          {g.entries.map(e => <ScheduleRow key={e.id} entry={e} />)}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors (this file isn't wired up anywhere yet, so nothing else can break).

```bash
git add components/media-tracker/schedule/schedule-list.tsx
git commit -m "feat(media-tracker): add ScheduleList/ScheduleRow components"
```

---

### Task 3: Month-grid calendar component

**Files:**
- Create: `components/media-tracker/schedule/schedule-calendar.tsx`

**Interfaces:**
- Consumes: `ScheduleEntry`, `buildMonthGrid` from `@/lib/media-tracker/schedule` (Task 1);
  `ScheduleRow` from `./schedule-list` (Task 2); `todayIST` from `@/lib/utils/ist-date`.
- Produces (used by Task 4): `export function ScheduleCalendar({ entries }: { entries: ScheduleEntry[] })`.

- [ ] **Step 1: Create the component**

```tsx
"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { todayIST } from "@/lib/utils/ist-date"
import { buildMonthGrid, type ScheduleEntry } from "@/lib/media-tracker/schedule"
import { ScheduleRow } from "./schedule-list"

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const ACCENT = "#0D9488"

export function ScheduleCalendar({ entries }: { entries: ScheduleEntry[] }) {
  const today = todayIST()
  const [year, setYear] = useState(() => Number(today.slice(0, 4)))
  const [month, setMonth] = useState(() => Number(today.slice(5, 7))) // 1-12
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const grid = buildMonthGrid(year, month, entries, today)
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
  const selectedDay = grid.find(d => d.date === selectedDate)

  function goPrevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) } else { setMonth(m => m - 1) }
    setSelectedDate(null)
  }
  function goNextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1) } else { setMonth(m => m + 1) }
    setSelectedDate(null)
  }
  function goToday() {
    setYear(Number(today.slice(0, 4)))
    setMonth(Number(today.slice(5, 7)))
    setSelectedDate(today)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button onClick={goPrevMonth} aria-label="Previous month"
          style={{ border: "none", background: "none", cursor: "pointer", padding: 6 }}>
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-bold" style={{ color: "#111827", margin: 0 }}>{monthLabel}</p>
          <button onClick={goToday}
            className="text-[11px] font-bold px-2 py-1 rounded-lg"
            style={{ border: "1px solid #E5E7EB", background: "#fff", cursor: "pointer", color: "#374151" }}>
            Today
          </button>
        </div>
        <button onClick={goNextMonth} aria-label="Next month"
          style={{ border: "none", background: "none", cursor: "pointer", padding: 6 }}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map(w => (
          <p key={w} className="text-[10px] font-bold uppercase text-center" style={{ color: "#9CA3AF", margin: 0 }}>{w}</p>
        ))}
        {grid.map(day => (
          <button key={day.date} onClick={() => setSelectedDate(day.date === selectedDate ? null : day.date)}
            className="flex flex-col items-center rounded-lg p-1.5"
            style={{
              border: day.isToday ? `1.5px solid ${ACCENT}` : "1px solid #F3F4F6",
              background: day.date === selectedDate ? `${ACCENT}14` : "#fff",
              opacity: day.inCurrentMonth ? 1 : 0.35,
              cursor: "pointer", minHeight: 52,
            }}>
            <span className="text-[11px] font-bold" style={{ color: "#374151" }}>{Number(day.date.slice(8, 10))}</span>
            {day.entries.length > 0 && (
              <span className="text-[9px] font-black rounded-full px-1.5"
                style={{ background: `${ACCENT}20`, color: ACCENT, marginTop: 2 }}>
                {day.entries.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {selectedDay && (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: "#9CA3AF", margin: 0 }}>
            {new Date(selectedDay.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </p>
          {selectedDay.entries.length === 0 ? (
            <p className="text-[12px]" style={{ color: "#9CA3AF" }}>Nothing scheduled.</p>
          ) : selectedDay.entries.map(e => <ScheduleRow key={e.id} entry={e} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add components/media-tracker/schedule/schedule-calendar.tsx
git commit -m "feat(media-tracker): add ScheduleCalendar month-grid component"
```

---

### Task 4: Schedule tab shell (filter + List/Calendar toggle)

**Files:**
- Create: `components/media-tracker/schedule/schedule-tab.tsx`

**Interfaces:**
- Consumes: `ScheduleEntry` type from `@/lib/media-tracker/schedule`; `ScheduleList` from
  `./schedule-list` (Task 2); `ScheduleCalendar` from `./schedule-calendar` (Task 3).
- Produces (used by Task 5):
  `export function ScheduleTab({ entries, activeClientOptions, pastClientOptions }: { entries: ScheduleEntry[]; activeClientOptions: string[]; pastClientOptions: string[] })`

- [ ] **Step 1: Create the component**

```tsx
"use client"

import { useState } from "react"
import { List, CalendarDays } from "lucide-react"
import type { ScheduleEntry } from "@/lib/media-tracker/schedule"
import { ScheduleList } from "./schedule-list"
import { ScheduleCalendar } from "./schedule-calendar"

// Duplicated from media-tracker-client.tsx's FILTER_FIELD rather than imported — this
// file's parent (media-tracker-client.tsx) imports ScheduleTab, so importing back from
// it here would create a circular import. It's five lines of style tokens, not logic.
const FILTER_FIELD: React.CSSProperties = {
  width: "auto", fontSize: 12, fontWeight: 700, color: "#374151",
  background: "#fff",
  border: "1.5px solid #E5E7EB", borderRadius: 10,
  padding: "8px 10px", outline: "none", cursor: "pointer",
}

const ACCENT = "#0D9488"

export function ScheduleTab({ entries, activeClientOptions, pastClientOptions }: {
  entries: ScheduleEntry[]
  activeClientOptions: string[]
  pastClientOptions: string[]
}) {
  const [view, setView] = useState<"list" | "calendar">("list")
  const [clientFilter, setClientFilter] = useState("all")

  const filtered = clientFilter === "all" ? entries : entries.filter(e => e.client === clientFilter)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} style={FILTER_FIELD}>
          <option value="all">All Clients</option>
          {activeClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
          {pastClientOptions.length > 0 && (
            <optgroup label="📁 Past Clients">
              {pastClientOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          )}
        </select>

        <div className="flex gap-1 rounded-xl p-1" style={{ background: "#F1F5F9" }}>
          <button onClick={() => setView("list")}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg"
            style={{ border: "none", cursor: "pointer", background: view === "list" ? "#fff" : "transparent", color: view === "list" ? ACCENT : "#64748B" }}>
            <List size={13} /> List
          </button>
          <button onClick={() => setView("calendar")}
            className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg"
            style={{ border: "none", cursor: "pointer", background: view === "calendar" ? "#fff" : "transparent", color: view === "calendar" ? ACCENT : "#64748B" }}>
            <CalendarDays size={13} /> Calendar
          </button>
        </div>
      </div>

      {view === "list" ? <ScheduleList entries={filtered} /> : <ScheduleCalendar entries={filtered} />}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `pnpm typecheck`
Expected: no errors.

```bash
git add components/media-tracker/schedule/schedule-tab.tsx
git commit -m "feat(media-tracker): add ScheduleTab shell with client filter and List/Calendar toggle"
```

---

### Task 5: Wire the Schedule mode into `media-tracker-client.tsx`

**Files:**
- Modify: `components/media-tracker/media-tracker-client.tsx`

**Interfaces:**
- Consumes: `ScheduleEntry` type from `@/lib/media-tracker/schedule` (Task 1);
  `ScheduleTab` from `./schedule/schedule-tab` (Task 4). Uses this file's own existing
  `items`, `shoots`, `today`, `handleShootStatus`, `setPlatformModalKind`,
  `setPlatformModalItem`, `setEditingItem`, `STATUS_CFG`, `SHOOT_STATUS_CFG`,
  `toISTTimeString`, `activeClientOptions`, `pastClientOptions` — all already defined in
  this file, nothing new to export from it.
- Produces: nothing new consumed elsewhere — this is the top of the dependency chain.

- [ ] **Step 1: Add `"schedule"` to `TrackerMode`, `MODE_ACCENT`, and `NAV_MODES`**

Find (around line 516):

```ts
type TrackerMode = "overview" | "video" | "poster" | "ads"
const MODE_ACCENT: Record<TrackerMode, { solid: string; grad: string; glow: string; soft: string }> = {
  overview: { solid: "#0EA5E9", grad: "linear-gradient(135deg,#38BDF8,#0EA5E9)", glow: "rgba(14,165,233,0.45)", soft: "rgba(14,165,233,0.10)" },
  video: { solid: "#DE1A1A", grad: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", glow: "rgba(222,26,26,0.45)", soft: "rgba(222,26,26,0.10)" },
  poster: { solid: "#7C3AED", grad: "linear-gradient(135deg,#A78BFA,#7C3AED)", glow: "rgba(124,58,237,0.45)", soft: "rgba(124,58,237,0.10)" },
  ads: { solid: "#D97706", grad: "linear-gradient(135deg,#FBBF24,#D97706)", glow: "rgba(217,119,6,0.45)", soft: "rgba(217,119,6,0.10)" },
}
```

Replace with:

```ts
type TrackerMode = "overview" | "video" | "poster" | "schedule" | "ads"
const MODE_ACCENT: Record<TrackerMode, { solid: string; grad: string; glow: string; soft: string }> = {
  overview: { solid: "#0EA5E9", grad: "linear-gradient(135deg,#38BDF8,#0EA5E9)", glow: "rgba(14,165,233,0.45)", soft: "rgba(14,165,233,0.10)" },
  video: { solid: "#DE1A1A", grad: "linear-gradient(135deg,#FF4D4D,#DE1A1A)", glow: "rgba(222,26,26,0.45)", soft: "rgba(222,26,26,0.10)" },
  poster: { solid: "#7C3AED", grad: "linear-gradient(135deg,#A78BFA,#7C3AED)", glow: "rgba(124,58,237,0.45)", soft: "rgba(124,58,237,0.10)" },
  schedule: { solid: "#0D9488", grad: "linear-gradient(135deg,#2DD4BF,#0D9488)", glow: "rgba(13,148,136,0.45)", soft: "rgba(13,148,136,0.10)" },
  ads: { solid: "#D97706", grad: "linear-gradient(135deg,#FBBF24,#D97706)", glow: "rgba(217,119,6,0.45)", soft: "rgba(217,119,6,0.10)" },
}
```

Find (around line 541):

```ts
const NAV_MODES: { key: TrackerMode; label: string; icon: typeof Layers }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "video", label: "Video", icon: Video },
  { key: "poster", label: "Poster", icon: ImageIcon },
]
```

Replace with:

```ts
const NAV_MODES: { key: TrackerMode; label: string; icon: typeof Layers }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "video", label: "Video", icon: Video },
  { key: "poster", label: "Poster", icon: ImageIcon },
  { key: "schedule", label: "Schedule", icon: CalendarDays },
]
```

- [ ] **Step 2: Import `ScheduleTab` and the `ScheduleEntry` type**

Find the last import line (around line 31):

```ts
import { isValidDriveLink } from "@/lib/utils/drive-link"
```

Replace with:

```ts
import { isValidDriveLink } from "@/lib/utils/drive-link"
import type { ScheduleEntry } from "@/lib/media-tracker/schedule"
import { ScheduleTab } from "./schedule/schedule-tab"
```

- [ ] **Step 3: Add `scheduleSubTab` state next to `subTab`**

Find (around line 3647):

```ts
  const [subTab, setSubTab] = useState<"shoots" | "adsvideo" | "pipeline" | "log" | "adlog">("shoots")
```

Replace with:

```ts
  const [subTab, setSubTab] = useState<"shoots" | "adsvideo" | "pipeline" | "log" | "adlog">("shoots")
  // Schedule mode's own sub-tab axis — kept separate from `subTab` (rather than widening
  // its union) so switching back to Video/Poster mode never leaves `subTab` on a
  // Schedule-only key that matches none of those modes' render conditions.
  const [scheduleSubTab, setScheduleSubTab] = useState<"shoot" | "video" | "poster" | "ads">("shoot")
```

- [ ] **Step 4: Add the `ScheduleEntry`-mapping `useMemo`s**

Find the end of the `navSections` block (around line 4038, immediately after its closing
`}, [mode, items, shoots, contentTypeForMode, pipelineOrder, shootLinkedItemIds])`):

```ts
  }, [mode, items, shoots, contentTypeForMode, pipelineOrder, shootLinkedItemIds])
```

Insert immediately after it:

```ts

  // Schedule tab — one ScheduleEntry per pending shoot/scheduled post, so its four
  // sub-tabs are just filtered/mapped views over the same shoots/items already loaded
  // for the rest of the tracker. Nothing here is fetched separately, and every action
  // calls a handler that already exists elsewhere in this file.
  const scheduleShootEntries: ScheduleEntry[] = useMemo(() => shoots
    .filter(s => s.status === "scheduled")
    .map(s => {
      const date = s.start_time.split("T")[0]
      return {
        id: s.id,
        date,
        time: toISTTimeString(s.start_time) || null,
        title: s.legacyTitle,
        client: s.client,
        accent: SHOOT_STATUS_CFG.scheduled.color,
        overdue: date < today,
        actions: [
          { label: "Mark Done", onClick: () => handleShootStatus(s.id, "completed") },
          { label: "Cancel", onClick: () => handleShootStatus(s.id, "cancelled"), danger: true },
        ],
      }
    }), [shoots, today])

  const scheduledContentItems = useMemo(
    () => items.filter(i => (i.status === "branding_ready" || i.status === "ads_ready") && i.scheduled_post_date),
    [items]
  )
  function toScheduleEntry(i: ContentItem): ScheduleEntry {
    return {
      id: i.id,
      date: i.scheduled_post_date!,
      time: i.scheduled_post_time,
      title: i.title,
      client: i.client_name,
      accent: STATUS_CFG[i.status].accent,
      overdue: i.scheduled_post_date! < today,
      actions: [
        { label: "Mark Posted", onClick: () => { setPlatformModalKind(i.status === "ads_ready" ? "ads" : "branding"); setPlatformModalItem(i) } },
        { label: "Reschedule", onClick: () => setEditingItem(i) },
      ],
    }
  }
  const scheduleVideoEntries: ScheduleEntry[] = useMemo(
    () => scheduledContentItems.filter(i => i.content_type === "video").map(toScheduleEntry),
    [scheduledContentItems, today]
  )
  const schedulePosterEntries: ScheduleEntry[] = useMemo(
    () => scheduledContentItems.filter(i => i.content_type === "poster").map(toScheduleEntry),
    [scheduledContentItems, today]
  )
  const scheduleAdsEntries: ScheduleEntry[] = useMemo(
    () => scheduledContentItems.filter(i => i.status === "ads_ready").map(toScheduleEntry),
    [scheduledContentItems, today]
  )
  const activeScheduleEntries: ScheduleEntry[] =
    scheduleSubTab === "shoot" ? scheduleShootEntries
    : scheduleSubTab === "video" ? scheduleVideoEntries
    : scheduleSubTab === "poster" ? schedulePosterEntries
    : scheduleAdsEntries
```

- [ ] **Step 5: Add the `schedule` key to `navCounts`, and a `schedule` branch to `navSections`**

Find (around line 4013):

```ts
  const navCounts = useMemo(() => ({
    overview: overview.attention.reduce((sum, a) => sum + a.count, 0),
    video: items.filter(i => i.content_type === "video" && i.status !== "posted" && i.status !== "cancelled").length,
    poster: items.filter(i => i.content_type === "poster" && i.status !== "posted" && i.status !== "cancelled").length,
    ads: ads.filter(a => a.status === "active").length,
  }), [items, ads, overview])
```

Replace with:

```ts
  const navCounts = useMemo(() => ({
    overview: overview.attention.reduce((sum, a) => sum + a.count, 0),
    video: items.filter(i => i.content_type === "video" && i.status !== "posted" && i.status !== "cancelled").length,
    poster: items.filter(i => i.content_type === "poster" && i.status !== "posted" && i.status !== "cancelled").length,
    schedule: shoots.filter(s => s.status === "scheduled").length
      + items.filter(i => (i.status === "branding_ready" || i.status === "ads_ready") && !!i.scheduled_post_date).length,
    ads: ads.filter(a => a.status === "active").length,
  }), [items, shoots, ads, overview])
```

Find (around line 4020-4021):

```ts
  const navSections = useMemo(() => {
    if (mode === "ads" || mode === "overview") return []
```

Replace with:

```ts
  const navSections = useMemo(() => {
    if (mode === "schedule") {
      const scheduledContent = items.filter(i => (i.status === "branding_ready" || i.status === "ads_ready") && i.scheduled_post_date)
      return [
        { key: "shoot", label: "Shoot", icon: Camera, count: shoots.filter(s => s.status === "scheduled").length },
        { key: "video", label: "Video", icon: Video, count: scheduledContent.filter(i => i.content_type === "video").length },
        { key: "poster", label: "Poster", icon: ImageIcon, count: scheduledContent.filter(i => i.content_type === "poster").length },
        { key: "ads", label: "Ads", icon: Megaphone, count: scheduledContent.filter(i => i.status === "ads_ready").length },
      ]
    }
    if (mode === "ads" || mode === "overview") return []
```

(The existing `if (mode === "ads" || mode === "overview") return []` line and everything
below it in that block stays exactly as-is — only the new `if` block above it is new.)

- [ ] **Step 6: Route `TrackerNav`'s `tab`/`onTab` through `scheduleSubTab` when in Schedule mode**

Find (around line 4467):

```tsx
      <TrackerNav
        mode={mode}
        onMode={setMode}
        tab={tab}
        onTab={k => setSubTab(k as typeof subTab)}
        modeCounts={navCounts}
        sections={navSections}
      />
```

Replace with:

```tsx
      <TrackerNav
        mode={mode}
        onMode={setMode}
        tab={mode === "schedule" ? scheduleSubTab : tab}
        onTab={k => { if (mode === "schedule") setScheduleSubTab(k as typeof scheduleSubTab); else setSubTab(k as typeof subTab) }}
        modeCounts={navCounts}
        sections={navSections}
      />
```

- [ ] **Step 7: Render `ScheduleTab` for Schedule mode**

Find the end of the Ads mode block (around line 5129-5131):

```tsx
        </div>
      )}

      {mode === "video" && tab === "shoots" && (
```

Replace with:

```tsx
        </div>
      )}

      {mode === "schedule" && (
        <ScheduleTab entries={activeScheduleEntries} activeClientOptions={activeClientOptions} pastClientOptions={pastClientOptions} />
      )}

      {mode === "video" && tab === "shoots" && (
```

- [ ] **Step 8: Typecheck and lint**

Run: `pnpm typecheck`
Expected: no errors. If `scheduledContentItems`/`toScheduleEntry` report unused-before-use
or ordering issues, confirm Step 4's block was inserted after `navSections` (not before) —
`toScheduleEntry` and the entry `useMemo`s must come after `today`, `handleShootStatus`,
`STATUS_CFG`, `SHOOT_STATUS_CFG`, `setPlatformModalKind`, `setPlatformModalItem`, and
`setEditingItem` are all already declared earlier in the component (`today` at line 3963,
the rest further still), so placing the new block after `navSections` (line ~4038) keeps
it below all of them.

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add components/media-tracker/media-tracker-client.tsx
git commit -m "feat(media-tracker): wire Schedule tab into the tracker nav"
```

---

### Task 6: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass (the pre-existing, unrelated `lib/whatsapp.test.ts` failures, if
still present, are not caused by this work — confirm no *new* failures appear).

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev`
Expected: starts on `localhost:3000` with no console errors.

- [ ] **Step 3: Walk the spec's verification checklist in the browser**

Using an admin login, open `/admin/media-tracker` and confirm, per the design spec
(`docs/superpowers/specs/2026-07-28-media-tracker-schedule-tab-design.md`):

1. A "Schedule" tab appears in the nav after "Poster", with Shoot/Video/Poster/Ads
   sub-tabs beneath it.
2. Schedule a video's post for today via the existing Ready to Post flow; confirm it
   appears in Schedule → Video, in both List and Calendar views, at today's date/time.
3. Click "Mark Posted" from the Schedule tab; confirm the item disappears from
   Schedule → Video and shows up in the Branding (or Advertisement) log tab, same as
   marking posted from there directly would.
4. Create a shoot; confirm it appears in Schedule → Shoot. Click "Mark Done"; confirm
   the existing Shoots kanban (Video mode → Shoots tab) reflects the same status change,
   and the item drops off Schedule → Shoot.
5. Schedule a video item to post on an ads platform (Ads Ready); confirm it appears
   under both Schedule → Video and Schedule → Ads.
6. Use "Reschedule" on an item in the Schedule tab; confirm the date/time change is
   reflected on that item's card in Pipeline/Branding/Advertisement too.
7. Resize the browser to 360px width; confirm the List and Calendar views don't overlap
   or clip text, matching the project's mobile-first requirement.

- [ ] **Step 4: Stop the dev server**

If started in the foreground, stop it with Ctrl+C once verification is complete.
