# Admin Expenses & Freelancers — Full UI Redesign

**Date:** 2026-07-05
**Scope:** UI/visual and structural redesign only. No changes to server actions, data fetching, database schema, or business logic anywhere in this spec — every change is confined to client components (`'use client'` files) and new presentational components.

## Background

Two admin pages were flagged for a full redesign, purely on the UI side:

1. **`app/admin/expenses/expenses-client.tsx`** — functional but visually dated: 4 flat stat cards, 3 separate colored "Add" buttons, two always-expanded list sections, and a 5-column table (Cost Summary) that truncated/wrapped badly on mobile (already patched once for wrapping, but the underlying table-on-mobile problem remained).
2. **Freelancers** — Member's page (`app/member/freelancers/freelancers-member-client.tsx`) already got a polished hero banner (illustration + metric pills) in a recent redesign. Admin's page (`app/admin/freelancers/admin-freelancers-tabs.tsx`) wraps the same underlying component for the detail view but has its own plain, smaller hero (no illustration, no metric pills) and a hand-rolled sidebar list — the two pages look unrelated despite sharing most of their logic.

The user wants both taken to a genuinely distinctive, "designed by an experienced product designer" level — not just a tidy-up of the existing layout — while keeping everything else (data, actions, routes) untouched.

## Design language: "Glass & Gradient"

Chosen from three full-fidelity style directions (Executive Bento / Glass & Gradient / Editorial Data Story) presented via visual mockups. Concrete recipe, shared across both pages via one new component so it isn't hand-rolled per file:

**New shared component: `components/ui/GlassCard.tsx`**
- Surface: `background: rgba(255,255,255,0.55)`, `backdrop-filter: blur(14px)`, `border: 1px solid rgba(255,255,255,0.8)`, `border-radius: 20–22px`, `box-shadow: 0 8px 32px rgba(31,38,135,0.08)`
- Hover state: slight `translateY(-2px)` + deepened shadow (only where the card is interactive/clickable)
- Accepts `className`/`style` passthrough so callers can adjust padding/layout per use site

**Page canvas:** soft radial-gradient mesh background (faint red wash top-left, faint blue/purple wash bottom-right, off-white base) replacing the current flat `#F8F9FB`/`#F5F6FA` on both redesigned pages. Not applied app-wide — scoped to these two pages' root containers only.

**Segmented control** (new shared piece, `components/ui/SegmentedControl.tsx`): pill-shaped track (`rgba(0,0,0,0.04)`), animated frosted "thumb" slides behind the active option on a `transform` transition. Used for the Expenses add-drawer's Travel/Client/Common toggle. Generic enough to reuse elsewhere later, but only wired into Expenses in this pass.

**Typography:** Jakarta stays for headings/large numbers (unchanged app-wide font). All money figures get `font-variant-numeric: tabular-nums` so digit columns align. Category accent colors are carried over unchanged from the current pages (blue `#3B82F6` = client direct, purple `#8B5CF6` = common/overhead, green `#059669`/`#10B981` = employee/positive, red `#DE1A1A` = brand/total) — no new color meanings introduced.

**Motion:** glass-card hover lift, accordion expand/collapse via height transition, segmented-control thumb slide, drawer slide-in from the right (existing modal/drawer patterns in the codebase use similar transitions — follow that precedent, no new animation library).

## Page 1: Expenses (`app/admin/expenses/expenses-client.tsx`)

### Layout, top to bottom
1. **Hero** — existing `PageHero` component, unchanged (already shared across admin pages).
2. **Summary strip** — one `GlassCard` containing: big total (₹ this month, tabular-nums), a donut chart (category split: Client Direct / Common Shared / Per-Client Overhead — CSS `conic-gradient`, no new charting library), and small pill chips restating each category's amount/color.
3. **"+ Add Expense"** — single button (replacing the current 3 separate "ADD TRAVEL COST / ADD CLIENT EXPENSE / ADD COMMON EXPENSE" buttons) that opens a right-side slide-over drawer.
   - Drawer header: `SegmentedControl` with 3 options — Travel / Client / Common.
   - Selecting a segment swaps the drawer body to that flow's existing form:
     - **Travel** → existing `TravelTableModal` content (shoot rows + saved travel), relocated into the drawer.
     - **Client** → existing "Add Client Expense" form (`ClientExpenseModal` or equivalent), including its own internal expense-type picker — unchanged.
     - **Common** → existing "Add Common Expense" form — unchanged.
   - Editing an existing row (pencil icon on Client Direct / Common Shared rows) still opens this same drawer pre-populated, pre-selecting the matching segment.
4. **Three accordions**, each a `GlassCard` with a clickable header (chevron rotates on expand/collapse):
   - **Cost Summary** — **open by default**. Replaces the current 5-column table with **one glass card per client/brand**, each showing a 2×2 grid (Employee Cost, Direct Exp, Common Share, Total) plus the client name as the card header. This is the fix for the mobile truncation/wrapping problem — no table, no horizontal scroll, nothing to truncate.
   - **Client Direct** — collapsed by default. Same row content/fields as today (date, client, type badge, amount, edit/delete), each row a `GlassCard`.
   - **Common Shared** — collapsed by default. Same as today (name, notes, per-client share, amount, edit/delete), each row a `GlassCard`.
5. Empty states, monthly nav (‹ Jul 2026 ›), and all totals/footers behave exactly as today — only the container styling changes.

### Explicitly not changing
- `client-expenses` / `common-expenses` server actions and their signatures
- The shoot-cost / travel-cost calculation logic inside `TravelTableModal`
- Validation rules in any of the three forms
- The underlying `clientSummaryRows` computation (still the same `useMemo`, just rendered as cards instead of `<table>`)

## Page 2: Freelancers (Admin) — shared hero + list

### New shared component: `components/freelancers/FreelancersHero.tsx`
Extracted from the hero JSX currently inline in `freelancers-member-client.tsx` (badge, title, subtitle, illustration, metric-pill row — the design already built for Member). Props: `title`, `subtitle`, `badgeLabel`, `illustrationSrc`, `metrics: { label, value, color }[]`. Pills restyled to the glass-chip treatment (frosted, subtle border) for visual consistency with Expenses.

- `freelancers-member-client.tsx`: renders `<FreelancersHero>` in place of its current inline hero markup (`!isEmbedded` branch) — same visual result as today, just sourced from the shared component.
- `admin-freelancers-tabs.tsx`: renders the **same** `<FreelancersHero>` (replacing its current small plain hero), fed admin's combined stats — total members (Login Members + Freelancers), total work entries, combined paid/unpaid — with an "Admin Dashboard" badge instead of Member's badge text.

### Sidebar list (both admin and member)
- Row styling unified: avatar circle, name, sparkline, team-color accent — matching Member's existing `FreelancerListItem` visual language. Admin's "Login Members" rows get the same visual treatment (avatar/name/total layout) as regular freelancer rows, keeping their distinct "LOGIN" badge.
- Selected/hover state: soft glass tint in the team's accent color (replacing the current flat `background: color+"12"` fills) with the same hover-lift used elsewhere.
- **New:** Admin's sidebar gains the same colored per-team filter-pill row (RJ/Graphics/Content/etc., emoji + color) that Member's list already has, glass-chip styled, positioned above the existing "All Members" / "Login Members" / "Freelancers" grouping — added, not replacing, the existing grouping.

### Explicitly not changing
- Master-detail selection logic, mobile back-button behavior, `FlMediaClient` (price-entry table for Login Members) internals
- Any Supabase queries, props passed from `page.tsx`, or the `isEmbedded`/`hideLeftPanel` plumbing between admin and member

## Out of scope
- Any other admin or member page (this redesign is scoped to exactly these two)
- New charting library (donut is a CSS `conic-gradient`, no Chart.js/Recharts addition)
- Any change to the `GlassCard`/`SegmentedControl` components' use elsewhere — they're introduced here but not retrofitted onto other pages in this pass

## Verification plan
Since this is UI-only with no automated UI test suite in this codebase, verification is manual: run the dev server, visit `/admin/expenses` and `/admin/freelancers`, exercise the add-drawer (all 3 segments), expand/collapse all 3 accordions, confirm the Cost Summary cards render correctly for several clients (including the mobile viewport width where the old table used to wrap/truncate), and confirm both Freelancers hero banners (admin + member) render from the same shared component with correct stats. `pnpm typecheck` after implementation to catch any prop-typing issues from the new shared components.

## Revision (same day): "Glass & Gradient" replaced with "Flat & Bordered"

After implementation, the user reviewed the live result and rejected the glass look as "too common" — glassmorphism has become the default look for premium-feeling SaaS templates, so it read as safe rather than distinctive. Two more rounds of visual options (a bolder Neo-Brutalist/Editorial/Duotone set, then a direct translation of a purple fintech-app reference the user shared) were also rejected before converging on specifics through direct questions.

**Final direction — flat, bordered, no shadow:**
- `components/ui/GlassCard.tsx` renamed to `components/ui/FlatCard.tsx`: solid `#FFFFFF` background, plain `1px solid #EDEDED` border, `border-radius: 16px`, **no box-shadow, no backdrop-filter**. Hover state (where used) changes border color to `#DE1A1A` instead of lifting/shadowing.
- `SegmentedControl`: track and thumb both flat (`#F5F5F5`/`#FFFFFF` with `1px solid #EDEDED` borders), no blur, no shadow on the thumb.
- `DrawerPanel`: solid white panel, `1px solid #EDEDED` left border, no backdrop blur, no box-shadow.
- `FreelancersHero` metric pills: flat semi-opaque white fill (`rgba(255,255,255,0.1)`) with a plain border, no backdrop-filter — since these pills sit on the red gradient hero rather than a white canvas, they keep translucency for legibility but drop the blur.
- Admin Freelancers sidebar: dropped the `backdropFilter: blur(6px)` on the team-filter "all" pill and the selected-row highlight, added plain borders instead.
- **Chart:** the CSS `conic-gradient` donut is replaced with a real cumulative line/area chart — daily running total of `client_expenses` for the selected month (data already fetched, no new query). `common_expenses` only has a month-level date, not a day, so it isn't part of this per-day trend and stays in the flat category chips above the chart instead.

Everything else from the original spec (per-client cards replacing the Cost Summary table, single Add Expense drawer, shared `FreelancersHero`, sidebar restyle, team-filter pills) is unchanged in structure — only the visual surface treatment changed.
