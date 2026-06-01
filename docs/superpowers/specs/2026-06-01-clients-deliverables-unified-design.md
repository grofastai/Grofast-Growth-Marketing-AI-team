# Clients & Deliverables Unified Page

**Date:** 2026-06-01  
**Status:** Approved  
**Route:** `/admin/clients`

---

## Overview

Replace the separate Clients page and client-analytics portions of the Expenses page with a single unified page. When an admin selects a client, the right panel shows the client's package details alongside a full deliverables breakdown (videos, posters, shoots, voice overs) with production costs, filterable by month or specific day.

---

## URL Pattern

```
/admin/clients
/admin/clients?client=Aasfie+Briyani
/admin/clients?client=Aasfie+Briyani&mode=month&period=2026-05
/admin/clients?client=Aasfie+Briyani&mode=day&period=2026-05-23
```

Search params:
- `client` — URL-encoded client name (matches `clients.name` and `work_entries.client_name`)
- `mode` — `"month"` (default) or `"day"`
- `period` — `"YYYY-MM"` for month mode, `"YYYY-MM-DD"` for day mode; defaults to current month

---

## Page Layout

```
┌────────────────────────────────────────────────────────────────┐
│  HEADER: "Clients & Deliverables"  [Active · Past toggle]      │
├──────────────────┬─────────────────────────────────────────────┤
│  LEFT PANEL      │  RIGHT PANEL (scrollable)                   │
│  300px fixed     │                                             │
│                  │  [No client selected]                       │
│  Search box      │  → "Select a client from the left"          │
│                  │                                             │
│  Client cards:   │  [Client selected]                          │
│  • Avatar        │  → Client header strip                      │
│  • Name          │  → Month / Day toggle + date picker         │
│  • Industry      │  → 5 stat chips                             │
│  • Package tag   │  → Deliverables breakdown table             │
│  • Status dot    │  → Team contribution table                  │
│                  │  → Day-by-day work log                      │
└──────────────────┴─────────────────────────────────────────────┘
```

---

## Left Panel — Client List

- Fetched from Supabase `clients` table (admin sees both active and past via toggle)
- Search filters by name, industry, location in real time (client-side, no network call)
- Clicking a client calls `router.push` updating `client=` param; resets `period` to current month, `mode` to `month`
- Selected client card has red left-border highlight (matches existing design system)

---

## Right Panel — Client Header Strip

Shows data from the `clients` row (Supabase / Google Sheets sync):
- Large avatar initials, client name, active/past badge
- Package name, services, industry, location, joined month

---

## Right Panel — Date Filter Bar

Two-segment toggle: **Month** | **Day**

- **Month mode:** `<input type="month">` — defaults to current month (`YYYY-MM`). On change → `router.push` with `mode=month&period=YYYY-MM`.
- **Day mode:** `<input type="date">` — defaults to today. On change → `router.push` with `mode=day&period=YYYY-MM-DD`.

Server computes `dateFrom` and `dateTo` from the params:
- Month mode: `dateFrom = YYYY-MM-01`, `dateTo = YYYY-MM-{lastDay}`
- Day mode: `dateFrom = dateTo = YYYY-MM-DD`

---

## Right Panel — Stat Chips (5 chips)

| Chip | Value |
|---|---|
| Videos Edited | Total count of all `editing_videos` entries for this client in range |
| Shoot Sessions | Count of `task_type = "shoot"` entries |
| Shoot Hours | Sum of `duration_hours` where `task_type = "shoot"` |
| Posters | Count of `editing_videos` where `video_type` matches "poster" (case-insensitive) |
| Total Cost ₹ | Sum of all production costs (see cost model below) |

---

## Right Panel — Deliverables Breakdown Table

Grouped by work category, computed server-side:

### Shoots
| Column | Value |
|---|---|
| Sessions | count of shoot work_entries |
| Hours | total duration_hours |
| Cost | hours × employee ₹/hr |

### Edited Videos (grouped by video_type)
One row per distinct video_type (Reel, Short, Long Form, Story, Ad, Poster, Voice Over, etc.):

| Column | Value |
|---|---|
| Type | video_type label + emoji |
| Count | number of videos of this type |
| Avg Time | average time_taken across videos |
| Cost | sum of `calcVideoCost()` for each video |

### Other Work
| Column | Value |
|---|---|
| Title | entry title |
| Hours | duration_hours |
| Cost | hours × employee ₹/hr |

**Total row** at bottom: sum of all costs across all sections.

---

## Right Panel — Team Contribution Table

One row per employee who worked on this client in the selected period:

| Column | Value |
|---|---|
| Member | avatar + name + employee ID |
| Videos | count of editing_videos they edited |
| Shoot Hours | their shoot duration_hours |
| Total Hours | all hours combined |
| Cost | their hours × their ₹/hr |

---

## Right Panel — Day-by-Day Work Log

Chronological list (newest first) of daily_update entries for this client in the selected period. Each row:
- Date, member name, task type badge (Shoot / Edit / Other), item count or hours, cost

Only shown when there is data. Hidden entirely when date range has no entries.

---

## Cost Model

Identical to existing `calcVideoCost()` in `expenses-client.tsx`:

```
Shoot cost    = duration_hours × employee_hourly_rate
Edit cost     = pricing_rate[video_type] + (time_taken × employee_hourly_rate)
Other cost    = duration_hours × employee_hourly_rate
```

Where `employee_hourly_rate = monthly_salary / 25 / 9` if salary set, else `hourly_rate`.

Pricing rates loaded from `pricing_rates` table. If no rate set for a video_type, that component is ₹0.

---

## Data Sources

| Data | Table / Source |
|---|---|
| Client list | `clients` table (Supabase, synced from Google Sheets) |
| Client details | `clients` table + Google Sheets fields |
| Work entries | `daily_updates.work_entries` (JSONB) filtered by `client_name` + date range |
| Pricing rates | `pricing_rates` table |
| Employee rates | `users.hourly_rate` / `users.monthly_salary` |

---

## Files Changed

| File | Action |
|---|---|
| `app/admin/clients/page.tsx` | Full rewrite — reads searchParams, fetches all data, computes breakdown server-side |
| `app/admin/clients/clients-unified-client.tsx` | New — left panel + right panel client component |
| `app/admin/clients/clients-sheet-view.tsx` | Deleted |
| `app/admin/clients/[id]/page.tsx` | Deleted |
| `app/admin/clients/[id]/project-detail-client.tsx` | Deleted |
| `app/admin/expenses/expenses-client.tsx` | Remove tabs: "Client Analytics", "Profitability", "Per Client Cost"; keep "Expense Claims" and "Team Costing" |

---

## Edge Cases

- **No work entries for selected period:** Right panel shows stat chips all at zero, breakdown sections are empty with a "No work logged for this period" message.
- **Client name mismatch:** `work_entries.client_name` is a free-text field. Matching is case-insensitive exact match on the selected client's `name`. Members must type the client name correctly in daily updates.
- **No pricing rates set:** Video cost shows ₹0 for the type component; labor cost still shows if hourly rate is set.
- **Past client selected:** Works identically — date filter just picks a historical period.
- **Google Sheets not configured:** Falls back to Supabase `clients` table only (existing fallback logic retained).
