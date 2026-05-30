# Payslip Member History — Design Spec
**Date:** 2026-05-30  
**Status:** Approved

## Context

The admin payroll page (`/admin/payroll`) is fully built. Members can already open a payslip for any month they type in, but there is no list — they have to guess which months have been processed. This change replaces the manual month picker with a history list pulled from `payroll_runs`, so members always see exactly which payslips exist and their payment status.

---

## What Changes

**File:** `app/member/profile/profile-client.tsx` — the "My Payslip" section (lines 767–830)

- **Remove:** `<input type="month">` month picker + single "View & Download" button
- **Keep:** Professional photo upload block (it still appears in the payslip PDF)
- **Add:** Scrollable list of payslip entries, one row per `payroll_runs` record

**File:** `lib/actions/profile.ts` — add one new server action

**File:** `app/member/profile/page.tsx` — fetch history server-side, pass as prop

---

## UI — Payslip List

Each row:
```
May 2026      [Paid ✅ 28 May]      [View & Download →]
Apr 2026      [Pending ⏳]           [View & Download →]
```

- Month label (e.g., "May 2026")
- Status badge: green "Paid" with `paid_at` date formatted as "28 May", or amber "Pending"
- "View & Download" link → opens `/api/payslip?userId=X&month=YYYY-MM` in new tab

> Net salary is not shown in the list — it is computed dynamically by the payslip API and visible inside the payslip itself.

**Empty state** (no `payroll_runs` rows yet):
> "No payslips yet. Your admin will process your first payslip at month end."

**List cap:** last 12 months, ordered newest first.

---

## New Server Action

Add to `lib/actions/profile.ts`:

```typescript
export async function getMyPayslipHistory(): Promise<
  { month: string; is_paid: boolean; paid_at: string | null }[]
> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = adminSupabase()
  const { data } = await admin
    .from('payroll_runs')
    .select('month, is_paid, paid_at')
    .eq('user_id', user.id)
    .order('month', { ascending: false })
    .limit(12)

  return (data ?? []) as { month: string; is_paid: boolean; paid_at: string | null }[]
}
```

---

## Profile Page Update

`app/member/profile/page.tsx` — call `getMyPayslipHistory()` alongside existing data fetches and pass as `payslipHistory` prop to `ProfileClient`.

`app/member/profile/profile-client.tsx` — accept `payslipHistory` prop, render list in "My Payslip" section.

---

## Files to Modify

| File | Change |
|---|---|
| `lib/actions/profile.ts` | Add `getMyPayslipHistory()` server action |
| `app/member/profile/page.tsx` | Fetch history, pass as prop |
| `app/member/profile/profile-client.tsx` | Replace month picker with history list |

No DB migrations needed — `payroll_runs` table already exists.

---

## Verification

1. Open `/member/profile` as a member whose company has payroll_runs records → list appears with correct months, status badges, and net salary
2. Click "View & Download" on a row → payslip opens in new tab with correct month
3. Open as a member with no payroll_runs → empty state message shows
4. "Paid" badge shows the `paid_at` date formatted as "28 May"
5. "Pending" badge shows for rows where `is_paid = false`
