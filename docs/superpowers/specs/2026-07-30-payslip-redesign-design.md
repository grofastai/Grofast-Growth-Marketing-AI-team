# Payslip Redesign — Design Spec

## Context

`app/api/payslip/route.ts` generates the per-employee payslip document (linked from the 📄
icon on each Payroll row and from the "Generate Payslip" quick action, which opens it for
every configured employee). The current design is elaborate — donut chart salary
breakdown, four KPI cards, a QR verification code, signature blocks, a watermark, mini
sparklines. Feedback (via a review PDF, with an Infosys "Salary Slip" screenshot attached
as a reference) is that this reads as unprofessional/cluttered for a document employees
may use for income verification (banks, loans), and asks for a clean, minimal, corporate
layout instead — visually modeled on the attached Infosys slip, adapted to GroFast's
actual payroll fields.

**Out of scope for this round** (confirmed during design):
- The Payroll admin list page (`app/admin/payroll/payroll-client.tsx`) — its Employee
  Payroll cards, expandable breakdown, attendance calendar, and Bonus/Adjustments panel
  keep their current design unchanged.
- The company-wide "Reports" quick action (`handleGenerateReport` in
  `payroll-client.tsx`) — the plain printable all-employees table stays as-is.
- The "Hours-Based Formula — Preview" panel already shown in the Payroll list's expanded
  row — unaffected; not the subject of this redesign.

Only `app/api/payslip/route.ts`'s HTML output changes.

## Goals

1. Replace the current decorative payslip layout with a clean, minimal, Infosys-style
   document: company header, employee info block, a small work-days row, a two-column
   Earnings | Deductions table, and a Net Pay footer.
2. Add a **Year to Date** amount column alongside the existing **Current Period** column
   for every Earnings/Deductions line item — cumulative since the start of the financial
   year (April 1) through the payslip's target month.
3. Do this without duplicating the payroll calculation formula a third time — extract the
   existing per-month calculation (currently duplicated between
   `app/admin/payroll/page.tsx` and `app/api/payslip/route.ts`) into one shared function
   that both the Payroll list and the payslip route call, including for each historical
   month needed for Year to Date.

## Layout (replaces the current HTML in `app/api/payslip/route.ts`)

1. **Header**: GroFast name + address/contact (kept from the current route, restyled
   plainer), with "Salary Slip for the month of {Month Year}" as a simple title (no large
   gradient badge).
2. **Employee info block** (bordered box, two columns):
   - Left: Name, Designation, Employee ID, Team
   - Right: Joining Date, Bank Name, Bank Account (masked, as today), IFSC
   - Designation comes from the existing Positions system
     (`getUserPositionIds`/`listPositions`) — joins multiple assigned position names with
     "/", falls back to the employee's Team name if none assigned, then to "Team Member."
3. **Work-days row**: "Total Working Days" and "LOP Days" (Loss of Pay — the existing
   `deductibleDays`, i.e. absent days + half-day×0.5), for the target month only — no
   Year to Date figure here, matching the Infosys reference's single-value work-days row
   (Year to Date only applies to the Earnings/Deductions table below). No
   Overseas/Secondment/India split (not applicable to GroFast) and no full
   present/half/absent/leave breakdown (that detail stays in the Payroll list's
   expandable row, not on the payslip).
4. **Earnings | Deductions table**, two columns side by side, each with sub-columns
   **Particulars | Current Period | Year to Date**, a bold Total row at the bottom of
   each side.
   - Earnings lines (each shown only if non-zero, same convention as today): Basic
     Salary, HRA, Travel Allowance, Medical Allowance, Other Allowance, Overtime Pay,
     Bonus, Incentive. For hourly/freelance employment type (no `monthly_salary`): a
     single "Hours Worked (Xh)" line, matching today's simplified handling.
   - Deduction lines: Attendance Deduction (LOP) — labeled with the day count, Advance
     Recovery (if > 0).
5. **Net Pay for the month** — full-width highlighted bar, Current Period and Year to
   Date amounts, "Rupees ... Only" in words (reuses the existing `inWords` helper).
6. **Footer** — one line: "This is a computer-generated payslip. No signature required."
   plus a generated timestamp. No QR code, no watermark, no signature blocks, no donut
   chart, no KPI cards, no sparklines.
7. The existing slim utility bar (dark strip with the Download/Print button, hidden via
   `@media print`) stays functionally the same, restyled to match the plainer aesthetic.

## Visual style

- White background, dark-gray/black text, thin gray horizontal rules between table rows
  — no gradients, drop shadows, or rounded pill badges.
- GroFast red stays as the single accent color (company name, section labels, Net Pay
  highlight) — the redesign removes decorative elements, not brand identity.
- Same Inter/system font stack already used elsewhere in the app; dense, compact sizing
  (~11–13px body) matching the reference's information-dense table, not the current
  route's larger decorative numerals.
- The Earnings/Deductions table itself is flat — bordered, light-gray shaded header row,
  no card shadow or rounded corners — so it reads as an official document rather than a
  dashboard widget.

## Year to Date computation

### Shared calculation function

Extract the per-employee, per-month payroll calculation (attendance day classification →
present/half/absent/leave days → Basic/HRA/Travel/Medical/Other Allowance/OT
Pay/Deduction, using that month's `monthly_salary_records` snapshot and that month's
`payroll_runs` bonus/advance/incentive) into a new shared module, e.g.
`lib/payroll/compute-month.ts`, with a signature along the lines of:

```ts
computeEmployeeMonth(
  admin: SupabaseClient,
  params: { userId: string; companyId: string; month: string /* "YYYY-MM" */ },
  settings: PayrollSettings,
): Promise<EmployeeMonthBreakdown>
```

returning the same fields `app/admin/payroll/page.tsx`'s `rows[]` and
`app/api/payslip/route.ts` currently compute inline (presentDays, halfDays, absentDays,
leaveDays, totalHours, otHours, basic, hra, travelAllowance, medicalAllowance,
otherAllowance, deduction, otPay, bonus, advance, incentive, netPay, etc.).

Both `app/admin/payroll/page.tsx` (current month only, for the list) and
`app/api/payslip/route.ts` (current month for "Current Period", plus one call per
historical month for "Year to Date") call this same function — removing the existing
duplication between those two files as a side effect, not just avoiding a third copy.

### Year to Date range

- Financial year: **April 1 – March 31** (matches the Infosys reference and standard
  Indian payroll convention), independent of the calendar-year convention the rest of the
  app uses for leave balances.
- For a target month `M`, Year to Date spans every month from `max(FY start, employee's
  joining month)` through `M` inclusive.
- Each line item's Year to Date figure is the sum of that line item's Current-Period
  value across every month in that range (computed via the shared function above).
- Employees who joined partway through the financial year only accumulate from their
  joining month forward — never before they were employed.

### Historical month fallback

- Salary: uses that month's `monthly_salary_records` snapshot if one exists; falls back
  to the employee's *current* `monthly_salary` if no snapshot was ever taken for that
  month (Payroll wasn't necessarily opened for every past month, so a snapshot isn't
  guaranteed to exist for all of them).
- Bonus/Advance/Incentive: from that month's `payroll_runs` row if one exists, else 0.

## Edge cases

- No Positions assigned → Designation falls back to Team name, then "Team Member."
- No bank/KYC record → "—" for Bank Name/Account/IFSC (unchanged from today).
- Hourly/freelance employment type → single "Hours Worked" Earnings line, no
  category-by-category Year to Date breakdown (matches today's simplified handling for
  this employment type — Year to Date still applies to the total, just not itemized).
- Employee's first payslip ever (joined this month) → Year to Date equals Current Period
  for every line (nothing to accumulate before this month).

## Verification

No automated test suite covers HTML-generation routes like this today. Verification is:
`pnpm typecheck` clean, then manually opening the payslip for at least one regular-salary
employee and one hourly employee (if any exist) across a couple of different months —
confirming Current Period matches what the Payroll admin list already shows for that
employee/month (so the shared function didn't introduce drift from the existing
source-of-truth numbers), and that Year to Date sums correctly across the intervening
months.
