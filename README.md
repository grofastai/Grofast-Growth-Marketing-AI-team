# GroFast Team Tracking

Multi-tenant SaaS platform for employee tracking, daily reporting, task management, and leave management — built for small creative and marketing businesses.

**Live:** [grofastteam.vercel.app](https://grofastteam.vercel.app)

---

## Overview

Each company (tenant) is fully isolated at the database level via Supabase RLS. Four user roles exist:

| Role | Access |
|---|---|
| `ADMIN` | Full company management — team, tasks, payroll, reports, approvals |
| `MEMBER` | Daily updates, tasks, leaves, attendance — own data only |
| `FREELANCER_MGR` | Freelancer portal — log and track freelancer work and payments |
| `FREELANCER` | External contractor — exists as a record, no app portal |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Database + Auth | Supabase (PostgreSQL + RLS + Supabase Auth) |
| Styling | Tailwind CSS v4 — custom design system |
| Language | TypeScript (strict) |
| Package Manager | pnpm |
| Deployment | Vercel |
| Forms | React Hook Form + Zod |
| Server State | TanStack Query v5 |
| Client State | Zustand |
| Charts | Recharts |
| Drag & Drop | @dnd-kit/core |
| Class Variants | cva (class-variance-authority) |

---

## Getting Started

**Prerequisites:** Node.js 20+, pnpm, Supabase project

### 1. Clone and install

```bash
git clone <repo-url>
cd grofast-team-tracking
pnpm install
```

### 2. Environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # never expose client-side
```

### 3. Set up the database

Run all migrations in order in the Supabase SQL Editor:

```bash
supabase/migrations/001_schema.sql   # base tables + RLS + JWT hook
supabase/migrations/002_projects.sql
...
supabase/migrations/053_fix_employment_type_constraint.sql
```

Or link the Supabase CLI and push:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

### 4. Configure the JWT hook

In Supabase Dashboard → Authentication → Hooks, enable the `custom_access_token_hook` function created by `001_schema.sql`. This injects `company_id`, `role`, and `employee_id` into every access token.

### 5. Run locally

```bash
pnpm dev    # http://localhost:3000
```

---

## Commands

```bash
pnpm dev           # Dev server
pnpm build         # Production build
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm test          # Vitest
pnpm test:watch    # Vitest watch mode
```

---

## App Structure

```
app/
  (auth)/
    login/                  # Employee ID + password login
    change-password/
  (admin)/
    layout.tsx              # Guards role=ADMIN, server-side
    dashboard/              # Stats, task summary, leave calendar, alerts
    team/                   # Member CRUD + role assignment
    clients/                # Client management
    projects/               # Project management
    goals/                  # Kanban task board
    activities/             # Daily updates from all members
    attendance/             # Attendance logs + charts
    leaves/                 # Leave approval queue
    payroll/                # Payroll runs + salary management
    reports/                # Reports + insights
    insights/               # Activity insights
    announcements/          # Company announcements
    documents/              # Document storage
    shoots/                 # Shoot tracking
    expenses/               # Expense tracking
    notifications/          # Push notifications
    whatsapp/               # WhatsApp blast
    birthdays/              # Birthday tracker
    support/
  (member)/
    layout.tsx              # Guards role=MEMBER, server-side
    dashboard/
    tasks/                  # My assigned tasks
    update/                 # Daily work update submission
    leaves/                 # Apply + view own leave requests
    attendance/             # Own attendance log
    history/                # Submission history
    announcements/
    notes/
    shoots/
    expenses/
    documents/
    profile/
    support/
  freelancer/
    layout.tsx              # Guards role=FREELANCER_MGR
    dashboard/              # Freelancer stats + recent activity
    members/                # Freelancer roster
    activities/             # Full work log
    update/                 # Log new freelancer work update
lib/
  supabase/
    server.ts               # createServerClient — Server Components / Actions / Route Handlers
    client.ts               # createBrowserClient — Client Components (real-time only)
  actions/                  # Next.js Server Actions (all mutations)
  validations/              # Zod schemas shared between client + server
components/
  ui/                       # Base design system (Button, Card, Badge, Input…)
  charts/                   # Recharts wrappers with theme tokens
  kanban/                   # Kanban board + DnD logic
supabase/
  migrations/               # 53 SQL migrations — numbered sequentially
```

---

## Auth Flow

1. Employee logs in with **Employee ID + Password**
2. Internally mapped to `{employee_id}@{company_slug}.internal` for Supabase Auth
3. Supabase JWT hook injects custom claims: `{ company_id, role, employee_id }`
4. `middleware.ts` reads the session and routes:
   - `ADMIN` → `/admin/dashboard`
   - `MEMBER` → `/member/dashboard`
   - `FREELANCER_MGR` → `/freelancer/dashboard`
   - No session → `/login`
5. Route group layouts re-validate role server-side as a second guard

---

## Multi-Tenancy

Every table has `company_id uuid NOT NULL`. Supabase RLS policies enforce tenant isolation at the database layer — the application never filters by company manually.

```sql
-- Standard tenant isolation pattern (applied to every table)
CREATE POLICY "tenant_isolation" ON tasks
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
  );
```

---

## Key Patterns

**Server Actions over API routes** — all mutations use Next.js Server Actions. API routes are only for external webhooks.

**Optimistic UI for tasks** — TanStack Query `useMutation` with `onMutate` for instant Kanban drag-and-drop feedback.

**Daily update idempotency** — one submission per member per day enforced by a `UNIQUE (user_id, date)` constraint on `daily_updates`.

**Dashboard caching** — stat counts are cached per company per day (60s TTL) to reduce DB round-trips.

---

## Freelancer Module

The `/freelancer` portal is for `FREELANCER_MGR` role only. Freelancers are logged as `role=FREELANCER` users but have no portal of their own. Work is tracked in `freelancer_updates` with three work types:

- **Shooting** — title, duration, notes, video-uploaded flag
- **Editing** — video name/type, time taken, drive link, revisions
- **Voice Over** — script name, duration, notes

Each entry also records cost (₹), payment status (paid/unpaid), and deadline.

---

## Database Migrations

53 sequential migrations in `supabase/migrations/`. Key milestones:

| Migration | What it added |
|---|---|
| 001 | Base schema (companies, users, daily_updates, leaves) + RLS + JWT hook |
| 002 | Projects |
| 012 | Daily update v2 (activity-based) |
| 017 | Salary fields (employment_type, monthly_salary, hourly_rate) |
| 023 | Shoots table |
| 029 | Attendance breaks |
| 032 | FREELANCER + FREELANCER_MGR roles, freelancer_updates table |
| 034 | Payroll runs |
| 037 | Documents table + storage |
| 046 | Clients table |
| 049 | Activity work logs |
| 053 | Fix employment_type constraint (adds part_time, freelancer values) |

---

## Environment Variables

| Variable | Where used |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only — admin bootstrapping, never client-side |
