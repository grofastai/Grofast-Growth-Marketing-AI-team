# GroFast Team Tracking — Project Notes

This file exists so that anyone on the team, on any laptop, can open the project and immediately understand what's going on — no need to ask Claude or dig through chat history. It's committed to GitHub like the code, so it travels with the repo everywhere.

**How this file stays useful:** every time a real feature is added, a real bug is fixed, or an important decision is made, this file gets updated and pushed along with the code change. Read it before starting new work on this project, especially if you're on a laptop that hasn't touched it recently.

---

## Who's who / how the team works

- **Founder/owner** uses this app for their own company's team tracking. Non-technical, but very clear about what's needed.
- **3 laptops, all pushing to the same GitHub repo, all on `master`** — meaning multiple people (or multiple Claude sessions) can push at the same time. This causes frequent "someone else pushed while I was working" situations — always `git fetch` + check `git log HEAD..origin/master` before pushing, and merge cleanly if needed.
- **Sister manages some Supabase DB work** manually via the Supabase Dashboard SQL Editor for certain migrations.
- Claude has **full direct access to the Supabase database** (via MCP tools and the REST API) — never needs to ask the user to run SQL or touch the Supabase dashboard manually.
- **Before every push to master:** check Vercel isn't currently Building/Queued for another commit — pushing on top of an in-progress build causes broken/stacked deploys.

---

## Core business rules (don't re-derive these, they're settled)

### Login Hours vs Working Hours — these are NOT the same thing
- **Login Hours** = raw clock-in → clock-out span, no deductions. From `attendance_logs`.
- **Working Hours** = always computed from the actual logged work entries (`work_entries` / History), NEVER from the clock span. Someone can be clocked in without doing real work — the clock span alone doesn't prove work happened.
- The single source of truth for this formula is `calcNetWorkHours()` in `lib/utils/work-hours.ts`. Every page (Dashboard, Attendance, History, Insights, Payroll) must use this same function — never re-derive the formula locally, that's how a real bug shipped once (stored `working_hours` was inflated for some employees; fixed 2026-06-20).
- For Media team, travel time to a shoot is added on top via `_travel_hours` on the shoot entry — it counts as working time.

### `task_type` naming — a deliberate quirk, don't "fix" it
- `'other'` (old name) = **Technical** work, shown as "Technical" in the UI. Used by most non-media employees for their basic daily work log.
- `'other_activity'` (added later) = **Meetings/Teaching/misc**, shown as "Other" in the UI. Lives under the Learning tab.
- These look confusingly similar in the database but are genuinely different things. The user explicitly decided **not** to rename `'other'` to `'technical'` in the database (too risky against real historical data, and no user ever sees the raw DB value anyway). Leave it as-is.

### Pay/salary rules
- **Only Full Time employees** have `hourly_rate` or `monthly_salary` set on their user row.
- **Every freelancer team — including the ones with app login (Freelance Media Production)** — gets paid per individual piece of work (per edit, per shoot, per poster), entered by the admin in the Freelancers tab, stored in `freelancer_work_entries_v2`. Never set an hourly rate for a freelancer — it causes double-counting.

### Freelancer teams
- 9 freelancer team types exist. Only **Freelance Media Production** currently has real app login (submits Daily Updates like a full-time employee, just paid per-piece instead of hourly). The other 8 are "no-login" — a manager enters their work on their behalf.

---

## Recently fixed / built (most recent first)

**Attendance login/logout gating (2026-07-13)** — real incident: an employee forgot to log out Saturday, had approved leave Sunday, and was still able to log in fresh Monday with zero warning. Root cause: every "did you forget to log out / submit yesterday's update" check in the code only ever looked at the single day right before today — an approved leave sitting in that one slot made the check give up and never look further back. Separately, the warning screens that did exist were purely visual and never actually reached the Login button's own code. Fixed by:
- One shared function (`findLastWorkingDayIssues` in `lib/actions/attendance.ts`) that walks backward past leave/holiday days to find the real last working day, replacing three separate duplicate implementations.
- The Login button itself now hard-refuses (server-side) if the last real working day has an unfinished session or a missing update — not just a screen sitting near the button.
- A Full Day Leave now blocks submitting a Daily Update for that date whether it's today or a past date (previously only blocked today).
- Added sanity zones on logout: 12–18 hour gap on the same day asks "is that correct?" before accepting; over 18 hours is treated as definitely forgotten and requires a manual time correction (real work days here never exceed ~17.5 hours, even the longest shoot days).

**History now surfaces days with attendance but no submitted update** (2026-07-13) — previously invisible; now shows a distinct "Not Submitted" card so it's not silently lost.

**Admin Activities drawer redesigned to match Member History** (2026-07-13) — entry cards are now visually identical to how a member sees their own History (same icons, colors, layout), read-only (no edit/delete, since it's an admin viewing someone else's data), sorted by actual clock time instead of raw database order.

**Date pickers bounded to real company data range (2026-07-12)** — every date input across the app was allowing selection back to the 1900s (no `min` set). Fixed app-wide: past-work fields floor at 2025-01-01 (company start) and cap at today; future-facing fields (task/goal due dates) floor at today. Date of Birth and Work-Joined-Date are correctly left unrestricted.

**WFH → Leave day-swap capability (2026-07-12)** — an employee with an approved multi-day WFH couldn't previously cancel just one day of it to apply for a real Leave instead. Added `withdrawWfhForDate()` — removes a single day from anywhere in a WFH range (start, middle, or end), splitting into two WFH requests if needed, keeping the rest intact.

**Per-person non-media work-block checklist** — admin can control which Daily Update entry sections (Technical, Editing, Posters, Voiceover, Development, Scripting) a specific non-media employee sees, via a checklist on their team-member profile. `enabled_blocks IS NULL` = everything enabled (default/back-compat safe).

**Daily Update duplicate-submission bug (fixed)** — resubmitting a past-date update used to blindly append entries instead of deduping by ID, causing real duplicate work-entry data for at least one employee. Fixed to always dedupe by ID regardless of whether the date is today or in the past.

---

## Known, deliberately-left-alone items (don't re-flag these)

- **Learning hours inconsistency**: History and Admin Insights' Attendance Performance table show Learning Hours as a separate number from Working Hours; Dashboard/Payroll/Weekly Report/Attendance merge Learning into the main Working Hours total. This is pre-existing and the user confirmed it's fine as-is — not a bug to fix.
- **Company-wide holiday feature**: fully implemented and live (admin adds date+name on the Leaves page, shows across History/Attendance/the attendance-gating logic) — an old memory entry calling this "pending" is stale, ignore it.

## Still pending / not yet built

- **Overlap warning** when logging a new work entry whose time range overlaps an existing entry the same day (currently silently double-counts hours if it happens).
- **New full-time team names** — Sales & Business Development, Finance & HR, Leadership Team — discussed but not yet added to the database or code.
- **Login data-entry experience** for the "Video Editing" and "Videography" freelancer teams as actual login teams (currently they're no-login, manager-entered only, despite being originally planned as login teams).
