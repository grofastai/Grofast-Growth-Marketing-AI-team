# Freelancer Manager Assignment — Design Spec
Date: 2026-06-19

## Problem

The "Assign Manager" modal on `/admin/team` lets the admin select members and bulk-assigns every freelancer to them. It has no memory of who is already assigned, so:
- The same member can be re-selected and "assigned" again (duplicate no-op at DB level, confusing in UI)
- There is no way to see who is currently managing freelancers without querying the DB
- There is no in-app way to remove a manager

## Goal

Redesign the `AssignManagerSheet` component so that:
1. **Already-assigned managers** are shown at the top with a Remove button
2. **Unassigned members** are shown below as selectable options
3. Assigning adds without wiping existing assignments
4. Removing a manager deletes all their `freelancer_assignments` rows

---

## Data Model (no schema changes needed)

The existing `freelancer_assignments` table already supports this:

```
freelancer_assignments (id, company_id, freelancer_id, user_id, created_at)
UNIQUE (freelancer_id, user_id)
```

"Assigned managers" = distinct `user_id` values that appear in `freelancer_assignments` for the company. When a manager is assigned, they get one row per freelancer. When removed, all their rows are deleted.

---

## New Server Actions (`lib/actions/freelancer-manager.ts`)

### `getAssignedManagerIds(companyId): Promise<string[]>`
```
SELECT DISTINCT user_id FROM freelancer_assignments WHERE company_id = cid
```
Returns the list of user IDs currently managing freelancers.

### `addManagerToAllFreelancers(userId): Promise<{ success, error? }>`
- Admin-only guard
- Fetch all `freelancer_id` values for the company
- Upsert `(company_id, freelancer_id, userId)` for each — `onConflict: ignore`
- Revalidates `/admin/team` and `/member/freelancers`

### `removeManagerFromAllFreelancers(userId): Promise<{ success, error? }>`
- Admin-only guard
- `DELETE FROM freelancer_assignments WHERE company_id = cid AND user_id = userId`
- Revalidates `/admin/team` and `/member/freelancers`

The existing `assignAllFreelancersToMembers` action remains unchanged (used elsewhere for per-freelancer sheet assignment).

---

## Page Data (`app/admin/team/page.tsx`)

Add one query to the existing `Promise.all`:
```ts
admin
  .from("freelancer_assignments")
  .select("user_id")
  .eq("company_id", cid)
```
Extract distinct user IDs → `assignedManagerIds: string[]`

Pass `assignedManagerIds` as a new prop into `TeamClient`.

---

## UI — `AssignManagerSheet` (`app/admin/team/team-client.tsx`)

### New prop
```ts
assignedManagerIds: string[]   // user IDs already managing freelancers
```

### Layout (two sections)

```
┌──────────────────────────────────┐
│ Assign Manager              [✕]  │
│ Select who manages all freelan…  │
├──────────────────────────────────┤
│  CURRENTLY ASSIGNED (n)          │
│  ┌──────────────────────────┐    │
│  │ ✓ Sajetha SK   GF003 [Remove] │
│  │ ✓ Punithrajan  GF010 [Remove] │
│  └──────────────────────────┘    │
│  (empty state: "No managers yet")│
│                                  │
│  ADD MANAGER                     │
│  ┌──────────────────────────┐    │
│  │ ○ Karthikeyan S  GF002   │    │
│  │ ○ Sasirekha      GF006   │    │
│  └──────────────────────────┘    │
│  (empty state: "All members      │
│   are already assigned")         │
├──────────────────────────────────┤
│  [Cancel]           [Assign]     │
└──────────────────────────────────┘
```

### State
- `assigned: string[]` — seeded from `assignedManagerIds` prop on open, updated optimistically on remove
- `selected: string[]` — IDs checked in the "Add Manager" section
- `removing: string | null` — ID currently being removed (shows spinner on that row)
- `saving: boolean` — Assign button loading

### Behaviour

**Remove button:**
- Calls `removeManagerFromAllFreelancers(userId)` immediately (no confirmation needed — action is reversible by re-assigning)
- Optimistically removes from `assigned` list
- The removed member instantly reappears in the "Add Manager" section

**Assign button:**
- Disabled when `selected.length === 0`
- Calls `addManagerToAllFreelancers` for each selected ID in sequence (or parallel)
- On success: moves selected IDs into `assigned`, clears `selected`
- No full-page reload needed — router.refresh() after success

### Sorted order
Both sections sorted by employee_id number ascending (existing `idNum` helper).

### Error handling
Inline error message below the relevant section if an action fails. Does not close the modal.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/actions/freelancer-manager.ts` | Add `getAssignedManagerIds`, `addManagerToAllFreelancers`, `removeManagerFromAllFreelancers` |
| `app/admin/team/page.tsx` | Fetch `assignedManagerIds`, pass to TeamClient |
| `app/admin/team/team-client.tsx` | Update `AssignManagerSheet` props + UI |

No DB migrations required.

---

## Out of Scope
- Per-freelancer manager assignment (each freelancer getting a different manager) — current bulk approach is kept
- Confirmation dialog before removing a manager
- Notification to the manager when assigned/removed
