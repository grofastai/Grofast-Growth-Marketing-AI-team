# Payroll "Reports" Redesign — Design Spec

## Context

`app/admin/payroll/payroll-client.tsx`'s "Reports" quick action (`handleGenerateReport`)
opens a new tab containing a bare, print-friendly HTML table: one row per employee
(Name, ID, Base, Deduction, OT Pay, Bonus, Advance, Net Pay, Status), with a totals
banner at the top (Total Base Pay, Total OT Pay, Total Deductions, Total Net Payroll).
It's generated entirely client-side from the same `rows` array already computed and
rendered on screen, so it can never drift from the numbers the admin is already looking
at — that property carries over unchanged in this redesign.

This report currently shows none of the attendance/hours detail that's already
computed per employee and visible when an admin expands their row on the Payroll list
(present/half/absent/leave days, the Hours-Based Formula breakdown) — reviewed and
confirmed in this session, the report should surface that same detail for every
employee, plus a profile photo, without requiring the admin to expand each row
individually.

## Goal

Replace the flat one-row-per-employee table with **one card per employee**, stacked in
a single scrollable/printable document, each showing:

1. **Header**: profile photo (or initials avatar if none uploaded) + Name + Employee ID
   + Team + Paid/Pending status
2. **Attendance**: Present Days, Half Days, Absent Days, Leave Days, out of the
   month's Working Days
3. **Hours**: Total Hours, OT Hours, Permission Hours, Required Hours, Actual Hours,
   Shortfall Hours (the existing "Hours-Based Formula" figures)
4. **Pay**: Base Pay, Deduction, OT Pay, Bonus, Advance, Net Pay

A company-wide totals banner (unchanged from today: Total Base Pay, Total OT Pay,
Total Deductions, Total Net Payroll, employee/paid counts) stays at the top of the
document, above the per-employee cards.

## Data changes

Every field needed except the profile photo is already present on `PayrollRow`
(computed by `computeEmployeeMonth` — see `lib/payroll/compute-month.ts`):
`presentDays`, `halfDays`, `absentDays`, `leaveDays`, `effectiveWorkDays`, `totalHours`,
`otHours`, `hoursPreview.{permissionHours, requiredHours, actualHours, shortfallHours}`,
`basePay`, `deduction`, `otPay`, `bonus`, `advance`, `finalNetPay`, `isPaid`.

**New**: `passport_photo_url` needs to be threaded through:
- `app/admin/payroll/page.tsx`'s `users` select gains `passport_photo_url`, and the
  `MemberRow` type and returned row gain a `passport_photo_url: string | null` field.
- `payroll-client.tsx`'s `PayrollRow` type gains the same field.
- `handleGenerateReport` reads `r.passport_photo_url` per employee; falls back to a
  colored initials circle (same `getInitials()` helper already used for the Payroll
  list's own avatars) when null.

No new database queries beyond adding one column to an existing select — the report
stays fully client-side-generated from data already on the page, preserving the
"can't drift from what's on screen" property.

## Visual style

Not reusing the payslip's red-black-gradient/Poppins look (declined earlier) — this is
an internal, printable, multi-employee review document, not something handed to an
individual employee. Keeps the current report's practical choices (Arial, print media
query, `overflow-x:auto` table wrapper) but restructures the body into per-employee
cards:

- Each card: white background, thin gray border, rounded corners, employee header row
  (photo/initials circle + name/ID/team on the left, Paid/Pending pill on the right),
  then three labeled groups (Attendance / Hours / Pay) as small stat grids — reusing the
  same semantic colors already established on the Payroll list (green for
  present/paid, amber for half/pending, red for absent/deduction, blue/indigo for
  hours) so an admin scanning the printed report recognizes the same color language as
  the live dashboard.
- Totals banner at the top stays close to its current look (light gray stat tiles),
  just restyled slightly to match the card borders below it.
- Print-friendly: `@media print` keeps working — cards must not awkwardly split across
  a page break (`break-inside: avoid`).

## Edge cases

- No profile photo → initials circle (matches the Payroll list's own fallback).
- Hourly/freelance employment type → Pay group shows the same simplified figures the
  Payroll list already shows for this type (no Basic/HRA breakdown exists at this
  level regardless — that granularity is payslip-only).
- Zero employees this month → existing "No payroll rows to report for this month"
  toast, unchanged.
- Pop-up blocked → existing toast, unchanged.

## Verification

No automated test today covers this client-generated HTML (same as the payslip route).
Verification: `pnpm typecheck` clean, then manually clicking "Reports" from the Payroll
page and confirming each employee's card numbers match what expanding their row on the
list already shows, for at least one regular-salary and one hourly employee if both
exist.
