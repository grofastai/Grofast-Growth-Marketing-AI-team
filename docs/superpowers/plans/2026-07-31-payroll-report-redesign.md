# Payroll Reports Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Payroll page's "Reports" flat one-row-per-employee table with one card per employee (profile photo, attendance, hours, pay breakdown), reusing figures already computed for the Payroll list.

**Architecture:** Thread `passport_photo_url` through the existing server→client data flow (the only new field needed), then rewrite `handleGenerateReport`'s generated HTML/CSS to render per-employee cards instead of table rows — still entirely client-side from the `rows` array already on screen, so it can't drift from the live numbers.

**Tech Stack:** Next.js 15 Server Component (`page.tsx`) + Client Component (`payroll-client.tsx`), same `window.open` + `document.write` pattern the report already uses.

## Global Constraints

- Design source of truth: `docs/superpowers/specs/2026-07-31-payroll-report-redesign-design.md`.
- Visual style: plain Arial, print-friendly, white/bordered cards — explicitly NOT the payslip's red-black-gradient/Poppins look (declined for this internal document).
- No new database queries — only add one column (`passport_photo_url`) to the existing `users` select in `page.tsx`.
- `pnpm typecheck` must pass after every task.

---

### Task 1: Thread `passport_photo_url` through `page.tsx`

**Files:**
- Modify: `app/admin/payroll/page.tsx`

**Interfaces:**
- Produces: each object in the `rows` array gains `passport_photo_url: string | null`, alongside the existing `id`, `name`, `employee_id`, `team` fields.

- [ ] **Step 1: Add the column to the `users` select**

In `app/admin/payroll/page.tsx`, change the `users` select (around line 55) from:

```ts
.select("id, name, employee_id, team, employment_type, monthly_salary, hourly_rate, paid_leave_days")
```

to:

```ts
.select("id, name, employee_id, team, employment_type, monthly_salary, hourly_rate, paid_leave_days, passport_photo_url")
```

- [ ] **Step 2: Add the field to `MemberRow` and the returned row**

Update the `MemberRow` type (around line 134):

```ts
type MemberRow = {
  id: string; name: string; employee_id: string; team: string | null
  employment_type: string | null; monthly_salary: number | null; hourly_rate: number | null
  paid_leave_days: number | null; passport_photo_url: string | null
}
```

Update the `rows` return object (around line 205) to include it alongside the other display-only fields:

```ts
return {
  id: m.id, name: m.name, employee_id: m.employee_id, team: m.team,
  passport_photo_url: m.passport_photo_url,
  ...breakdown,
  isPaid: run?.is_paid ?? false,
  paidAt: run?.paid_at ?? null,
  monthly_salary: snapshotMap.get(m.id) ?? m.monthly_salary, hourly_rate: m.hourly_rate,
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: a type error from `payroll-client.tsx`'s `PayrollRow` type not having `passport_photo_url` yet — that's Task 2, next.

- [ ] **Step 4: Commit** (after Task 2 makes typecheck pass — see Task 2's commit step, which covers both files together since neither compiles cleanly alone)

---

### Task 2: Add `passport_photo_url` to `PayrollRow` and rewrite the report

**Files:**
- Modify: `app/admin/payroll/payroll-client.tsx`

**Interfaces:**
- Consumes: `PayrollRow.passport_photo_url` (Task 1), `getInitials(name)`, `fmt(n)` (existing helpers in this file), `rows`, `totalBase`, `totalOT`, `totalDed`, `totalFinal`, `paidCount`, `monthName` (existing variables in this file's `PayrollClient` component).

- [ ] **Step 1: Add the field to `PayrollRow`**

In `app/admin/payroll/payroll-client.tsx`, update the `PayrollRow` type (around line 20-39) to add the new field alongside the other display fields:

```ts
type PayrollRow = {
  id: string; name: string; employee_id: string; team: string | null
  passport_photo_url: string | null
  employment_type: string
  presentDays: number; halfDays: number; absentDays: number; leaveDays: number
  missingUpdates: number; missingUpdateDates: string[]; deductibleDays: number
  totalHours: number; otHours: number; collabHours: number
  basePay: number; deduction: number; otPay: number; netPay: number
  bonus: number; advance: number; incentive: number; finalNetPay: number
  isPaid: boolean; paidAt: string | null
  monthly_salary: number | null; hourly_rate: number | null
  effectiveWorkDays: number
  hoursPreview: {
    targetHours: number; permissionHours: number; halfDayHours: number; leaveHours: number
    requiredHours: number; actualHours: number; shortfallHours: number
    deduction: number; netPay: number | null
  }
}
```

- [ ] **Step 2: Replace `handleGenerateReport`**

Replace the entire `handleGenerateReport` function (currently building `tableRows` and a bare table) with:

```ts
  // Builds a printable summary report entirely client-side from the rows
  // already computed and on screen — no new API route, no re-running any
  // salary calculation, so it can't drift from what's actually displayed.
  // One card per employee (profile photo, attendance, hours, pay), not a
  // flat table — reuses the same figures already shown when an admin
  // expands that employee's row on this page.
  function handleGenerateReport() {
    if (rows.length === 0) {
      showToast("No payroll rows to report for this month.", "error")
      return
    }
    const win = window.open("", "_blank", "noopener,noreferrer")
    if (!win) {
      showToast("Pop-up blocked — allow pop-ups to view the report.", "error")
      return
    }

    function statRow(label: string, value: string, colorClass = "") {
      return `<div class="stat"><span class="stat-lbl">${label}</span><span class="stat-val ${colorClass}">${value}</span></div>`
    }

    const employeeCards = rows.map(r => {
      const photo = r.passport_photo_url
        ? `<img src="${r.passport_photo_url}" alt="${r.name}"/>`
        : `<span>${getInitials(r.name)}</span>`
      const meta = r.team ? `#${r.employee_id} · ${r.team}` : `#${r.employee_id}`
      return `
      <div class="emp-card">
        <div class="emp-hdr">
          <div class="emp-photo">${photo}</div>
          <div class="emp-id">
            <div class="emp-name">${r.name}</div>
            <div class="emp-meta">${meta}</div>
          </div>
          <span class="status-pill ${r.isPaid ? "paid" : "pending"}">${r.isPaid ? "Paid" : "Pending"}</span>
        </div>
        <div class="stat-groups">
          <div class="stat-group">
            <div class="stat-group-title">Attendance</div>
            <div class="stat-grid">
              ${statRow("Present Days", String(r.presentDays), "green")}
              ${statRow("Half Days", String(r.halfDays), "amber")}
              ${statRow("Absent Days", String(r.absentDays), "red")}
              ${statRow("Leave Days", String(r.leaveDays), "blue")}
              ${statRow("Working Days", String(r.effectiveWorkDays))}
            </div>
          </div>
          <div class="stat-group">
            <div class="stat-group-title">Hours</div>
            <div class="stat-grid">
              ${statRow("Total Hours", `${r.totalHours}h`)}
              ${statRow("OT Hours", `${r.otHours}h`, "amber")}
              ${statRow("Permission", `${r.hoursPreview.permissionHours}h`)}
              ${statRow("Required", `${r.hoursPreview.requiredHours}h`)}
              ${statRow("Actual", `${r.hoursPreview.actualHours}h`)}
              ${statRow("Shortfall", `${r.hoursPreview.shortfallHours}h`, r.hoursPreview.shortfallHours > 0 ? "red" : "")}
            </div>
          </div>
          <div class="stat-group">
            <div class="stat-group-title">Pay</div>
            <div class="stat-grid">
              ${statRow("Base Pay", fmt(r.basePay))}
              ${statRow("Deduction", r.deduction > 0 ? `-${fmt(r.deduction)}` : "—", r.deduction > 0 ? "red" : "")}
              ${statRow("OT Pay", r.otPay > 0 ? fmt(r.otPay) : "—", r.otPay > 0 ? "green" : "")}
              ${statRow("Bonus", r.bonus > 0 ? fmt(r.bonus) : "—", r.bonus > 0 ? "green" : "")}
              ${statRow("Advance", r.advance > 0 ? `-${fmt(r.advance)}` : "—", r.advance > 0 ? "red" : "")}
            </div>
            <div class="stat net">
              <span class="stat-lbl">Net Pay</span><span class="stat-val bold">${fmt(r.finalNetPay)}</span>
            </div>
          </div>
        </div>
      </div>`
    }).join("")

    win.document.write(`<!DOCTYPE html><html><head><title>Payroll Report — ${monthName}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:Arial,sans-serif;padding:24px;color:#111;background:#F3F4F6;margin:0}
        h1{font-size:20px;margin:0 0 4px}
        p.sub{color:#374151;margin:0 0 20px;font-size:13px}
        .totals{display:flex;flex-wrap:wrap;gap:16px;margin-bottom:24px}
        .totals div{background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:12px 16px;flex:1 1 160px}
        .totals span.lbl{display:block;font-size:11px;color:#6B7280;margin-bottom:4px}
        .totals strong{display:block;font-size:18px}
        .cards{display:flex;flex-direction:column;gap:14px}
        .emp-card{background:#fff;border:1px solid #E5E7EB;border-radius:14px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
        .emp-hdr{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #F3F4F6}
        .emp-photo{width:44px;height:44px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#DE1A1A;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:14px}
        .emp-photo img{width:100%;height:100%;object-fit:cover}
        .emp-id{flex:1;min-width:0}
        .emp-name{font-size:14px;font-weight:800;color:#111}
        .emp-meta{font-size:11px;color:#6B7280;margin-top:1px}
        .status-pill{font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;flex-shrink:0}
        .status-pill.paid{background:#F0FDF4;color:#16A34A}
        .status-pill.pending{background:#FFF7ED;color:#EA580C}
        .stat-groups{display:grid;grid-template-columns:1fr 1fr 1fr}
        .stat-group{padding:12px 18px;border-left:1px solid #F3F4F6}
        .stat-group:first-child{border-left:none}
        .stat-group-title{font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px}
        .stat-grid{display:flex;flex-direction:column;gap:5px}
        .stat{display:flex;justify-content:space-between;font-size:12px}
        .stat-lbl{color:#374151}
        .stat-val{font-weight:700;color:#111}
        .stat-val.green{color:#16A34A}
        .stat-val.amber{color:#D97706}
        .stat-val.red{color:#DC2626}
        .stat-val.blue{color:#2563EB}
        .stat.net{border-top:1px solid #F3F4F6;margin:6px 18px 0;padding-top:6px}
        .stat-val.bold{font-size:14px}
        @media print{ body{padding:0;background:#fff} }
        @media (max-width:900px){
          .stat-groups{grid-template-columns:1fr}
          .stat-group{border-left:none;border-top:1px solid #F3F4F6}
          .stat-group:first-child{border-top:none}
        }
      </style></head>
      <body>
        <h1>Payroll Report — ${monthName}</h1>
        <p class="sub">${rows.length} employees · ${paidCount} paid · Generated ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
        <div class="totals">
          <div><span class="lbl">Total Base Pay</span><strong>${fmt(totalBase)}</strong></div>
          <div><span class="lbl">Total OT Pay</span><strong>${fmt(totalOT)}</strong></div>
          <div><span class="lbl">Total Deductions</span><strong>${fmt(totalDed)}</strong></div>
          <div><span class="lbl">Total Net Payroll</span><strong>${fmt(totalFinal)}</strong></div>
        </div>
        <div class="cards">${employeeCards}</div>
      </body></html>`)
    win.document.close()
  }
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (this resolves Task 1's pending `passport_photo_url` mismatch too).

- [ ] **Step 4: Commit**

```bash
git add app/admin/payroll/page.tsx app/admin/payroll/payroll-client.tsx
git commit -m "feat(payroll): redesign Reports as one card per employee

Replaces the flat one-row-per-employee Reports table with a card per
employee showing profile photo, attendance (present/half/absent/leave/
working days), hours (total/OT/permission/required/actual/shortfall),
and pay (base/deduction/OT/bonus/advance/net) — reusing the exact
figures already computed for the Payroll list's expanded row. Adds
passport_photo_url to the existing users query (no new queries)."
```

---

### Task 3: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Run: `pnpm dev`

- [ ] **Step 2: Open the report**

Navigate to `/admin/payroll`, click "Reports" in the Quick Actions sidebar. Confirm:
- The totals banner at the top still shows the same Total Base Pay/OT Pay/Deductions/Net Payroll as before.
- Each employee has their own card with a photo (or initials circle if no photo), Paid/Pending pill, and all three stat groups populated.
- For one employee, expand their row on the Payroll list itself and confirm the numbers match (Present/Half/Absent/Leave Days, Permission/Required/Actual/Shortfall Hours, Base/Deduction/OT/Bonus/Advance/Net Pay).

- [ ] **Step 3: Check the empty/edge cases**

Confirm an employee with no profile photo shows their initials instead of a broken image icon. Confirm an hourly/freelance employee's card still renders sensibly (Base Pay populated, no crash).

- [ ] **Step 4: Print preview**

Open the browser's print preview on the report tab — confirm cards don't awkwardly split across a page break (the `break-inside: avoid` rule).
