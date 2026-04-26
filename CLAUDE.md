# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: GroFast Team Tracking

Multi-tenant SaaS for employee tracking, daily reporting, task management, and leave management targeting small businesses. Each company (tenant) is fully isolated. Two roles: `ADMIN` and `MEMBER`.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) |
| Database + Auth | Supabase (PostgreSQL + RLS + Supabase Auth) |
| Styling | Tailwind CSS v4 — fully custom design system |
| Language | TypeScript (strict mode) |
| Package Manager | pnpm |
| Deployment | Vercel |
| Forms | React Hook Form + Zod |
| Server State | TanStack Query v5 |
| Client State | Zustand |
| Charts | Recharts |
| Drag & Drop | @dnd-kit/core (Kanban board) |
| Class Variants | cva (class-variance-authority) |

---

## Commands

```bash
pnpm dev           # Dev server at localhost:3000
pnpm build         # Production build
pnpm lint          # ESLint
pnpm typecheck     # tsc --noEmit
pnpm test          # Vitest
pnpm test:watch    # Vitest watch mode
pnpm test src/path/to/file.test.ts  # Single test file
```

---

## App Router Structure

```
app/
  (auth)/
    login/                  # Employee ID + password login page
  (admin)/
    layout.tsx              # Admin shell — server-side guards role=ADMIN
    dashboard/
    team/                   # Team member CRUD
    projects/               # Project management
    goals/                  # Kanban task board (admin view)
    activities/             # Daily updates from all employees
    leaves/                 # Leave approval queue
    announcements/
  (member)/
    layout.tsx              # Member shell — server-side guards role=MEMBER
    dashboard/
    tasks/                  # My tasks list
    update/                 # Daily work update submission
    leaves/                 # Apply + view own leave requests
    announcements/
    profile/
  api/                      # Route handlers for webhooks only
lib/
  supabase/
    server.ts               # createServerClient — use in Server Components, Server Actions, Route Handlers
    client.ts               # createBrowserClient — use in Client Components only
  validations/              # Zod schemas (shared between client + server)
components/
  ui/                       # Base design system components (Button, Card, Badge, Input, etc.)
  charts/                   # Recharts wrappers with theme tokens
  kanban/                   # Kanban board + DnD logic
```

---

## Multi-Tenancy Architecture

Every database table has `company_id uuid NOT NULL`. Supabase RLS policies enforce isolation at the DB layer — never rely solely on application-level filtering.

Users carry `company_id` and `role` as custom claims in their Supabase JWT.

### Core Database Tables

All tables have `company_id` and RLS enabled.

| Table | Key Columns |
|---|---|
| `companies` | id, name, slug, plan |
| `users` | id, company_id, employee_id, role (ADMIN\|MEMBER), name, email, phone, status |
| `projects` | id, company_id, business_name, client_name, location, status, deadline, progress_pct |
| `tasks` | id, company_id, project_id, assigned_to, title, status (todo\|in_progress\|completed), priority, due_date |
| `daily_updates` | id, company_id, user_id, task_id, description, status, date |
| `leaves` | id, company_id, user_id, from_date, to_date, reason, status (pending\|approved\|rejected) |
| `announcements` | id, company_id, title, message, pinned, created_by, created_at |
| `attendance` | id, company_id, user_id, date, status (present\|absent) |

### Standard RLS Pattern

```sql
-- Tenant isolation (applied to every table)
CREATE POLICY "tenant_isolation" ON tasks
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
  );

-- Admin-only mutation
CREATE POLICY "admin_write" ON projects
  FOR INSERT WITH CHECK (
    (auth.jwt() ->> 'role') = 'ADMIN'
  );
```

---

## Auth Flow

1. Employee logs in with **Employee ID + Password**
2. Internally mapped to `{employee_id}@{company_slug}.internal` for Supabase Auth
3. On sign-in, a Supabase Edge Function injects custom JWT claims: `{ company_id, role, employee_id }`
4. `middleware.ts` reads the session and redirects:
   - `role=ADMIN` → `/admin/dashboard`
   - `role=MEMBER` → `/member/dashboard`
   - No session → `/login`
5. Route group layouts (`(admin)/layout.tsx`, `(member)/layout.tsx`) re-validate role server-side via `getUser()` as a second layer

---

## Supabase Client Usage

```typescript
// Server Components, Server Actions, Route Handlers — ALWAYS use this
import { createServerClient } from '@/lib/supabase/server'

// Client Components — use sparingly, only for real-time subscriptions
import { createBrowserClient } from '@/lib/supabase/client'
```

The `SUPABASE_SERVICE_ROLE_KEY` is **never** used client-side. It is only used in Server Actions for admin bootstrapping operations (creating a new company + first admin user).

---

## Key Implementation Patterns

**Server Actions over API routes** — all mutations use Next.js Server Actions. API route handlers are only for external webhooks.

**Optimistic UI for task status** — TanStack Query `useMutation` with `onMutate` callback for instant Kanban drag-and-drop and task status toggles. This is critical for member UX responsiveness.

**Daily update idempotency** — before rendering the daily update form, query `daily_updates` for `user_id + date = today`. Show "Already submitted today" if a record exists. One submission per user per day.

**Admin dashboard widgets** — each widget is a separate Server Component that fetches independently. Do not aggregate in one giant query. Widgets: Today's Attendance, Goals Status (Pie), Pending Leave Requests, Active Projects count.

**Kanban task status** — `todo → in_progress → completed`. The board is a single TanStack Query cache keyed by project or `my-tasks`. Drag-and-drop fires a Server Action that updates `tasks.status` and revalidates the cache.

---

## Custom Design System Rules

No external component libraries (no shadcn, no MUI, no Radix primitives directly).

- Color tokens live in `tailwind.config.ts` under `theme.extend.colors` — use semantic names (`brand`, `surface`, `muted`, `destructive`)
- Component variants built with `cva` from `class-variance-authority`
- All interactive elements must have `focus-visible:` ring styles
- Responsive breakpoints: mobile-first, key breakpoints are `md` (768px) and `lg` (1024px)
- Admin layout uses a fixed sidebar + scrollable main content
- Member layout is mobile-first with a bottom nav bar on small screens

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # Server-only — never expose to client
```

Local development uses `.env.local`. Pull from Vercel with `vercel env pull .env.local`.
