# Admin Expenses & Freelancers Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `app/admin/expenses/expenses-client.tsx` and the Freelancers pages (`app/admin/freelancers/admin-freelancers-tabs.tsx`, `app/member/freelancers/freelancers-member-client.tsx`) with a shared "Glass & Gradient" visual language, replacing the Cost Summary table with per-client cards, consolidating the 3 "Add Expense" buttons into one segmented drawer, and giving Admin's Freelancers page the same hero banner Member already has.

**Architecture:** Four new small shared presentational components (`GlassCard`, `SegmentedControl`, `DrawerPanel`, `FreelancersHero`) get built first, then wired into the two existing client components. No new dependencies, no server action or schema changes — every change lives in `'use client'` files plus the new components.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, inline style objects (matching existing codebase convention), TypeScript strict mode. No new npm packages.

## Global Constraints

- UI/structural changes only — do not modify any file under `lib/actions/`, `lib/validations/`, or any Supabase query/schema.
- No new npm dependencies (donut chart uses CSS `conic-gradient`, not a charting library).
- Follow the existing codebase convention of inline `style={{...}}` objects for one-off styling and Tailwind utility classes for layout/spacing — don't introduce a CSS-in-JS library or `.module.css` files.
- Keep `pnpm typecheck` passing after every task (pre-existing unrelated errors about missing `zod`/`@dnd-kit/core` modules are expected and not something to fix).
- Money values must use `font-variant-numeric: tabular-nums` wherever displayed (per spec's typography rule).

---

## File Structure

**New files:**
- `components/ui/GlassCard.tsx` — frosted-glass card wrapper, used by both redesigned pages
- `components/ui/SegmentedControl.tsx` — animated pill-track segmented control
- `components/ui/DrawerPanel.tsx` — right-side slide-over shell (backdrop + sliding glass panel)
- `components/freelancers/FreelancersHero.tsx` — shared hero banner (badge/title/subtitle/illustration/metric pills), extracted from Member's existing inline hero

**Modified files:**
- `app/admin/expenses/expenses-client.tsx` — gradient-mesh background, glass summary strip with donut, single "+ Add Expense" drawer replacing 3 buttons, 3 modal bodies converted to drawer content, Cost Summary converted to per-client card accordion, Client Direct / Common Shared converted to collapsible accordions
- `app/member/freelancers/freelancers-member-client.tsx` — inline hero replaced with `<FreelancersHero>`
- `app/admin/freelancers/admin-freelancers-tabs.tsx` — inline plain hero replaced with `<FreelancersHero>` (fed combined stats), sidebar rows restyled, team-filter pill row added

---

### Task 1: `GlassCard` shared component

**Files:**
- Create: `components/ui/GlassCard.tsx`

**Interfaces:**
- Produces: `GlassCard` component — `{ children: React.ReactNode; className?: string; style?: React.CSSProperties; hover?: boolean; onClick?: () => void }`. Later tasks import it as `import { GlassCard } from "@/components/ui/GlassCard"`.

- [ ] **Step 1: Write the component**

```tsx
"use client"

import type { ReactNode, CSSProperties, MouseEventHandler } from "react"

// Shared "frosted glass" surface used across the Expenses and Freelancers
// redesigns — frosted translucent background, soft border, and a diffuse
// shadow. `hover` adds a lift-on-hover affordance for clickable cards.
export function GlassCard({
  children,
  className,
  style,
  hover = false,
  onClick,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  hover?: boolean
  onClick?: MouseEventHandler<HTMLDivElement>
}) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.55)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.8)",
        borderRadius: 20,
        boxShadow: "0 8px 32px rgba(31,38,135,0.08)",
        transition: hover ? "transform 0.15s ease, box-shadow 0.15s ease" : undefined,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
      onMouseEnter={hover ? (e) => {
        e.currentTarget.style.transform = "translateY(-2px)"
        e.currentTarget.style.boxShadow = "0 12px 40px rgba(31,38,135,0.14)"
      } : undefined}
      onMouseLeave={hover ? (e) => {
        e.currentTarget.style.transform = "translateY(0)"
        e.currentTarget.style.boxShadow = "0 8px 32px rgba(31,38,135,0.08)"
      } : undefined}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: No new errors mentioning `GlassCard.tsx` (pre-existing `zod`/`@dnd-kit/core` module errors in unrelated files are fine).

- [ ] **Step 3: Commit**

```bash
git add components/ui/GlassCard.tsx
git commit -m "feat(ui): add shared GlassCard component for admin redesign"
```

---

### Task 2: `SegmentedControl` shared component

**Files:**
- Create: `components/ui/SegmentedControl.tsx`

**Interfaces:**
- Produces: `SegmentedControl<T extends string>` component — `{ options: { value: T; label: string; icon?: React.ReactNode }[]; value: T; onChange: (v: T) => void }`. Later tasks import as `import { SegmentedControl } from "@/components/ui/SegmentedControl"`.

- [ ] **Step 1: Write the component**

```tsx
"use client"

import type { ReactNode } from "react"

// Pill-track segmented control with an animated sliding "thumb" behind the
// active option. Used by the Expenses add-drawer to switch between
// Travel / Client / Common without leaving the drawer.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  const activeIndex = Math.max(0, options.findIndex(o => o.value === value))

  return (
    <div style={{ position: "relative", display: "flex", background: "rgba(0,0,0,0.04)", borderRadius: 14, padding: 4 }}>
      <div style={{
        position: "absolute", top: 4, bottom: 4, left: 4,
        width: `calc(${100 / options.length}% - 4px)`,
        transform: `translateX(${activeIndex * 100}%)`,
        transition: "transform 0.2s ease",
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(8px)",
        borderRadius: 11,
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }} />
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            position: "relative", zIndex: 1, flex: 1,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "7px 8px", border: "none", background: "transparent", cursor: "pointer",
            fontSize: 12, fontWeight: 800,
            color: o.value === value ? "#111111" : "#6B7280",
          }}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: No new errors mentioning `SegmentedControl.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/ui/SegmentedControl.tsx
git commit -m "feat(ui): add shared SegmentedControl component for admin redesign"
```

---

### Task 3: `DrawerPanel` shared component

**Files:**
- Create: `components/ui/DrawerPanel.tsx`

**Interfaces:**
- Produces: `DrawerPanel` component — `{ open: boolean; onClose: () => void; header: React.ReactNode; children: React.ReactNode; widthClassName?: string }`. Later tasks import as `import { DrawerPanel } from "@/components/ui/DrawerPanel"`.

- [ ] **Step 1: Write the component**

```tsx
"use client"

import type { ReactNode } from "react"
import { X } from "lucide-react"

// Right-side slide-over shell: semi-transparent backdrop (click to close)
// + a frosted glass panel sliding in from the right. `header` is rendered
// above a close button (e.g. a SegmentedControl), `children` is the
// scrollable body.
export function DrawerPanel({
  open,
  onClose,
  header,
  children,
  widthClassName = "w-full max-w-md",
}: {
  open: boolean
  onClose: () => void
  header: ReactNode
  children: ReactNode
  widthClassName?: string
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className={`${widthClassName} h-full flex flex-col`}
        style={{
          background: "rgba(255,255,255,0.75)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderLeft: "1px solid rgba(255,255,255,0.8)",
          boxShadow: "-16px 0 48px rgba(31,38,135,0.16)",
          animation: "drawerSlideIn 0.22s ease",
        }}
      >
        <style>{`@keyframes drawerSlideIn { from { transform: translateX(24px); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }`}</style>
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 hover:bg-black/5 transition-colors">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: No new errors mentioning `DrawerPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/ui/DrawerPanel.tsx
git commit -m "feat(ui): add shared DrawerPanel component for admin redesign"
```

---

### Task 4: `FreelancersHero` shared component

**Files:**
- Create: `components/freelancers/FreelancersHero.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `FreelancersHero` component — `{ badgeLabel: string; title: string; subtitle: string; metrics: { label: string; value: string; color: string }[] }`. Task 5 and Task 6 import it as `import { FreelancersHero } from "@/components/freelancers/FreelancersHero"`.

This is extracted verbatim (structure-wise) from the hero block currently inline in `app/member/freelancers/freelancers-member-client.tsx` (the `{!isEmbedded && (...)}` block), just parameterized instead of reading `activeFreelancers`/`globalStats`/`globalMonth` directly.

- [ ] **Step 1: Write the component**

```tsx
"use client"

import Image from "next/image"

export type FreelancersHeroMetric = { label: string; value: string; color: string }

// Shared hero banner for the Freelancers page — badge, title, subtitle,
// illustration, and a row of metric pills. Used identically by both the
// Member and Admin Freelancers pages so they can't visually drift apart;
// each caller only supplies its own stats.
export function FreelancersHero({
  badgeLabel,
  title,
  subtitle,
  metrics,
}: {
  badgeLabel: string
  title: string
  subtitle: string
  metrics: FreelancersHeroMetric[]
}) {
  const heroPill = (m: FreelancersHeroMetric) => (
    <div key={m.label} style={{
      padding: "8px 16px", borderRadius: 12,
      background: "rgba(255,255,255,0.16)", backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,0.28)",
    }}>
      <p style={{ fontSize: 17, fontWeight: 900, color: m.color, margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{m.value}</p>
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{m.label}</p>
    </div>
  )

  return (
    <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius: 20, padding: "16px 18px", boxShadow: "0 8px 32px rgba(180,0,0,0.35)", position: "relative", overflow: "hidden", minHeight: 150 }}>
      <div style={{ position: "absolute", top: -50, right: -30, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -40, left: 60, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

      <div className="flex flex-col gap-3" style={{ position: "relative", zIndex: 2 }}>
        <div className="flex items-start lg:items-center justify-between gap-4">
          <div className="max-w-[58%] lg:max-w-[34%]" style={{ flexShrink: 0 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "rgba(255,255,255,0.15)", color: "#fff", marginBottom: 10, border: "1px solid rgba(255,255,255,0.2)", letterSpacing: "0.04em" }}>
              👥 {badgeLabel}
            </span>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "var(--font-jakarta)", margin: "0 0 4px" }}>{title}</h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: 0 }}>{subtitle}</p>
          </div>

          <div className="lg:hidden w-[92px] shrink-0" style={{ pointerEvents: "none" }}>
            <Image src="/brand/freelancers-hero.png" alt="" width={380} height={253}
              style={{ objectFit: "contain", objectPosition: "center", display: "block", width: "100%", height: "auto" }} priority />
          </div>
          <div className="hidden lg:block lg:w-[380px] shrink-0" style={{ pointerEvents: "none" }}>
            <Image src="/brand/freelancers-hero.png" alt="" width={380} height={253}
              style={{ objectFit: "contain", objectPosition: "center", display: "block", width: "100%", height: "auto", maxHeight: 150 }} priority />
          </div>

          <div className="hidden lg:flex flex-wrap justify-end gap-2.5" style={{ flexShrink: 0 }}>
            {metrics.map(heroPill)}
          </div>
        </div>

        <div className="flex lg:hidden flex-wrap gap-2.5">
          {metrics.map(heroPill)}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: No new errors mentioning `FreelancersHero.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/freelancers/FreelancersHero.tsx
git commit -m "feat(freelancers): add shared FreelancersHero component"
```

---

### Task 5: Wire `FreelancersHero` into Member's Freelancers page

**Files:**
- Modify: `app/member/freelancers/freelancers-member-client.tsx:1-30` (add import), `:1016-1074` (replace inline hero block)

**Interfaces:**
- Consumes: `FreelancersHero` from Task 4, exact props `{ badgeLabel, title, subtitle, metrics }`.

- [ ] **Step 1: Add the import**

Find the existing `import Image from "next/image"` line near the top of `app/member/freelancers/freelancers-member-client.tsx` and add directly after it:

```tsx
import { FreelancersHero } from "@/components/freelancers/FreelancersHero"
```

- [ ] **Step 2: Replace the inline hero block with the shared component**

Find this exact block (currently at roughly lines 1016–1074):

```tsx
  const heroMetrics = [
    { label: "Freelancers", value: String(globalStats.total), color: "#A5B4FC" },
    { label: "Works", value: String(globalStats.totalWorks), color: "#7DD3FC" },
    { label: "Total", value: fmt(globalStats.totalCost), color: "#FFFFFF" },
    { label: "Paid", value: fmt(globalStats.paidCost), color: "#6EE7B7" },
    { label: "Unpaid", value: fmt(globalStats.unpaidCost), color: "#FCA5A5" },
  ] as const
  const heroPill = (s: typeof heroMetrics[number]) => (
    <div key={s.label} style={{ padding: "8px 16px", borderRadius: 12, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
      <p style={{ fontSize: 17, fontWeight: 900, color: s.color, margin: 0, fontFamily: "var(--font-jakarta)", lineHeight: 1.2 }}>{s.value}</p>
      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{s.label}</p>
    </div>
  )

  return (
    <div style={{ ...(isEmbedded ? { flex: 1, minHeight: 0 } : { height: "100vh" }), display: "flex", flexDirection: "column", background: "#F5F6FA", overflow: "hidden" }}>

      {/* Hero — admin embeds this component inside its own gradient hero already, so skip it here to avoid stacking two */}
      {!isEmbedded && (
        <div style={{ flexShrink: 0, margin: "14px 14px 0" }}>
          <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius: 20, padding: "16px 18px", boxShadow: "0 8px 32px rgba(180,0,0,0.35)", position: "relative", overflow: "hidden", minHeight: 150 }}>
            <div style={{ position: "absolute", top: -50, right: -30, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -40, left: 60, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

            <div className="flex flex-col gap-3" style={{ position: "relative", zIndex: 2 }}>
              {/* Top row: text left, illustration right (mobile) / centered (desktop) */}
              <div className="flex items-start lg:items-center justify-between gap-4">
                <div className="max-w-[58%] lg:max-w-[34%]" style={{ flexShrink: 0 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "rgba(255,255,255,0.15)", color: "#fff", marginBottom: 10, border: "1px solid rgba(255,255,255,0.2)", letterSpacing: "0.04em" }}>
                    👥 Freelancers
                  </span>
                  <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", fontFamily: "var(--font-jakarta)", margin: "0 0 4px" }}>Freelancers</h1>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: 0 }}>{activeFreelancers.length} active · {new Date(globalMonth + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
                </div>

                {/* Illustration — small on the right on mobile, larger + centered on desktop */}
                <div className="lg:hidden w-[92px] shrink-0" style={{ pointerEvents: "none" }}>
                  <Image src="/brand/freelancers-hero.png" alt="" width={380} height={253}
                    style={{ objectFit: "contain", objectPosition: "center", display: "block", width: "100%", height: "auto" }} priority />
                </div>
                <div className="hidden lg:block lg:w-[380px] shrink-0" style={{ pointerEvents: "none" }}>
                  <Image src="/brand/freelancers-hero.png" alt="" width={380} height={253}
                    style={{ objectFit: "contain", objectPosition: "center", display: "block", width: "100%", height: "auto", maxHeight: 150 }} priority />
                </div>

                {/* Metrics — desktop only, right side */}
                <div className="hidden lg:flex flex-wrap justify-end gap-2.5" style={{ flexShrink: 0 }}>
                  {heroMetrics.map(heroPill)}
                </div>
              </div>

              {/* Metrics — mobile/tablet, full-width row below */}
              <div className="flex lg:hidden flex-wrap gap-2.5">
                {heroMetrics.map(heroPill)}
              </div>
            </div>
          </div>
        </div>
      )}
```

Replace it with:

```tsx
  const heroMetrics = [
    { label: "Freelancers", value: String(globalStats.total), color: "#A5B4FC" },
    { label: "Works", value: String(globalStats.totalWorks), color: "#7DD3FC" },
    { label: "Total", value: fmt(globalStats.totalCost), color: "#FFFFFF" },
    { label: "Paid", value: fmt(globalStats.paidCost), color: "#6EE7B7" },
    { label: "Unpaid", value: fmt(globalStats.unpaidCost), color: "#FCA5A5" },
  ]

  return (
    <div style={{ ...(isEmbedded ? { flex: 1, minHeight: 0 } : { height: "100vh" }), display: "flex", flexDirection: "column", background: "#F5F6FA", overflow: "hidden" }}>

      {/* Hero — admin embeds this component inside its own gradient hero already, so skip it here to avoid stacking two */}
      {!isEmbedded && (
        <div style={{ flexShrink: 0, margin: "14px 14px 0" }}>
          <FreelancersHero
            badgeLabel="Freelancers"
            title="Freelancers"
            subtitle={`${activeFreelancers.length} active · ${new Date(globalMonth + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`}
            metrics={heroMetrics}
          />
        </div>
      )}
```

Note: `Image` may become an unused import in this file if nothing else uses it — check with a search for other `<Image` usages in the file before removing the import; if other usages remain, leave the import as-is.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: No new errors mentioning `freelancers-member-client.tsx`.

- [ ] **Step 4: Manual visual check**

Run: `pnpm dev`, visit `/member/freelancers`.
Expected: Hero banner renders identically to before (badge, title, subtitle, illustration, metric pills) — this task is a pure refactor with no visual change yet (pill background changed from `rgba(255,255,255,0.12)` solid to a slightly glassier `rgba(255,255,255,0.16)` + blur, which is an intentional tiny step toward the glass language, not a regression).

- [ ] **Step 5: Commit**

```bash
git add app/member/freelancers/freelancers-member-client.tsx
git commit -m "refactor(member/freelancers): use shared FreelancersHero component"
```

---

### Task 6: Wire `FreelancersHero` into Admin's Freelancers page

**Files:**
- Modify: `app/admin/freelancers/admin-freelancers-tabs.tsx:1-10` (imports), `:100-132` (replace plain hero + add stats computation)

**Interfaces:**
- Consumes: `FreelancersHero` from Task 4.

- [ ] **Step 1: Add the import**

At the top of `app/admin/freelancers/admin-freelancers-tabs.tsx`, alongside the existing imports, add:

```tsx
import { FreelancersHero } from "@/components/freelancers/FreelancersHero"
```

- [ ] **Step 2: Compute combined stats**

Find the existing block (currently around lines 78–87):

```tsx
  const flMediaTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of flEntries) {
      if (e.price != null) map[e.user_id] = (map[e.user_id] ?? 0) + e.price
    }
    return map
  }, [flEntries])

  const flTotals = useMemo(() => {
    const map: Record<string, number> = {}
    for (const e of workEntries) {
      map[e.freelancer_id] = (map[e.freelancer_id] ?? 0) + (e.amount ?? 0)
    }
    return map
  }, [workEntries])

  const activeFreelancers = useMemo(() => freelancers.filter(f => f.status === "active"), [freelancers])
  const totalCount = flMembers.length + activeFreelancers.length
```

Add directly after `const totalCount = ...`:

```tsx

  // Combined hero stats — Login Members' priced entries have no paid/unpaid
  // split in the data model (just a `price`), so they count toward Total
  // Works and Total Cost but not the Paid/Unpaid breakdown, which is
  // sourced only from freelancer `workEntries.payment_status`.
  const heroStats = useMemo(() => {
    const totalCost = workEntries.reduce((s, e) => s + (e.amount ?? 0), 0) + flEntries.reduce((s, e) => s + (e.price ?? 0), 0)
    const paidCost = workEntries.filter(e => e.payment_status === "paid").reduce((s, e) => s + (e.amount ?? 0), 0)
    const unpaidCost = workEntries.filter(e => e.payment_status === "unpaid").reduce((s, e) => s + (e.amount ?? 0), 0)
    return {
      total: totalCount,
      totalWorks: workEntries.length + flEntries.length,
      totalCost,
      paidCost,
      unpaidCost,
    }
  }, [workEntries, flEntries, totalCount])
```

- [ ] **Step 3: Replace the plain hero block**

Find this exact block (currently around lines 102–132):

```tsx
      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, margin: "14px 14px 0", borderRadius: 18, overflow: "hidden", background: "linear-gradient(135deg, #de1a1a 0%, #991B1B 50%, #7F1D1D 100%)", boxShadow: "0 6px 24px rgba(222,26,26,0.3)", position: "relative" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -20, right: 140, width: 90, height: 90, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
        <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "relative", zIndex: 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 7, padding: "3px 5px", display: "flex", alignItems: "center" }}>
                <Sparkles size={12} style={{ color: "#FFD700" }} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Admin Dashboard</span>
            </div>
            <h1 style={{ fontSize: "clamp(18px,5vw,28px)", fontWeight: 900, color: "#FFFFFF", margin: "0 0 2px", lineHeight: 1.1 }}>Freelancers</h1>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              {([
                { icon: <Users size={9} />, label: `${activeFreelancers.length} Freelancers` },
                { icon: <Briefcase size={9} />, label: `${workEntries.length} Entries` },
                { icon: <FileText size={9} />, label: `${flMembers.length} Media` },
              ] as const).map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.15)", borderRadius: 14, padding: "2px 8px" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>{s.icon}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#FFFFFF" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Briefcase size={15} style={{ color: "#FFFFFF" }} />
          </div>
        </div>
      </div>
```

Replace it with:

```tsx
      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, margin: "14px 14px 0" }}>
        <FreelancersHero
          badgeLabel="Admin · Freelancers"
          title="Freelancers"
          subtitle={`${activeFreelancers.length} freelancers · ${flMembers.length} login members`}
          metrics={[
            { label: "Members", value: String(heroStats.total), color: "#A5B4FC" },
            { label: "Works", value: String(heroStats.totalWorks), color: "#7DD3FC" },
            { label: "Total", value: fmt(heroStats.totalCost), color: "#FFFFFF" },
            { label: "Paid", value: fmt(heroStats.paidCost), color: "#6EE7B7" },
            { label: "Unpaid", value: fmt(heroStats.unpaidCost), color: "#FCA5A5" },
          ]}
        />
      </div>
```

Note: `Sparkles`, `Users`, `Briefcase`, `FileText` icon imports may become unused in this file after this change — check remaining usages (the left-panel "All Members" count badge, etc.) before removing any import; only remove ones with zero remaining references.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: No new errors mentioning `admin-freelancers-tabs.tsx`.

- [ ] **Step 5: Manual visual check**

Run: `pnpm dev`, visit `/admin/freelancers`.
Expected: Hero now shows the same illustration + metric-pill layout as `/member/freelancers`, with admin-appropriate numbers (Members = login members + freelancers, Works = combined entry count, Total/Paid/Unpaid computed as above).

- [ ] **Step 6: Commit**

```bash
git add app/admin/freelancers/admin-freelancers-tabs.tsx
git commit -m "feat(admin/freelancers): use shared FreelancersHero with combined stats"
```

---

### Task 7: Restyle Admin's sidebar list + add team-filter pills

**Files:**
- Modify: `app/admin/freelancers/admin-freelancers-tabs.tsx` (left panel section, currently ~lines 137–209)

**Interfaces:**
- Consumes: existing `TEAM_COLOR`, `TEAM_EMOJI`, `TEAM_SHORT` maps already defined in this file; `activeFreelancers` from Task 6.

- [ ] **Step 1: Add team-filter state**

Near the top of the component (alongside `const [selected, setSelected] = useState...`), add:

```tsx
  const [teamFilter, setTeamFilter] = useState<string | "all">("all")
```

- [ ] **Step 2: Compute which teams have members (for the filter row)**

Directly after the `activeFreelancers`/`totalCount` block from Task 6, add:

```tsx
  const teamsPresent = useMemo(() => {
    const set = new Set<string>()
    for (const f of activeFreelancers) set.add(f.team)
    return Array.from(set)
  }, [activeFreelancers])

  const visibleFreelancers = useMemo(
    () => teamFilter === "all" ? activeFreelancers : activeFreelancers.filter(f => f.team === teamFilter),
    [activeFreelancers, teamFilter]
  )
```

- [ ] **Step 3: Insert the team-filter pill row above the list**

Find this exact block (the "All Members" button, currently ~lines 141–144):

```tsx
          <button onClick={() => { setSelected(null); setMobileShowRight(true) }} style={{ width: "100%", padding: "10px 14px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", background: !selected ? "rgba(99,102,241,0.06)" : "transparent", border: "none", borderLeft: `3px solid ${!selected ? "#6366F1" : "transparent"}`, cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: !selected ? "#6366F1" : "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em" }}>All Members</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", background: "#F0F0F5", borderRadius: 99, padding: "1px 7px" }}>{totalCount}</span>
          </button>
```

Replace it with (adding the filter-pill row before the existing button, unchanged otherwise):

```tsx
          {teamsPresent.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "8px 14px 4px" }}>
              <button onClick={() => setTeamFilter("all")} title="All teams"
                style={{ width: 28, height: 28, borderRadius: 9, border: "none", cursor: "pointer", background: teamFilter === "all" ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.04)", backdropFilter: teamFilter === "all" ? "blur(6px)" : undefined, boxShadow: teamFilter === "all" ? "0 2px 8px rgba(0,0,0,0.1)" : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                ✨
              </button>
              {teamsPresent.map(t => {
                const color = TEAM_COLOR[t] ?? "#6B7280"
                const emoji = TEAM_EMOJI[t] ?? "👤"
                const active = teamFilter === t
                return (
                  <button key={t} onClick={() => setTeamFilter(active ? "all" : t)} title={TEAM_SHORT[t] ?? t}
                    style={{ width: 28, height: 28, borderRadius: 9, border: "none", cursor: "pointer", background: active ? `${color}22` : "rgba(0,0,0,0.04)", boxShadow: active ? `0 2px 8px ${color}30` : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, transition: "all 0.15s" }}>
                    {emoji}
                  </button>
                )
              })}
            </div>
          )}
          <button onClick={() => { setSelected(null); setMobileShowRight(true) }} style={{ width: "100%", padding: "10px 14px 6px", display: "flex", alignItems: "center", justifyContent: "space-between", background: !selected ? "rgba(99,102,241,0.06)" : "transparent", border: "none", borderLeft: `3px solid ${!selected ? "#6366F1" : "transparent"}`, cursor: "pointer", textAlign: "left" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: !selected ? "#6366F1" : "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.1em" }}>All Members</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#9CA3AF", background: "#F0F0F5", borderRadius: 99, padding: "1px 7px" }}>{totalCount}</span>
          </button>
```

- [ ] **Step 4: Use `visibleFreelancers` instead of `activeFreelancers` in the Freelancers list loop**

Find (currently ~line 181):

```tsx
            {activeFreelancers.map(f => {
```

Replace with:

```tsx
            {visibleFreelancers.map(f => {
```

Also find the section-header count check just above it (currently ~line 176):

```tsx
        {activeFreelancers.length > 0 && (
```

Replace with:

```tsx
        {visibleFreelancers.length > 0 && (
```

Note: the "Login Members" section and its count are unaffected by `teamFilter` (Login Members aren't part of the `TEAM_COLOR`-keyed teams) — leave that section's `flMembers.map(...)` loop untouched.

- [ ] **Step 5: Restyle the row avatar/selection treatment to the glass language**

Find this exact block inside the Freelancers `.map(f => ...)` (currently ~lines 187–201):

```tsx
              return (
                <button key={f.id} onClick={() => setSelected(s => s?.id === f.id ? null : { type: "fl", id: f.id })}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: isActive ? `${color}12` : "transparent", border: "none", borderLeft: `3px solid ${isActive ? color : "transparent"}`, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: isActive ? `linear-gradient(135deg, ${color}, ${color}CC)` : `${color}15`, border: `1.5px solid ${isActive ? "transparent" : `${color}30`}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: isActive ? "#fff" : color, boxShadow: isActive ? `0 4px 10px ${color}40` : "none" }}>
                    {getInitials(f.name)}
                  </div>
```

Replace with (only the row's `background`/`backdropFilter` change to the glass tint — avatar circle unchanged):

```tsx
              return (
                <button key={f.id} onClick={() => setSelected(s => s?.id === f.id ? null : { type: "fl", id: f.id })}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", background: isActive ? `${color}14` : "transparent", backdropFilter: isActive ? "blur(6px)" : undefined, border: "none", borderLeft: `3px solid ${isActive ? color : "transparent"}`, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", flexShrink: 0, background: isActive ? `linear-gradient(135deg, ${color}, ${color}CC)` : `${color}15`, border: `1.5px solid ${isActive ? "transparent" : `${color}30`}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: isActive ? "#fff" : color, boxShadow: isActive ? `0 4px 10px ${color}40` : "none" }}>
                    {getInitials(f.name)}
                  </div>
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: No new errors mentioning `admin-freelancers-tabs.tsx`.

- [ ] **Step 7: Manual visual check**

Run: `pnpm dev`, visit `/admin/freelancers`.
Expected: A row of small colored team-emoji pills appears above "All Members"; clicking one filters the Freelancers list to that team (Login Members section stays unaffected); clicking again (or the ✨ pill) resets to all teams. Selected row shows a subtle frosted highlight.

- [ ] **Step 8: Commit**

```bash
git add app/admin/freelancers/admin-freelancers-tabs.tsx
git commit -m "feat(admin/freelancers): add team-filter pills, glass row selection"
```

---

### Task 8: Expenses — gradient-mesh background + glass summary strip with donut

**Files:**
- Modify: `app/admin/expenses/expenses-client.tsx:522-557` (page background + summary cards → summary strip)

**Interfaces:**
- Consumes: `GlassCard` from Task 1.

- [ ] **Step 1: Add the import**

Near the top of `app/admin/expenses/expenses-client.tsx`, alongside the existing `import { PageHero } from "@/components/admin/PageHero"`, add:

```tsx
import { GlassCard } from "@/components/ui/GlassCard"
```

- [ ] **Step 2: Replace the page background + 4 summary cards with a gradient-mesh canvas + one glass summary strip**

Find this exact block (currently lines 522–557):

```tsx
  return (
    <div className="min-h-screen" style={{ background: "#F8F9FB" }}>
      <div className="p-4 md:p-6 xl:p-8 max-w-[1300px] mx-auto space-y-6">

        {/* Header */}
        <PageHero
          eyebrowIcon={<Wallet size={14} style={{ color: "#FFD700" }} />}
          title="Expenses"
          subtitle="Track client direct, common shared & overhead costs"
          rightSlot={
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.12)" }}>
              <button onClick={() => goMonth(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg hover:bg-white/10 transition-colors">‹</button>
              <span className="text-[14px] font-black text-white px-2">{MONTHS_SHORT[mo - 1]} {yr}</span>
              <button onClick={() => goMonth(1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg hover:bg-white/10 transition-colors">›</button>
            </div>
          }
        />

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Expenses",   value: fmtRupee(grandTotal),        color: "#de1a1a", bg: "rgba(222,26,26,0.06)",  icon: <IndianRupee size={15} style={{ color: "#de1a1a" }} /> },
            { label: "Client Direct",    value: fmtRupee(totalClientDirect), color: "#3B82F6", bg: "rgba(59,130,246,0.06)", icon: <Receipt size={15} style={{ color: "#3B82F6" }} /> },
            { label: "Common Shared",    value: fmtRupee(totalCommon),       color: "#8B5CF6", bg: "rgba(139,92,246,0.06)", icon: <Layers size={15} style={{ color: "#8B5CF6" }} /> },
            { label: "Per Client/Brand", value: fmtRupee(perClientOverhead), color: "#10B981", bg: "rgba(16,185,129,0.06)", icon: <Building2 size={15} style={{ color: "#10B981" }} /> },
          ].map(k => (
            <div key={k.label} className="rounded-2xl py-5 px-4 flex flex-col items-center justify-center text-center gap-2"
              style={{ background: "#FFFFFF", border: `1.5px solid ${k.color}20`, boxShadow: "0 2px 12px rgba(0,0,0,0.04)", minHeight: "120px" }}>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: k.bg }}>{k.icon}</div>
                <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: "#6B7280" }}>{k.label}</p>
              </div>
              <p className="text-[24px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: k.color }}>{k.value}</p>
            </div>
          ))}
        </div>
```

Replace it with:

```tsx
  const donutPct = grandTotal > 0
    ? {
        direct: (totalClientDirect / grandTotal) * 100,
        common: (totalCommon / grandTotal) * 100,
      }
    : { direct: 0, common: 0 }

  return (
    <div className="min-h-screen" style={{
      background: "radial-gradient(circle at 15% 10%, rgba(222,26,26,0.05), transparent 45%), radial-gradient(circle at 90% 85%, rgba(99,102,241,0.05), transparent 45%), #FAFAFA",
    }}>
      <div className="p-4 md:p-6 xl:p-8 max-w-[1300px] mx-auto space-y-6">

        {/* Header */}
        <PageHero
          eyebrowIcon={<Wallet size={14} style={{ color: "#FFD700" }} />}
          title="Expenses"
          subtitle="Track client direct, common shared & overhead costs"
          rightSlot={
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.12)" }}>
              <button onClick={() => goMonth(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg hover:bg-white/10 transition-colors">‹</button>
              <span className="text-[14px] font-black text-white px-2">{MONTHS_SHORT[mo - 1]} {yr}</span>
              <button onClick={() => goMonth(1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-lg hover:bg-white/10 transition-colors">›</button>
            </div>
          }
        />

        {/* Summary strip: total + donut + category chips */}
        <GlassCard className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div style={{
            width: 84, height: 84, borderRadius: "50%", flexShrink: 0,
            background: `conic-gradient(#3B82F6 0% ${donutPct.direct}%, #8B5CF6 ${donutPct.direct}% ${donutPct.direct + donutPct.common}%, #10B981 ${donutPct.direct + donutPct.common}% 100%)`,
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Total · {MONTHS_SHORT[mo - 1]} {yr}</p>
            <p className="text-[30px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#DE1A1A", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(grandTotal)}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span style={{ background: "rgba(59,130,246,0.14)", color: "#3B82F6", fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 99 }}>🔵 Client Direct {fmtRupee(totalClientDirect)}</span>
              <span style={{ background: "rgba(139,92,246,0.14)", color: "#8B5CF6", fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 99 }}>🟣 Common {fmtRupee(totalCommon)}</span>
              <span style={{ background: "rgba(16,185,129,0.14)", color: "#10B981", fontSize: 11, fontWeight: 800, padding: "5px 12px", borderRadius: 99 }}>🟢 Per Client {fmtRupee(perClientOverhead)}</span>
            </div>
          </div>
        </GlassCard>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: No new errors mentioning `expenses-client.tsx`. If `IndianRupee`, `Receipt`, `Layers`, or `Building2` icon imports become unused after this change, check remaining usages elsewhere in the file (Layers and Building2 are still used by the Common Shared section and action buttons respectively later in the file — do not remove those imports).

- [ ] **Step 4: Manual visual check**

Run: `pnpm dev`, visit `/admin/expenses`.
Expected: Background shows a faint gradient wash instead of flat grey; the 4 stat cards are replaced by one glass card with a donut, big total, and 3 colored chips restating Client Direct / Common / Per Client amounts.

- [ ] **Step 5: Commit**

```bash
git add app/admin/expenses/expenses-client.tsx
git commit -m "feat(admin/expenses): gradient-mesh background + glass summary strip with donut"
```

---

### Task 9: Expenses — single "+ Add Expense" drawer replacing 3 buttons

**Files:**
- Modify: `app/admin/expenses/expenses-client.tsx` — imports, `ClientExpenseModal`/`CommonExpenseModal`/`TravelTableModal` (strip their own overlay chrome), 3-button row → single button, modal rendering → `DrawerPanel` + `SegmentedControl`

**Interfaces:**
- Consumes: `SegmentedControl`, `DrawerPanel` from Tasks 2–3.
- Produces: renamed `ClientExpenseModalBody`, `CommonExpenseModalBody`, `TravelTableModalBody` (same props as before, minus the overlay) — used only within this file.

- [ ] **Step 1: Add imports**

Alongside the `GlassCard` import added in Task 8, add:

```tsx
import { SegmentedControl } from "@/components/ui/SegmentedControl"
import { DrawerPanel } from "@/components/ui/DrawerPanel"
```

- [ ] **Step 2: Strip the `Modal` wrapper from `ClientExpenseModal`, rename to `ClientExpenseModalBody`**

Find (currently ~lines 143 and 174–175 and 226–229):

```tsx
function ClientExpenseModal({ clients, selectedMonth, editing, onClose }: {
```

Replace with:

```tsx
function ClientExpenseModalBody({ clients, selectedMonth, editing, onClose }: {
```

Find:

```tsx
  return (
    <Modal title={editing ? "Edit Client Expense" : "Add Client Expense"} onClose={onClose}>
      <div className="space-y-4">
```

Replace with:

```tsx
  return (
      <div className="space-y-4">
```

Find the closing tags of this component (currently ~lines 225–229):

```tsx
        </button>
      </div>
    </Modal>
  )
}
```

Replace with (only for the `ClientExpenseModalBody` closing — the one immediately before the `// ── Common Expense Modal ──` comment):

```tsx
        </button>
      </div>
  )
}
```

- [ ] **Step 3: Strip the `Modal` wrapper from `CommonExpenseModal`, rename to `CommonExpenseModalBody`**

Find (currently ~line 233):

```tsx
function CommonExpenseModal({ selectedMonth, overheadDivisor, editing, onClose }: {
```

Replace with:

```tsx
function CommonExpenseModalBody({ selectedMonth, overheadDivisor, editing, onClose }: {
```

Find (currently ~lines 260–261):

```tsx
  return (
    <Modal title={editing ? "Edit Common Expense" : "Add Common Expense"} onClose={onClose}>
      <div className="space-y-4">
```

Replace with:

```tsx
  return (
      <div className="space-y-4">
```

Find the closing tags of this component (currently ~lines 298–302):

```tsx
        </button>
      </div>
    </Modal>
  )
}

// ── Travel Table Modal ────────────────────────────────────────────────────────
```

Replace with:

```tsx
        </button>
      </div>
  )
}

// ── Travel Table Modal ────────────────────────────────────────────────────────
```

Note: both bodies now receive an unused `onClose` parameter in most cases (it's still used for the auto-close-after-save-when-editing behavior via `setTimeout(onClose, 1400)` inside `save()` in both — leave that call as-is, it still works since the drawer's `onClose` will be threaded through).

- [ ] **Step 4: Strip the fixed-overlay wrapper from `TravelTableModal`, rename to `TravelTableModalBody`**

Find (currently ~line 306):

```tsx
function TravelTableModal({ shoots, savedTravel, onClose }: {
  shoots: ShootRow[]
  savedTravel: Record<string, number>
  onClose: () => void
}) {
```

Replace with:

```tsx
function TravelTableModalBody({ shoots, savedTravel }: {
  shoots: ShootRow[]
  savedTravel: Record<string, number>
}) {
```

Find this exact block (currently lines 334–341):

```tsx
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full md:max-w-3xl rounded-t-3xl md:rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh" }}>
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #F3F4F6" }}>
          <div>
            <h2 className="text-[15px] font-black" style={{ color: "#111111" }}>Travel Costs — Shoots</h2>
            {totalEntered > 0 && (
              <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
                Total entered: <strong style={{ color: "#3B82F6" }}>₹{Math.round(totalEntered).toLocaleString("en-IN")}</strong>
              </p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>
        {/* table */}
        <div className="overflow-y-auto flex-1">
```

Replace with:

```tsx
  return (
    <div>
      {totalEntered > 0 && (
        <p className="text-[12px] mb-3" style={{ color: "#6B7280" }}>
          Total entered: <strong style={{ color: "#3B82F6" }}>₹{Math.round(totalEntered).toLocaleString("en-IN")}</strong>
        </p>
      )}
      <div>
```

Find the closing tags of this component (currently lines 404–409):

```tsx
          )}
        </div>
      </div>
    </div>
  )
}
```

Replace with (the last `</div>` in this file closes the new outer `<div>` from Step 4's replacement above — same nesting depth as before, just without the fixed-overlay div and the removed inner header div):

```tsx
          )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Replace the 3-button action row with a single "+ Add Expense" button**

Find this exact block (currently lines 559–582):

```tsx
        {/* 3 Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { key: "travel", label: "ADD TRAVEL COST",     icon: <Car size={16} />,      color: "#3B82F6", shadow: "rgba(59,130,246,0.4)",   grad: "linear-gradient(135deg,#3B82F6,#1D4ED8)" },
            { key: "client", label: "ADD CLIENT EXPENSE",  icon: <Megaphone size={16} />, color: "#DE1A1A", shadow: "rgba(222,26,26,0.4)",    grad: "linear-gradient(135deg,#DE1A1A,#991111)" },
            { key: "common", label: "ADD COMMON EXPENSE",  icon: <Building2 size={16} />, color: "#8B5CF6", shadow: "rgba(139,92,246,0.4)",   grad: "linear-gradient(135deg,#8B5CF6,#6D28D9)" },
          ].map(b => (
            <button key={b.key} onClick={() => setModal(b.key as "travel" | "client" | "common")}
              className="flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl font-black text-[13px] tracking-widest text-white transition-all active:translate-y-[3px]"
              style={{
                background: b.grad,
                boxShadow: `0 6px 0 ${b.shadow}, 0 8px 20px ${b.shadow}`,
                letterSpacing: "0.08em",
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
              onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
              onMouseDown={e => (e.currentTarget.style.transform = "translateY(4px)")}
              onMouseUp={e => (e.currentTarget.style.transform = "translateY(-2px)")}
            >
              {b.icon}
              {b.label}
            </button>
          ))}
        </div>
```

Replace with:

```tsx
        {/* Single Add Expense trigger */}
        <button onClick={() => setModal("travel")}
          className="flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl font-black text-[13px] tracking-widest text-white transition-all"
          style={{
            background: "linear-gradient(135deg,#DE1A1A,#991111)",
            boxShadow: "0 6px 0 rgba(222,26,26,0.4), 0 8px 20px rgba(222,26,26,0.4)",
            letterSpacing: "0.08em",
            width: "100%",
          }}
        >
          <Plus size={16} />
          ADD EXPENSE
        </button>
```

- [ ] **Step 6: Replace the modal-rendering block at the bottom with the drawer**

Find this exact block (currently lines 774–793):

```tsx
      {/* Modals */}
      {modal === "travel" && (
        <TravelTableModal shoots={shootRows} savedTravel={savedTravel} onClose={() => setModal(null)} />
      )}
      {modal === "client" && (
        <ClientExpenseModal
          clients={clientNames}
          selectedMonth={selectedMonth}
          editing={editingClient ?? undefined}
          onClose={() => { setModal(null); setEditClient(null) }}
        />
      )}
      {modal === "common" && (
        <CommonExpenseModal
          selectedMonth={selectedMonth}
          overheadDivisor={overheadDivisor}
          editing={editingCommon ?? undefined}
          onClose={() => { setModal(null); setEditCommon(null) }}
        />
      )}
    </div>
  )
}
```

Replace with:

```tsx
      {/* Add Expense drawer */}
      <DrawerPanel
        open={modal !== null}
        onClose={() => { setModal(null); setEditClient(null); setEditCommon(null) }}
        widthClassName="w-full max-w-2xl"
        header={
          <SegmentedControl
            value={modal ?? "travel"}
            onChange={(v) => { setModal(v); setEditClient(null); setEditCommon(null) }}
            options={[
              { value: "travel", label: "Travel", icon: <Car size={13} /> },
              { value: "client", label: "Client", icon: <Megaphone size={13} /> },
              { value: "common", label: "Common", icon: <Building2 size={13} /> },
            ]}
          />
        }
      >
        {modal === "travel" && (
          <TravelTableModalBody shoots={shootRows} savedTravel={savedTravel} />
        )}
        {modal === "client" && (
          <ClientExpenseModalBody
            clients={clientNames}
            selectedMonth={selectedMonth}
            editing={editingClient ?? undefined}
            onClose={() => { setModal(null); setEditClient(null) }}
          />
        )}
        {modal === "common" && (
          <CommonExpenseModalBody
            selectedMonth={selectedMonth}
            overheadDivisor={overheadDivisor}
            editing={editingCommon ?? undefined}
            onClose={() => { setModal(null); setEditCommon(null) }}
          />
        )}
      </DrawerPanel>
    </div>
  )
}
```

Note: `widthClassName="w-full max-w-2xl"` (wider than the `DrawerPanel` default of `max-w-md`) is used above because the Travel tab's table has 7 columns and won't fit comfortably in a narrower drawer.

- [ ] **Step 7: Remove the now-unused `Modal` wrapper function**

Find (currently lines 116–139, the `Modal` function defined before `ClientExpenseModal`) and delete it entirely — it's no longer referenced anywhere in the file after Steps 2–4.

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: No errors. If TypeScript reports `Modal` or old component names (`ClientExpenseModal`, `CommonExpenseModal`, `TravelTableModal`) as still referenced, find and update those call sites to the renamed `*Body` versions.

- [ ] **Step 9: Manual visual check**

Run: `pnpm dev`, visit `/admin/expenses`. Click "ADD EXPENSE" — a glass drawer should slide in from the right with a Travel/Client/Common segmented control at top. Switch segments and confirm each form renders correctly (Travel's shoot table, Client's form with type picker, Common's form with per-client share preview). Fill in and save a test entry in each to confirm the existing save/refresh behavior still works. Click a pencil icon on an existing Client Direct or Common Shared row — drawer should open pre-selecting the matching segment with the row's data pre-filled.

- [ ] **Step 10: Commit**

```bash
git add app/admin/expenses/expenses-client.tsx
git commit -m "feat(admin/expenses): consolidate 3 add buttons into one segmented drawer"
```

---

### Task 10: Expenses — Cost Summary table → per-client card accordion (open by default)

**Files:**
- Modify: `app/admin/expenses/expenses-client.tsx:720-770` (Cost Summary table → accordion of glass cards)

**Interfaces:**
- Consumes: `GlassCard` from Task 1; `clientSummaryRows` (existing `useMemo`, unchanged).

- [ ] **Step 1: Add accordion open/close state**

Alongside `const [modal, setModal] = useState...`, add:

```tsx
  const [openSection, setOpenSection] = useState<"summary" | "direct" | "common" | null>("summary")
```

- [ ] **Step 2: Replace the Cost Summary table section with an accordion of per-client cards**

Find this exact block (currently lines 720–770, the entire "Per-Client Summary Table" `<div>` through its closing tag):

```tsx
        {/* Per-Client Summary Table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", border: "1px solid #F0F0F2", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <div className="flex items-center gap-2 px-6 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
            <IndianRupee size={15} style={{ color: "#DE1A1A" }} />
            <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#DE1A1A" }}>Client & Brand Cost Summary</span>
          </div>
          <div className="overflow-x-auto">
            <table style={{ minWidth: 500 }} className="w-full">
              <thead>
                <tr style={{ background: "#FAFAFA", borderBottom: "1px solid #F0F0F2" }}>
                  <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#9CA3AF" }}>Client / Brand</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#059669" }}>Employee Cost</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#6366F1" }}>Direct Exp</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#8B5CF6" }}>Common Share</th>
                  <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-wider whitespace-nowrap" style={{ color: "#DE1A1A" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {clientSummaryRows.map((row, i) => (
                  <tr key={row.name} style={{ borderBottom: i < clientSummaryRows.length - 1 ? "1px solid #F9FAFB" : "none" }}
                    className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3">
                      <span className="text-[13px] font-bold" style={{ color: "#111111" }}>{row.name}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: row.empCost > 0 ? "#059669" : "#6B7280" }}>
                      {row.empCost > 0 ? fmtRupee(row.empCost) : "₹0"}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: row.direct > 0 ? "#6366F1" : "#6B7280" }}>
                      {row.direct > 0 ? fmtRupee(row.direct) : "₹0"}
                    </td>
                    <td className="px-4 py-3 text-right text-[13px] font-semibold" style={{ color: "#8B5CF6" }}>
                      {fmtRupee(row.overhead)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <span className="text-[14px] font-black" style={{ color: "#DE1A1A" }}>{fmtRupee(row.total)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "#FAFAFA", borderTop: "2px solid #F0F0F2" }}>
                  <td className="px-6 py-3 text-[12px] font-black uppercase tracking-wider" style={{ color: "#374151" }}>TOTAL</td>
                  <td className="px-4 py-3 text-right text-[13px] font-black" style={{ color: "#059669" }}>{fmtRupee(clientSummaryRows.reduce((s, r) => s + r.empCost, 0))}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-black" style={{ color: "#6366F1" }}>{fmtRupee(totalClientDirect)}</td>
                  <td className="px-4 py-3 text-right text-[13px] font-black" style={{ color: "#8B5CF6" }}>{fmtRupee(totalCommon)}</td>
                  <td className="px-6 py-3 text-right text-[15px] font-black" style={{ color: "#DE1A1A" }}>{fmtRupee(clientSummaryRows.reduce((s, r) => s + r.total, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>
```

Replace with:

```tsx
        {/* Cost Summary — per-client cards, open by default */}
        <GlassCard>
          <button onClick={() => setOpenSection(s => s === "summary" ? null : "summary")}
            className="w-full flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2">
              <IndianRupee size={15} style={{ color: "#DE1A1A" }} />
              <span className="text-[13px] font-black uppercase tracking-wider" style={{ color: "#DE1A1A" }}>Client & Brand Cost Summary</span>
            </div>
            <span style={{ color: "#9CA3AF", transform: openSection === "summary" ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
          </button>
          {openSection === "summary" && (
            <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {clientSummaryRows.map(row => (
                <GlassCard key={row.name} className="p-4" style={{ background: "rgba(255,255,255,0.7)" }}>
                  <p className="text-[13px] font-bold mb-2" style={{ color: "#111111" }}>{row.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Employee</p>
                      <p className="text-[13px] font-black" style={{ color: row.empCost > 0 ? "#059669" : "#6B7280", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.empCost)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Direct</p>
                      <p className="text-[13px] font-black" style={{ color: row.direct > 0 ? "#6366F1" : "#6B7280", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.direct)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Common</p>
                      <p className="text-[13px] font-black" style={{ color: "#8B5CF6", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.overhead)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Total</p>
                      <p className="text-[15px] font-black" style={{ color: "#DE1A1A", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(row.total)}</p>
                    </div>
                  </div>
                </GlassCard>
              ))}
              <GlassCard className="p-4 sm:col-span-2" style={{ background: "rgba(255,255,255,0.85)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#374151" }}>Total — all clients</span>
                  <span className="text-[16px] font-black" style={{ color: "#DE1A1A", fontVariantNumeric: "tabular-nums" }}>{fmtRupee(clientSummaryRows.reduce((s, r) => s + r.total, 0))}</span>
                </div>
              </GlassCard>
            </div>
          )}
        </GlassCard>

      </div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: No new errors mentioning `expenses-client.tsx`.

- [ ] **Step 4: Manual visual check**

Run: `pnpm dev`, visit `/admin/expenses` at both desktop and mobile widths (e.g. browser devtools at 375px).
Expected: Cost Summary section is expanded by default, showing one card per client with a 2×2 metric grid — no table, no horizontal scroll, no truncated names at any width. Clicking the header collapses/expands it.

- [ ] **Step 5: Commit**

```bash
git add app/admin/expenses/expenses-client.tsx
git commit -m "feat(admin/expenses): convert Cost Summary table to per-client card accordion"
```

---

### Task 11: Expenses — Client Direct / Common Shared → collapsed-by-default accordions

**Files:**
- Modify: `app/admin/expenses/expenses-client.tsx:585-717` (the two-column "Expense Lists" grid → two accordion `GlassCard`s)

**Interfaces:**
- Consumes: `GlassCard` from Task 1; `openSection` state from Task 10.

- [ ] **Step 1: Wrap the "Client Direct" panel's existing content in an accordion header**

Find (currently ~line 588, the opening of the Client Direct panel):

```tsx
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", minHeight: "200px" }}>
            <div className="flex items-center justify-center gap-2.5 px-5 py-3" style={{ borderBottom: "1px solid #F0F0F2", background: "rgba(59,130,246,0.06)" }}>
              <Receipt size={14} style={{ color: "#3B82F6" }} />
              <h2 className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#111111" }}>Client Direct</h2>
            </div>
```

Replace with:

```tsx
          <GlassCard className="overflow-hidden flex flex-col">
            <button onClick={() => setOpenSection(s => s === "direct" ? null : "direct")}
              className="flex items-center justify-center gap-2.5 px-5 py-3 w-full relative">
              <Receipt size={14} style={{ color: "#3B82F6" }} />
              <h2 className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#111111" }}>Client Direct</h2>
              <span style={{ position: "absolute", right: 16, color: "#9CA3AF", transform: openSection === "direct" ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
            </button>
            {openSection === "direct" && (<>
```

- [ ] **Step 2: Close the new conditional + swap the outer `<div>` for `</GlassCard>` at the end of the Client Direct panel**

Find (currently ~lines 644–651, the Client Direct panel's closing total row + closing `</div>`):

```tsx
            {clientExpenses.length > 0 && (
              <div className="grid flex-shrink-0 px-4 py-3 mt-auto"
                style={{ gridTemplateColumns: "56px 28px 1fr 84px 48px", borderTop: "2px solid #F0F0F2", background: "#F8F9FB" }}>
                <div /><div /><div className="text-[11px] font-black text-right pr-2" style={{ color: "#9CA3AF", alignSelf: "center" }}>Total</div>
                <span className="text-[14px] font-black text-right" style={{ color: "#3B82F6", fontFamily: "var(--font-jakarta)" }}>{fmtRupee(totalClientDirect)}</span>
                <div />
              </div>
            )}
          </div>
```

Replace with:

```tsx
            {clientExpenses.length > 0 && (
              <div className="grid flex-shrink-0 px-4 py-3 mt-auto"
                style={{ gridTemplateColumns: "56px 28px 1fr 84px 48px", borderTop: "2px solid #F0F0F2", background: "#F8F9FB" }}>
                <div /><div /><div className="text-[11px] font-black text-right pr-2" style={{ color: "#9CA3AF", alignSelf: "center" }}>Total</div>
                <span className="text-[14px] font-black text-right" style={{ color: "#3B82F6", fontFamily: "var(--font-jakarta)" }}>{fmtRupee(totalClientDirect)}</span>
                <div />
              </div>
            )}
            </>)}
          </GlassCard>
```

- [ ] **Step 3: Repeat the same accordion wrap for the "Common / Shared" panel**

Find (currently ~lines 655–658):

```tsx
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", minHeight: "200px" }}>
            <div className="flex items-center justify-center gap-2.5 px-5 py-3" style={{ borderBottom: "1px solid #F0F0F2", background: "rgba(139,92,246,0.06)" }}>
              <Layers size={14} style={{ color: "#8B5CF6" }} />
              <h2 className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#111111" }}>Common / Shared</h2>
            </div>
```

Replace with:

```tsx
          <GlassCard className="overflow-hidden flex flex-col">
            <button onClick={() => setOpenSection(s => s === "common" ? null : "common")}
              className="flex items-center justify-center gap-2.5 px-5 py-3 w-full relative">
              <Layers size={14} style={{ color: "#8B5CF6" }} />
              <h2 className="text-[12px] font-black uppercase tracking-wider" style={{ color: "#111111" }}>Common / Shared</h2>
              <span style={{ position: "absolute", right: 16, color: "#9CA3AF", transform: openSection === "common" ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>▾</span>
            </button>
            {openSection === "common" && (<>
```

Find (currently ~lines 709–717, the Common Shared panel's closing total row + closing `</div>`):

```tsx
            {commonExpenses.length > 0 && (
              <div className="grid flex-shrink-0 px-4 py-3 mt-auto"
                style={{ gridTemplateColumns: "28px 1fr 84px 48px", borderTop: "2px solid #F0F0F2", background: "#F8F9FB" }}>
                <div /><div className="text-[11px] font-black text-right pr-2" style={{ color: "#9CA3AF", alignSelf: "center" }}>Total</div>
                <span className="text-[14px] font-black text-right" style={{ color: "#8B5CF6", fontFamily: "var(--font-jakarta)" }}>{fmtRupee(totalCommon)}</span>
                <div />
              </div>
            )}
          </div>
        </div>
```

Replace with:

```tsx
            {commonExpenses.length > 0 && (
              <div className="grid flex-shrink-0 px-4 py-3 mt-auto"
                style={{ gridTemplateColumns: "28px 1fr 84px 48px", borderTop: "2px solid #F0F0F2", background: "#F8F9FB" }}>
                <div /><div className="text-[11px] font-black text-right pr-2" style={{ color: "#9CA3AF", alignSelf: "center" }}>Total</div>
                <span className="text-[14px] font-black text-right" style={{ color: "#8B5CF6", fontFamily: "var(--font-jakarta)" }}>{fmtRupee(totalCommon)}</span>
                <div />
              </div>
            )}
            </>)}
          </GlassCard>
        </div>
```

- [ ] **Step 4: Initialize `openSection` correctly**

Since these two sections are collapsed by default and only "summary" (Task 10) starts open, no change is needed to the `useState("summary")` initializer from Task 10 — confirm it still reads `useState<"summary" | "direct" | "common" | null>("summary")`.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: No errors. Pay attention to matching `<GlassCard>`/`</GlassCard>` and `(<>`/`</>)` pairs — a common mistake here is a mismatched fragment closing tag.

- [ ] **Step 6: Manual visual check**

Run: `pnpm dev`, visit `/admin/expenses`.
Expected: Client Direct and Common Shared sections load collapsed (just their header row visible); clicking either expands it to show the existing row list and total; Cost Summary stays open by default as set up in Task 10. Add/edit/delete a row in each to confirm functionality is unchanged.

- [ ] **Step 7: Commit**

```bash
git add app/admin/expenses/expenses-client.tsx
git commit -m "feat(admin/expenses): collapse Client Direct & Common Shared into accordions"
```

---

### Task 12: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `pnpm typecheck`
Expected: No errors in any of the modified/created files (pre-existing `zod`/`@dnd-kit/core` errors in unrelated files are expected and not a regression).

- [ ] **Step 2: Full lint**

Run: `pnpm lint`
Expected: No new lint errors in the modified/created files. Fix any unused-import warnings left over from Tasks 5, 6, 8, 9 (e.g. if `IndianRupee`, `Sparkles`, `Users`, `Briefcase`, or `FileText` ended up unused after the hero/summary replacements).

- [ ] **Step 3: Manual end-to-end walkthrough**

Run: `pnpm dev`.
- Visit `/admin/expenses`: confirm gradient background, glass summary strip with donut, single "ADD EXPENSE" button opens the drawer, all 3 segments work and save correctly, Cost Summary/Client Direct/Common Shared accordions expand/collapse and show correct data, test at a mobile viewport width (375px) to confirm no truncation/horizontal scroll anywhere.
- Visit `/admin/freelancers`: confirm the hero now matches `/member/freelancers`'s visual style with admin-appropriate combined numbers, team-filter pills work, Login Members section still functions (click into a login member, confirm `FlMediaClient` still renders correctly).
- Visit `/member/freelancers`: confirm hero renders unchanged in substance (same layout, slightly glassier pills).

- [ ] **Step 4: Final commit (if any lint fixes were needed)**

```bash
git add -A
git commit -m "chore: fix lint warnings from admin redesign"
```
