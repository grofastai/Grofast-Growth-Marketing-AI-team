# Payslip Member History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual month-picker in the member profile's "My Payslip" section with a list of processed payslip months pulled from `payroll_runs`, showing paid/pending status per month.

**Architecture:** A new server action `getMyPayslipHistory()` is added to `lib/actions/profile.ts`. The profile page (`app/member/profile/page.tsx`) calls it server-side and passes the result as a new `payslipHistory` prop to `ProfileClient`. The client component replaces the static month picker and single download button with a rendered list — one row per payroll_runs record.

**Tech Stack:** Next.js 15 App Router, Supabase (service-role for payroll_runs query), TypeScript, inline styles (existing pattern in this file)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/actions/profile.ts` | **Modify** | Add `getMyPayslipHistory()` server action |
| `app/member/profile/page.tsx` | **Modify** | Call history action, pass as `payslipHistory` prop |
| `app/member/profile/profile-client.tsx` | **Modify** | Add prop type, remove month picker, render history list |
| `__tests__/payslip-history.test.ts` | **Create** | Unit tests for formatting helpers |

---

## Task 1: Write tests for formatting helpers

**Files:**
- Create: `__tests__/payslip-history.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// __tests__/payslip-history.test.ts
import { describe, it, expect } from 'vitest'

// Helpers that will be used inline in profile-client.tsx — tested here in isolation

function formatPayslipMonth(month: string): string {
  // month is "YYYY-MM", e.g. "2026-05" → "May 2026"
  return new Date(month + '-01').toLocaleDateString('en-IN', {
    month: 'long', year: 'numeric',
  })
}

function formatPaidDate(paidAt: string): string {
  // paidAt is ISO date string → "28 May"
  return new Date(paidAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short',
  })
}

describe('formatPayslipMonth', () => {
  it('formats YYYY-MM to Month Year', () => {
    expect(formatPayslipMonth('2026-05')).toBe('May 2026')
  })

  it('formats January correctly', () => {
    expect(formatPayslipMonth('2026-01')).toBe('January 2026')
  })

  it('formats December correctly', () => {
    expect(formatPayslipMonth('2025-12')).toBe('December 2025')
  })
})

describe('formatPaidDate', () => {
  it('formats ISO date to day + short month', () => {
    const result = formatPaidDate('2026-05-28T00:00:00.000Z')
    // Result is locale-dependent — just check it contains "28" and "May"
    expect(result).toContain('28')
    expect(result.toLowerCase()).toContain('may')
  })
})
```

- [ ] **Step 2: Run tests to confirm they pass**

```bash
pnpm test __tests__/payslip-history.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/payslip-history.test.ts
git commit -m "test: payslip history formatting helpers"
```

---

## Task 2: Add `getMyPayslipHistory` server action

**Files:**
- Modify: `lib/actions/profile.ts`

- [ ] **Step 1: Add the function at the end of `lib/actions/profile.ts`**

Open `lib/actions/profile.ts` and append this function after the last existing export:

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

Note: `createServerClient` and `adminSupabase` are already imported/defined at the top of the file.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/profile.ts
git commit -m "feat: getMyPayslipHistory server action"
```

---

## Task 3: Pass `payslipHistory` from page to client

**Files:**
- Modify: `app/member/profile/page.tsx`
- Modify: `app/member/profile/profile-client.tsx` (props only)

- [ ] **Step 1: Import and call the action in `page.tsx`**

In `app/member/profile/page.tsx`, the current imports are:

```typescript
import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import ProfileClient from "./profile-client"
```

Add a fourth import line:

```typescript
import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import ProfileClient from "./profile-client"
import { getMyPayslipHistory } from "@/lib/actions/profile"
```

Then, after the existing `Promise.all(...)` block (after line 83), add:

```typescript
  const payslipHistory = await getMyPayslipHistory()
```

- [ ] **Step 2: Pass the new prop to `ProfileClient`**

In the same file, find the `<ProfileClient ... />` JSX (currently ends at line ~154). Add `payslipHistory={payslipHistory}` as a new prop:

```tsx
  return (
    <ProfileClient
      profile={profile ? {
        id:          user.id,
        name:        profile.name,
        employee_id: profile.employee_id,
        role:        profile.role,
        email:       profile.email ?? user.email ?? "",
        phone:       profile.phone ?? "",
        status:      profile.status,
        joined,
        photo_url:               profile.photo_url ?? null,
        passport_photo_url:      profile.passport_photo_url ?? null,
        position:                profile.position ?? null,
        blood_group:             profile.blood_group ?? null,
        address:                 profile.address ?? null,
        emergency_contact_name:  profile.emergency_contact_name ?? null,
        emergency_contact_phone: profile.emergency_contact_phone ?? null,
      } : null}
      kyc={kyc}
      stats={{
        weekHours:    Math.round(weekHours * 10) / 10,
        weekMissed,
        totalCompleted: totalCompleted ?? 0,
        totalLeaves:    totalLeaves ?? 0,
        avgHoursPerDay: avgHours,
      }}
      chartData={sevenDayChart}
      recentUpdates={recentUpdates}
      authEmail={user.email ?? ""}
      payslipHistory={payslipHistory}
    />
  )
```

- [ ] **Step 3: Add `payslipHistory` to `ProfileClient` props signature**

In `app/member/profile/profile-client.tsx`, find the function signature (line 125):

```typescript
export default function ProfileClient({
  profile, kyc, stats, chartData, recentUpdates, authEmail,
}: {
  profile: ProfileData | null; kyc: KYCData | null; stats: Stats
  chartData: ChartDay[]; recentUpdates: RecentUpdate[]; authEmail: string
}) {
```

Replace with:

```typescript
export default function ProfileClient({
  profile, kyc, stats, chartData, recentUpdates, authEmail, payslipHistory,
}: {
  profile: ProfileData | null; kyc: KYCData | null; stats: Stats
  chartData: ChartDay[]; recentUpdates: RecentUpdate[]; authEmail: string
  payslipHistory: { month: string; is_paid: boolean; paid_at: string | null }[]
}) {
```

- [ ] **Step 4: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/member/profile/page.tsx app/member/profile/profile-client.tsx
git commit -m "feat: pass payslipHistory prop to ProfileClient"
```

---

## Task 4: Replace month picker with history list in ProfileClient

**Files:**
- Modify: `app/member/profile/profile-client.tsx`

- [ ] **Step 1: Remove the `payslipMonth` state and `currentMonth` constant**

In `app/member/profile/profile-client.tsx`, find these two lines (around line 189):

```typescript
  const currentMonth = new Date().toISOString().slice(0, 7) // "YYYY-MM"
  const [payslipMonth, setPayslipMonth] = useState(currentMonth)
```

Delete both lines.

- [ ] **Step 2: Replace the month picker + download button with the history list**

Find this block (lines 805–829 approximately):

```tsx
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", display: "block", marginBottom: 6 }}>Select Month</label>
              <input
                type="month"
                value={payslipMonth}
                max={currentMonth}
                onChange={e => setPayslipMonth(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 12, border: "1.5px solid #EBEDF2", fontSize: 13, fontWeight: 600, color: "#111111", background: "#F8F9FC", outline: "none" }}
              />
            </div>
            <a
              href={profile ? `/api/payslip?userId=${profile.id}&month=${payslipMonth}` : "#"}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "11px", borderRadius: 12, textDecoration: "none",
                background: "linear-gradient(135deg, #DE1A1A, #7F1D1D)",
                fontSize: 13, fontWeight: 700, color: "#fff",
                boxShadow: "0 4px 14px rgba(222,26,26,0.3)",
                pointerEvents: profile ? "auto" : "none", opacity: profile ? 1 : 0.5,
              }}>
              <Download size={14} />
              View &amp; Download Payslip
            </a>
```

Replace the entire block with:

```tsx
            {payslipHistory.length === 0 ? (
              <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "12px 0", margin: 0 }}>
                No payslips yet. Your admin will process your first payslip at month end.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {payslipHistory.map((p) => {
                  const label = new Date(p.month + '-01').toLocaleDateString('en-IN', {
                    month: 'long', year: 'numeric',
                  })
                  const paidLabel = p.paid_at
                    ? new Date(p.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                    : null
                  return (
                    <div key={p.month} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "#F8F9FC", border: "1px solid #EBEDF2" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#111111", margin: "0 0 2px" }}>{label}</p>
                        {p.is_paid
                          ? <p style={{ fontSize: 11, color: "#16A34A", margin: 0 }}>Paid{paidLabel ? ` · ${paidLabel}` : ''}</p>
                          : <p style={{ fontSize: 11, color: "#D97706", margin: 0 }}>Pending</p>
                        }
                      </div>
                      <a
                        href={profile ? `/api/payslip?userId=${profile.id}&month=${p.month}` : "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 12, fontWeight: 700, color: "#DE1A1A",
                          textDecoration: "none", padding: "6px 12px",
                          borderRadius: 8, background: "rgba(222,26,26,0.08)",
                          whiteSpace: "nowrap", flexShrink: 0,
                          pointerEvents: profile ? "auto" : "none",
                        }}>
                        View →
                      </a>
                    </div>
                  )
                })}
              </div>
            )}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: No errors. If TypeScript complains about `useState` import (unused after removing `payslipMonth`), check whether `useState` is still used elsewhere in the file first — it almost certainly is.

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: All tests pass (including the 4 new ones from Task 1).

- [ ] **Step 5: Commit**

```bash
git add app/member/profile/profile-client.tsx
git commit -m "feat: replace month picker with payslip history list on member profile"
```

---

## Verification

1. Log in as a member whose company has `payroll_runs` records → open `/member/profile` → scroll to "My Payslip" → confirm the history list appears with month labels, paid/pending badges, and "View →" links
2. Click "View →" on a paid month → payslip opens in new tab with the correct month
3. Click "View →" on a pending month → payslip still opens (it generates from current data regardless of paid status)
4. Log in as a member with no `payroll_runs` records → confirm empty state message appears
5. Confirm the professional photo upload block is unchanged above the list
6. Check there are no console errors on the profile page
