# GroFast Team Tracking — Project Notes

This file exists so that anyone on the team, on any laptop, can open the project and immediately understand what's going on — no need to ask Claude or dig through chat history. It's committed to GitHub like the code, so it travels with the repo everywhere.

**How this file stays useful:** every time a real feature is added, a real bug is fixed, or an important decision is made, this file gets updated and pushed along with the code change. Read it before starting new work on this project, especially if you're on a laptop that hasn't touched it recently.

**Standing rule for any fix — keep everything in sync:** before calling a fix done, check whether the same logic, display, or data is duplicated somewhere else in the codebase and needs the identical update. This project has already shipped bugs from exactly this gap — e.g. three separate places independently re-implemented the same "check yesterday's attendance" logic and drifted out of sync with each other (see the Attendance login/logout gating entry below). Don't just patch the one spot that was reported; find the siblings too.

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

**The "who's tagged today" list on a daily_updates row only ever grew, never shrank (2026-07-20)** — found while verifying that editing a past entry correctly saves. Removing a collaborator's tag from every entry on a day correctly deleted their `collaboration_confirmations` row (cost was never affected), but the row-level `daily_updates.participant_ids` column — what History's "am I tagged today" query actually filters on — was rebuilt in 3 places (`submitDailyUpdate`, `updatePastDailyUpdate`, `addEntryToDate` in `lib/actions/daily-updates.ts`) as a union of the old column value plus whoever's currently tagged. A union can only grow, so a removed name stayed in that column forever, and that day kept wrongly showing as "collaborated" for that person — this is the actual root cause behind the two cases fixed earlier tonight (Arvi mess, the Jul 13 Meeting); those were symptom-only display fixes, this stops new ones from being created. All 3 places now rebuild the column from scratch off the actual final entry set each time, instead of unioning with what was there before.

**Collaboration tags on management team auto-confirm now; everyone can Edit Time after confirming, not just before (2026-07-20)** — management (`is_management=true`: Sanjay SK, Karthikeyan S) never submits their own daily update, so a tag on them sat "pending" until someone remembered to confirm on their behalf — meanwhile their real contributed hours counted for nothing anywhere until that happened. Tagging a management member now inserts the `collaboration_confirmations` row already `status='confirmed'` (original time copied straight into confirmed_start/end/hours), flagged via a new `auto_confirmed` column — `lib/actions/daily-updates.ts`'s `syncCollaborationConfirmations()`. Edit Time and Remove both stay available afterward, so a wrong auto-confirmed tag still gets corrected, just after the fact instead of before. Separately, extended to everyone: Edit Time used to only work on a still-pending confirmation — once confirmed, the only option was a full Remove. Now available on already-confirmed/edited_confirmed rows too, everywhere a collaboration renders in `app/member/history/history-client.tsx`. Every edit (before or after confirming) appends to a new `edit_log` jsonb column on `collaboration_confirmations` — previous time, new time, who, when — so a later hours discrepancy is explainable from the record itself instead of another from-scratch DB investigation.

**A pending collaboration confirmation could be completely invisible to the collaborator, with no way to Confirm/Edit/Reject it (2026-07-20)** — real incident: Karthikeyan had a live pending confirmation (Punith's Jul 13 "Meeting"), the "1 pending" banner correctly counted it, but tapping "tap to review" — and manually scrolling the whole page — surfaced nothing. Root cause: the entry's own `participant_ids` had drifted to name a different collaborator (Karkil) than the one the `collaboration_confirmations` row actually names (Karthikeyan), most likely from an edit made after the original tag. Three places all trusted `participant_ids` alone as proof a collaboration belongs to the viewer: the server-side query in `app/member/history/page.tsx` deciding whether the day appears at all, and two client-side entry filters in `history-client.tsx` deciding which entries render once it does. All three now also accept an existing confirmation record for that `entry_id` as proof, since confirmations don't silently get rewritten by an edit the way `participant_ids` can. Same underlying drift pattern as the "Arvi mess" investigation from earlier in the week — this is the second confirmed real-world hit of it, so treat any future "collaboration confirmed/pending but not visible" report as this same class of bug first.

**A member's own Total Shoots/Shooting Hrs/Videos Edited/Working Hours ignored confirmed collaboration hours (2026-07-20)** — real incident: Karthikeyan S (management, `is_management=true`) showed 0 for every one of these stats on his own History and Dashboard despite 15 confirmed shoot collaborations (62.3h all-time) visible right on the same page as "Collaborated · Confirmed" cards. Root cause: `app/member/history/history-client.tsx`'s `stats` calc and `app/member/dashboard/page.tsx`'s shoot/edit counters only ever looped over the member's own submitted `daily_updates.work_entries` — a confirmed `collaboration_confirmations` record for someone else's entry never got added in. This matters most for management, who never submit their own daily update at all (their team tags them as a collaborator instead) — their personal stats were always going to show 0 no matter how many hours they actually contributed. Verified this was purely a personal-display bug: `lib/clients-deliverables.ts`'s `computeDeliverables()` (Expenses' Client & Brand Cost Summary, Clients page, Team Insights) already had its own separate collaboration-credit section with no management exclusion, so client cost was correct the whole time. Fixed both files to also loop over confirmed collaboration records, categorizing by `entry_snapshot.task_type` the same way the deliverables engine does.

**Daily Update now pops up once when the gate locks onto a genuinely unfiled past date (2026-07-20)** — the existing "Submitting for past date" banner was easy to miss on mobile, so members didn't realize they were filling in an old day instead of today. Added a dismissible popup ("This is [date], not today...") in `app/member/update/daily-update-form.tsx`, tracked via a `localStorage` key so it fires once per distinct locked date (the gate moving to a different unfiled day re-triggers it; reloading the same locked date doesn't).

**Expenses page: client filter added to Client Direct and Travel tab headers, plus a "Productivity Gap" row (2026-07-19/20)** — Client Direct and Travel tabs previously showed the whole month with no way to narrow to one client; added a centered filter pill to each tab's own header, scoped to only the client names that actually have rows in that tab (previously all three tabs shared one client list built from employee-cost + roster + direct-expense names combined, so picking some names landed on an empty table). Also added a pinned "Productivity Gap" row to the Per Client summary — idle/unworked salary cost for regular full-time staff (management and freelancers excluded, same formula and audience as Team Insights' existing wastedCost calc), styled distinctly (red tint, "Unproductive" badge) since it's waste data, not a real client's cost.

**Editing a member's email on the Team page silently didn't change their real login (2026-07-16)** — real incident: a freelancer (Arun, GF004) got locked out for 10+ minutes after his email was changed and his password was reset, with no visible error. Root cause: `updateMember()` in `lib/actions/team.ts` only ever wrote the app's own `users.email` display column — it never called Supabase's admin API to update the actual login email on the auth account. So the Team page showed the new email, but the real account you sign in against still had the old one; typing the new email at login could never match, no matter how many times the password got reset (password resets themselves were always correct — there's no separate password copy to get out of sync). Checked every other admin-editable field (password reset, ban/unban, member creation, no-login freelancers) — email was the only gap. Fixed: `updateMember()` now also updates the real login email whenever it changes, and surfaces a real error if that sync fails instead of silently succeeding.

**Half Day leave didn't stop the timer once it started, if the member was already clocked in (2026-07-15)** — real incident: an employee clocked in before their approved Half Day Leave window began, and nothing in the app stopped or paused their session once the leave window arrived — the leave was only ever checked at the moment of clicking Log In, never again after. So the live timer on the Attendance page kept running straight through the approved leave hours as if nothing was happening. Fixed in `app/member/attendance/attendance-client.tsx`: the overlap between the clocked-in span and the leave's `half_day_from_time`/`half_day_to_time` window is now excluded from Worked hours the same way a real break is (folded into the same break-minutes calculation), and shown as a visible line under the Logged/Break/Worked breakdown ("Includes Xh during your approved Half Day Leave — not counted as worked") rather than silently vanishing like the `paused_seconds` figure did in the incident below.

**Half Day leave was silently blocking clock-in for the rest of the day (2026-07-14)** — real incident: an employee took an approved Half Day Leave for the morning, then couldn't clock in that afternoon even though only the morning was covered. Two separate bugs, one backend one frontend:
- Backend (`lib/actions/attendance.ts`): approving any non-permission/wfh/shoot_day leave (including half_day) auto-inserts a placeholder `attendance_logs` row with no `clock_in`, and `clockIn()`'s "already logged today" check treated *any* existing row as a block — it didn't distinguish a real clock-in from that placeholder. Fixed so only Full Day (and self-marked absent) placeholders still block; a Half Day placeholder is now upgraded in place (same row gets `clock_in`/`status: 'present'` instead of a second row, since `attendance_logs` has a `UNIQUE(company_id, user_id, date)` constraint).
- Frontend (`app/member/attendance/attendance-client.tsx`): even after the backend fix, the Log In button was unreachable — `notLogged` was defined as just `!todayLog`, so once the half_day placeholder row existed, none of `isAbsent`/`isIn`/`isDone`/`notLogged` matched it and the entire action card rendered blank. Fixed `notLogged` to also cover a `status: "half_day"` row with no `clock_in`.
- Permission leaves were never affected by either bug — no placeholder row is created for them at all. Applies company-wide, not just to the one employee reported.

**Attendance login/logout gating (2026-07-13)** — real incident: an employee forgot to log out Saturday, had approved leave Sunday, and was still able to log in fresh Monday with zero warning. Root cause: every "did you forget to log out / submit yesterday's update" check in the code only ever looked at the single day right before today — an approved leave sitting in that one slot made the check give up and never look further back. Separately, the warning screens that did exist were purely visual and never actually reached the Login button's own code. Fixed by:
- One shared function (`findLastWorkingDayIssues` in `lib/actions/attendance.ts`) that walks backward past leave/holiday days to find the real last working day, replacing three separate duplicate implementations.
- The Login button itself now hard-refuses (server-side) if the last real working day has an unfinished session or a missing update — not just a screen sitting near the button.
- A Full Day Leave now blocks submitting a Daily Update for that date whether it's today or a past date (previously only blocked today).
- Added sanity zones on logout: 12–18 hour gap on the same day asks "is that correct?" before accepting; over 18 hours is treated as definitely forgotten and requires a manual time correction (real work days here never exceed ~17.5 hours, even the longest shoot days).

**Login freelancers (Freelance Media Production) now see Shooting/Editing hours on Dashboard + History** (2026-07-13) — the data was already being computed for them, but a leftover guard hid the whole right-side stats panel on Dashboard regardless of content, and History's stats panel only ever showed shoot/edit *counts*, never the hours. Both now match what full-time Media sees.

**Full-time Media's History stats panel also got Shooting Hrs added (below Total Shoots), and the existing "Other" stat was moved from the very end of the list (after Overtime) to just above Break Hours** (2026-07-13) — same day as the freelancer fix above, same underlying idea: hours were already computed (`stats.shootH`), just never surfaced next to the count.

**Media's "Other Hrs" row on History is now always shown, and Non-Media's editing stat is now named the same as Media's** (2026-07-13) — "Other Hrs" (meetings/misc) used to stay hidden until a person's first logged entry of that kind; now it's always there like every other Media row. Separately, Non-Media's per-person editing line used to say "Editing" — renamed to "Videos Edited" to match the wording Media uses for the same stat.

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
