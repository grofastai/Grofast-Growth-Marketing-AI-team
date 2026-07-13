# Ads Tracker — Performance Metrics Log (Phase 1) — Design Spec

**Date:** 2026-07-13
**Status:** Approved for planning
**Author:** Sajee + Claude

## Summary

Add manual performance-metrics logging to the Content & Ads Tracker's **Ads Tracker**
tab, plus a search box and status filter chips. This is **Phase 1** of a larger vision
(see Roadmap below) — a full Meta-Ads-Manager-style rebuild with campaign/ad-set/creative
structure, a lead CRM, alerts, AI recommendations, PDF client reports, and a cross-tab
dashboard. Phase 1 builds only the performance-log foundation; the rest is deliberately
out of scope for this spec.

## Motivation

The user wants to know, per ad, "how is this actually performing, and if it's lagging,
why" — not just the current hook/targeting log (which tracks creative iteration, not
results). The Meta Ads MCP connector is currently disconnected, so live API pull isn't
buildable today; manual entry is the only viable path, with the schema designed so a
future automated pull could write into the same table without a UI change.

## Roadmap (context — not this spec)

| Phase | What | Depends on |
|---|---|---|
| **1 (this spec)** | Performance metrics log + search + status filters | — |
| 2 | Alerts + Daily Performance strip + AI Recommendation card | Phase 1 data |
| 3 | Lead Tracking (mini CRM: name/phone/source/assigned/status pipeline) | independent |
| 4 | Client Report (PDF), Top Performing Ads, Team Activity trail | Phase 1 data |
| 5 | Structured Campaign/Ad Set/Creative fields + cross-tab Overall Dashboard | biggest rework |

Phases 2-5 are not designed here. Three things flagged for whoever designs Phase 2:
**Ad rejected**, **Pixel disconnected**, and **Frequency-as-a-live-alert** need the live
Meta Ads API (not available today) — without it those become manual toggles, a materially
weaker feature than "automatically detected."

## Non-Goals (for this spec)

- No live Meta Ads API pull (connector disconnected).
- No campaign/ad-set/creative structured fields (Phase 5).
- No lead CRM (Phase 3).
- No alerts, AI recommendations, or PDF export (Phases 2 & 4).
- No configurable underperforming threshold — fixed at CTR < 1% for v1.

## Data Model

New table `ad_performance_entries`, mirroring the existing `ad_revisions` history-log
pattern (append-only, one row per check-in) rather than a single overwritten snapshot —
so trends and "week 1 vs week 3" client comparisons are possible later (Phase 4).

```sql
create table if not exists ad_performance_entries (
  id uuid primary key default gen_random_uuid(),
  ad_id uuid not null references ads_tracker(id) on delete cascade,
  company_id uuid not null,
  entry_date date not null default current_date,
  spend numeric not null,
  impressions integer not null,
  reach integer not null,
  clicks integer not null,
  ctr numeric not null,       -- percentage, e.g. 1.20
  results integer not null,   -- generic: leads/messages/purchases, matches the ad's objective
  note text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ad_performance_entries_ad_idx on ad_performance_entries(ad_id);
create index if not exists ad_performance_entries_company_idx on ad_performance_entries(company_id);

alter table ad_performance_entries enable row level security;

create policy "tenant_all" on ad_performance_entries
  for all using (company_id = (auth.jwt() ->> 'company_id')::uuid)
  with check (company_id = (auth.jwt() ->> 'company_id')::uuid);

create policy "service_all" on ad_performance_entries for all using (true) with check (true);
```

All 6 numeric fields are **required** per entry (Spend, Impressions, Reach, Clicks, CTR%,
Results) — partial entries would complicate the flag/derived-metric logic for little
benefit, and the whole point is a consistent trend line.

### Derived metrics (computed at render, never stored)

| Metric | Formula | Shown as "—" when |
|---|---|---|
| CPC | spend ÷ clicks | clicks = 0 |
| CPM | spend ÷ impressions × 1000 | impressions = 0 |
| Frequency | impressions ÷ reach | reach = 0 |
| Cost-per-Result | spend ÷ results | results = 0 |

### Underperforming flag

Computed from the **latest** entry only (not an average): if `ctr < 1.0`, the ad is
"Underperforming." An ad with **zero** entries shows a neutral "No performance logged"
hint and is never flagged — being new isn't the same as lagging. Threshold (1%) is a
fixed constant for v1, not a settings field (per user decision — ship faster, revisit if
it proves wrong for a client's industry).

## UI

### Toolbar (Ads Tracker tab)

- **Search box** — filters by ad name / client name, same pattern as the Posting Log
  tab's existing search.
- **Status filter chips** — Active / Testing / Paused / Stopped, tap-to-filter like the
  Pipeline tab's status chips.
- Combines (AND) with the client filter dropdown already shipped.

### Collapsed ad card

Gains a compact metrics row showing the **latest** entry, e.g.:
`₹5,200 spent · 2.3K reach · 0.8% CTR · 12 results`
— or **"No performance logged"** if the ad has zero entries.

When the Underperforming flag is set, a red **"⚠ Underperforming"** badge appears next to
the existing status badge.

### Expanded ad card

New **Performance** section, parallel to the existing **Correction History** section:

- **Log Performance** button opens a modal with the 6 required fields + optional note +
  date (defaults to today).
- Below it, a history list of past entries (newest first), each row showing the 6 raw
  values plus the 4 derived metrics inline, and the note if present.

### New/Edit Ad modals

No changes — performance entries are logged separately after an ad exists, not at
creation time.

## Testing / Verification

- `pnpm typecheck` and `pnpm lint` clean.
- Manual verification: open Ads Tracker tab, confirm:
  - Search box filters by ad/client name.
  - Status chips filter and combine correctly with the client dropdown.
  - Logging a performance entry with CTR ≥ 1% shows no badge; CTR < 1% shows the red
    Underperforming badge.
  - An ad with no entries shows "No performance logged," not a badge.
  - Derived metrics (CPC/CPM/Frequency/Cost-per-Result) compute correctly and show "—"
    on zero-denominator cases.
  - History list orders newest-first and persists on reload.
  - Mobile: card layout doesn't overlap text with the new metrics row/badge at 360px.

## Risks / Trade-offs

- **Manual entry is real ongoing work** — 6 numbers typed in by hand per check-in, per
  ad. If this proves too tedious in practice, that's the strongest signal to prioritize
  reconnecting the Meta Ads API for Phase 2+ rather than expanding manual fields further.
- **Fixed 1% CTR threshold** may not fit every client/industry. Flagged as a known
  limitation, not a bug — deliberately deferred rather than building settings UI for v1.
- **This is Phase 1 of 5.** Scope discipline matters: do not fold Phase 2-5 features into
  this implementation opportunistically "since we're in the file already."
