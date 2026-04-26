# GroFast Phase 1 — Foundation, Auth & Daily Tracking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up Supabase auth (Employee ID + password login), role-based routing, department/team structure, and a fully working daily tracking form for media team employees with attendance, hours, shoot, and editing entries.

**Architecture:** All mutations use Next.js Server Actions; UI reads via Server Components with TanStack Query for client-side optimism on interactive widgets. RLS on every table ensures tenant and role isolation at the DB layer. Custom JWT claims (`company_id`, `role`, `employee_id`) are injected via a Postgres auth hook and read in middleware for routing decisions.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS + Auth), `@supabase/ssr`, TypeScript strict, Tailwind CSS v4, React Hook Form + Zod, TanStack Query v5, Vitest.

---

> **Phase scope:** This plan covers Phase 1 only.
> - Phase 2 (Client system, Folder links, Leave/Permission system) → separate plan
> - Phase 3 (Google Sheets sync, WhatsApp via n8n, Analytics) → separate plan

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Modify | Add `@supabase/ssr`, `@supabase/supabase-js`, `vitest`, `@vitejs/plugin-react`, `@testing-library/react` |
| `vitest.config.ts` | Create | Vitest configuration |
| `supabase/migrations/001_schema.sql` | Create | All tables, RLS policies, JWT hook function |
| `lib/supabase/types.ts` | Create | Hand-written Database type map (replaces `supabase gen types`) |
| `lib/supabase/server.ts` | Create | `createServerClient` using `@supabase/ssr` for Server Components / Actions |
| `lib/supabase/client.ts` | Create | `createBrowserClient` using `@supabase/ssr` for Client Components |
| `lib/validations/auth.ts` | Create | Zod schema for login form |
| `lib/validations/daily-update.ts` | Create | Zod schema for daily update form |
| `lib/actions/auth.ts` | Create | `loginAction`, `logoutAction` server actions |
| `lib/actions/daily-updates.ts` | Create | `submitDailyUpdate` server action |
| `middleware.ts` | Create | Session refresh + role-based routing |
| `app/(auth)/login/page.tsx` | Create | Login page (Employee ID + company slug + password) |
| `app/(auth)/login/login-form.tsx` | Create | Client component form with React Hook Form |
| `app/(admin)/layout.tsx` | Modify | Add server-side `getUser()` role guard (ADMIN only) |
| `app/(member)/layout.tsx` | Create | Member shell with bottom nav, role guard (MEMBER only) |
| `app/(member)/dashboard/page.tsx` | Create | Member dashboard (today's status + recent entries) |
| `app/(member)/update/page.tsx` | Create | Daily update server page (idempotency check) |
| `components/member/daily-update-form.tsx` | Create | Full daily update form with shoot/editing sections |
| `app/(admin)/activities/page.tsx` | Create | Admin view — all daily updates, filterable by date/user/dept |
| `app/(admin)/team/page.tsx` | Modify | Replace mock data with real Supabase query + department filter |

---

## Task 1: Install Dependencies + Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Supabase + testing packages**

```bash
pnpm add @supabase/ssr @supabase/supabase-js
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event jsdom
```

- [ ] **Step 2: Add test scripts to package.json**

Open `package.json` and add to `"scripts"`:

```json
"test": "vitest",
"test:watch": "vitest --watch",
"typecheck": "tsc --noEmit"
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 4: Verify install**

```bash
pnpm test --run
```

Expected: `No test files found` (not a failure — zero tests is fine here).

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore: add supabase ssr + vitest"
```

---

## Task 2: Database Types

**Files:**
- Create: `lib/supabase/types.ts`
- Create: `lib/supabase/types.test.ts`

- [ ] **Step 1: Write the failing type test**

Create `lib/supabase/types.test.ts`:

```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { Database } from './types'

describe('Database types', () => {
  it('daily_updates row has required fields', () => {
    type Row = Database['public']['Tables']['daily_updates']['Row']
    expectTypeOf<Row['attendance_status']>().toEqualTypeOf<
      'present' | 'absent' | 'holiday' | 'outside'
    >()
    expectTypeOf<Row['work_type']>().toEqualTypeOf<
      'office' | 'outside' | 'wfh' | null
    >()
  })

  it('users row has department_id', () => {
    type Row = Database['public']['Tables']['users']['Row']
    expectTypeOf<Row['department_id']>().toEqualTypeOf<string | null>()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
pnpm test --run lib/supabase/types.test.ts
```

Expected: FAIL — `Cannot find module './types'`

- [ ] **Step 3: Create lib/supabase/types.ts**

```typescript
export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string
          name: string
          slug: string
          plan: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          plan?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['companies']['Insert']>
      }
      departments: {
        Row: {
          id: string
          company_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          name: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['departments']['Insert']>
      }
      users: {
        Row: {
          id: string
          company_id: string
          department_id: string | null
          employee_id: string
          role: 'ADMIN' | 'MEMBER'
          name: string
          email: string | null
          phone: string | null
          status: 'active' | 'inactive'
          created_at: string
        }
        Insert: {
          id: string
          company_id: string
          department_id?: string | null
          employee_id: string
          role: 'ADMIN' | 'MEMBER'
          name: string
          email?: string | null
          phone?: string | null
          status?: 'active' | 'inactive'
          created_at?: string
        }
        Update: Partial<Omit<Database['public']['Tables']['users']['Insert'], 'id'>>
      }
      daily_updates: {
        Row: {
          id: string
          company_id: string
          user_id: string
          date: string
          attendance_status: 'present' | 'absent' | 'holiday' | 'outside'
          work_type: 'office' | 'outside' | 'wfh' | null
          working_hours: number | null
          learning_hours: number
          shoot_count: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          date?: string
          attendance_status?: 'present' | 'absent' | 'holiday' | 'outside'
          work_type?: 'office' | 'outside' | 'wfh' | null
          working_hours?: number | null
          learning_hours?: number
          shoot_count?: number
          notes?: string | null
          created_at?: string
        }
        Update: Partial<Omit<Database['public']['Tables']['daily_updates']['Insert'], 'id'>>
      }
      shoot_entries: {
        Row: {
          id: string
          company_id: string
          user_id: string
          daily_update_id: string
          client_id: string | null
          shoot_type: string
          video_count: number
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          daily_update_id: string
          client_id?: string | null
          shoot_type: string
          video_count?: number
          notes?: string | null
          created_at?: string
        }
        Update: Partial<Omit<Database['public']['Tables']['shoot_entries']['Insert'], 'id'>>
      }
      editing_entries: {
        Row: {
          id: string
          company_id: string
          user_id: string
          daily_update_id: string
          client_id: string | null
          editing_hours: number
          folder_link: string | null
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          daily_update_id: string
          client_id?: string | null
          editing_hours: number
          folder_link?: string | null
          created_at?: string
        }
        Update: Partial<Omit<Database['public']['Tables']['editing_entries']['Insert'], 'id'>>
      }
      leaves: {
        Row: {
          id: string
          company_id: string
          user_id: string
          from_date: string
          to_date: string
          reason: string
          status: 'pending' | 'approved' | 'rejected'
          created_at: string
        }
        Insert: {
          id?: string
          company_id: string
          user_id: string
          from_date: string
          to_date: string
          reason: string
          status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
        }
        Update: Partial<Omit<Database['public']['Tables']['leaves']['Insert'], 'id'>>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
pnpm test --run lib/supabase/types.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/types.ts lib/supabase/types.test.ts
git commit -m "feat: add database type definitions"
```

---

## Task 3: Supabase Clients

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/client.ts`

- [ ] **Step 1: Create lib/supabase/server.ts**

```typescript
import { createServerClient as createSSRClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

export async function createServerClient() {
  const cookieStore = await cookies()

  return createSSRClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored in Server Components — middleware handles cookie writes
          }
        },
      },
    }
  )
}
```

- [ ] **Step 2: Create lib/supabase/client.ts**

```typescript
'use client'

import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

export function createBrowserClient() {
  return createSSRBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm typecheck
```

Expected: No errors (if env vars are missing, ignore those — they're runtime only).

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/server.ts lib/supabase/client.ts
git commit -m "feat: add supabase server and browser clients"
```

---

## Task 4: Database Migration SQL

**Files:**
- Create: `supabase/migrations/001_schema.sql`

This SQL runs in the **Supabase dashboard → SQL Editor**, or via `supabase db push` if the CLI is installed.

- [ ] **Step 1: Create supabase/migrations/001_schema.sql**

```sql
-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  plan text NOT NULL DEFAULT 'starter',
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- DEPARTMENTS (new — teams within a company)
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, name)
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  employee_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
  name text NOT NULL,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, employee_id)
);

-- ============================================================
-- DAILY UPDATES (enhanced — replaces simple version)
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  attendance_status text NOT NULL DEFAULT 'present'
    CHECK (attendance_status IN ('present', 'absent', 'holiday', 'outside')),
  work_type text CHECK (work_type IN ('office', 'outside', 'wfh')),
  working_hours numeric(4,2),
  learning_hours numeric(4,2) NOT NULL DEFAULT 0,
  shoot_count integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, user_id, date)
);

-- ============================================================
-- SHOOT ENTRIES (media-specific)
-- ============================================================
CREATE TABLE IF NOT EXISTS shoot_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_update_id uuid NOT NULL REFERENCES daily_updates(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  shoot_type text NOT NULL,
  video_count integer NOT NULL DEFAULT 1,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- EDITING ENTRIES
-- ============================================================
CREATE TABLE IF NOT EXISTS editing_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_update_id uuid NOT NULL REFERENCES daily_updates(id) ON DELETE CASCADE,
  client_name text NOT NULL,
  editing_hours numeric(4,2) NOT NULL,
  folder_link text,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- LEAVES
-- ============================================================
CREATE TABLE IF NOT EXISTS leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoot_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE editing_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves ENABLE ROW LEVEL SECURITY;

-- Companies: users see only their own company
CREATE POLICY "own_company" ON companies
  FOR SELECT USING (id = (auth.jwt() ->> 'company_id')::uuid);

-- Departments: tenant isolation (all roles read)
CREATE POLICY "tenant_isolation" ON departments
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Users: tenant isolation (all roles read); admin-only write
CREATE POLICY "tenant_isolation" ON users
  FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "admin_write_users" ON users
  FOR INSERT WITH CHECK (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY "admin_update_users" ON users
  FOR UPDATE USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

-- Daily updates: members see/write own; admins see all
CREATE POLICY "daily_updates_access" ON daily_updates
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (
      (auth.jwt() ->> 'role') = 'ADMIN'
      OR user_id = auth.uid()
    )
  );

-- Shoot entries: same as daily updates
CREATE POLICY "shoot_entries_access" ON shoot_entries
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (
      (auth.jwt() ->> 'role') = 'ADMIN'
      OR user_id = auth.uid()
    )
  );

-- Editing entries: same
CREATE POLICY "editing_entries_access" ON editing_entries
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (
      (auth.jwt() ->> 'role') = 'ADMIN'
      OR user_id = auth.uid()
    )
  );

-- Leaves: members see/write own; admins see all; only admins update status
CREATE POLICY "leaves_access" ON leaves
  FOR SELECT USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (
      (auth.jwt() ->> 'role') = 'ADMIN'
      OR user_id = auth.uid()
    )
  );

CREATE POLICY "leaves_insert" ON leaves
  FOR INSERT WITH CHECK (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND user_id = auth.uid()
  );

CREATE POLICY "leaves_admin_update" ON leaves
  FOR UPDATE USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

-- ============================================================
-- JWT CLAIMS HOOK
-- Injects company_id, role, employee_id into access token.
-- After creating this function:
--   Supabase Dashboard → Auth → Hooks → Enable custom_access_token_hook
--   Grant: GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
-- ============================================================
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  v_role text;
  v_company_id uuid;
  v_employee_id text;
BEGIN
  SELECT role, company_id, employee_id
  INTO v_role, v_company_id, v_employee_id
  FROM public.users
  WHERE id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  IF v_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{role}', to_jsonb(v_role));
    claims := jsonb_set(claims, '{company_id}', to_jsonb(v_company_id::text));
    claims := jsonb_set(claims, '{employee_id}', to_jsonb(v_employee_id));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

-- ============================================================
-- SEED: GroFast demo company + departments
-- Run this after the migration to set up the demo tenant.
-- Replace UUIDs and employee passwords via Supabase Auth API.
-- ============================================================
INSERT INTO companies (id, name, slug, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'GroFast Digital', 'grofast', 'pro')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO departments (company_id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'MEDIA TEAM'),
  ('00000000-0000-0000-0000-000000000001', 'MEDIA & TECH'),
  ('00000000-0000-0000-0000-000000000001', 'TECH & OPS'),
  ('00000000-0000-0000-0000-000000000001', 'CREATIVE')
ON CONFLICT (company_id, name) DO NOTHING;
```

- [ ] **Step 2: Run migration in Supabase**

  1. Go to Supabase Dashboard → SQL Editor
  2. Paste the full contents of `supabase/migrations/001_schema.sql`
  3. Click "Run"
  4. Expected: All statements succeed with "Success"
  5. Go to Auth → Hooks → enable `custom_access_token_hook`
  6. Run: `GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;`

- [ ] **Step 3: Verify tables in Table Editor**

  In Supabase Dashboard → Table Editor, confirm these tables exist:
  `companies`, `departments`, `users`, `daily_updates`, `shoot_entries`, `editing_entries`, `leaves`

- [ ] **Step 4: Create .env.local**

  Create `.env.local` in the project root (never commit this file):

  ```bash
  NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
  SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
  ```

  Get values from: Supabase Dashboard → Project Settings → API

- [ ] **Step 5: Commit migration (not .env.local)**

  Ensure `.gitignore` has `.env.local`, then:

  ```bash
  git add supabase/migrations/001_schema.sql
  git commit -m "feat: add database schema, RLS policies, jwt hook"
  ```

---

## Task 5: Auth Validations + Server Actions

**Files:**
- Create: `lib/validations/auth.ts`
- Create: `lib/validations/auth.test.ts`
- Create: `lib/actions/auth.ts`

- [ ] **Step 1: Write failing validation tests**

  Create `lib/validations/auth.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { loginSchema } from './auth'

  describe('loginSchema', () => {
    it('rejects empty employee_id', () => {
      const result = loginSchema.safeParse({ employee_id: '', company_slug: 'grofast', password: 'pass' })
      expect(result.success).toBe(false)
      expect(result.error?.errors[0].message).toBe('Employee ID is required')
    })

    it('rejects missing company_slug', () => {
      const result = loginSchema.safeParse({ employee_id: 'GF001', company_slug: '', password: 'pass' })
      expect(result.success).toBe(false)
    })

    it('accepts valid input and builds email', () => {
      const result = loginSchema.safeParse({ employee_id: 'GF001', company_slug: 'grofast', password: 'secret123' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.email).toBe('GF001@grofast.internal')
      }
    })
  })
  ```

- [ ] **Step 2: Run to confirm failure**

  ```bash
  pnpm test --run lib/validations/auth.test.ts
  ```

  Expected: FAIL — `Cannot find module './auth'`

- [ ] **Step 3: Create lib/validations/auth.ts**

  ```typescript
  import { z } from 'zod'

  export const loginSchema = z
    .object({
      employee_id: z.string().min(1, 'Employee ID is required'),
      company_slug: z.string().min(1, 'Company is required'),
      password: z.string().min(1, 'Password is required'),
    })
    .transform((val) => ({
      ...val,
      email: `${val.employee_id}@${val.company_slug}.internal`,
    }))

  export type LoginInput = z.infer<typeof loginSchema>
  ```

- [ ] **Step 4: Run to confirm pass**

  ```bash
  pnpm test --run lib/validations/auth.test.ts
  ```

  Expected: PASS (3 tests)

- [ ] **Step 5: Create lib/actions/auth.ts**

  ```typescript
  'use server'

  import { createServerClient } from '@/lib/supabase/server'
  import { redirect } from 'next/navigation'
  import { loginSchema } from '@/lib/validations/auth'

  export async function loginAction(
    _prev: { error: string } | null,
    formData: FormData
  ): Promise<{ error: string } | null> {
    const raw = {
      employee_id: formData.get('employee_id') as string,
      company_slug: formData.get('company_slug') as string,
      password: formData.get('password') as string,
    }

    const parsed = loginSchema.safeParse(raw)
    if (!parsed.success) {
      return { error: parsed.error.errors[0].message }
    }

    const supabase = await createServerClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    })

    if (error) {
      return { error: 'Invalid Employee ID or password' }
    }

    redirect('/')
  }

  export async function logoutAction(): Promise<void> {
    const supabase = await createServerClient()
    await supabase.auth.signOut()
    redirect('/login')
  }
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add lib/validations/auth.ts lib/validations/auth.test.ts lib/actions/auth.ts
  git commit -m "feat: auth validation schema and server actions"
  ```

---

## Task 6: Daily Update Validations + Server Action

**Files:**
- Create: `lib/validations/daily-update.ts`
- Create: `lib/validations/daily-update.test.ts`
- Create: `lib/actions/daily-updates.ts`

- [ ] **Step 1: Write failing tests**

  Create `lib/validations/daily-update.test.ts`:

  ```typescript
  import { describe, it, expect } from 'vitest'
  import { dailyUpdateSchema } from './daily-update'

  describe('dailyUpdateSchema', () => {
    it('accepts absent status without work_type', () => {
      const result = dailyUpdateSchema.safeParse({
        attendance_status: 'absent',
      })
      expect(result.success).toBe(true)
    })

    it('requires work_type when present', () => {
      const result = dailyUpdateSchema.safeParse({
        attendance_status: 'present',
        work_type: undefined,
        working_hours: 9,
      })
      expect(result.success).toBe(false)
      expect(result.error?.errors[0].message).toBe('Work type required when present')
    })

    it('rejects working_hours over 24', () => {
      const result = dailyUpdateSchema.safeParse({
        attendance_status: 'present',
        work_type: 'office',
        working_hours: 25,
      })
      expect(result.success).toBe(false)
    })

    it('accepts valid full submission', () => {
      const result = dailyUpdateSchema.safeParse({
        attendance_status: 'present',
        work_type: 'office',
        working_hours: 9,
        learning_hours: 1,
        shoot_count: 3,
        notes: 'Good day',
      })
      expect(result.success).toBe(true)
    })
  })
  ```

- [ ] **Step 2: Run to confirm failure**

  ```bash
  pnpm test --run lib/validations/daily-update.test.ts
  ```

  Expected: FAIL

- [ ] **Step 3: Create lib/validations/daily-update.ts**

  ```typescript
  import { z } from 'zod'

  export const shootEntrySchema = z.object({
    client_name: z.string().min(1, 'Client name required'),
    shoot_type: z.string().min(1, 'Shoot type required'),
    video_count: z.number().int().min(1),
    notes: z.string().optional(),
  })

  export const editingEntrySchema = z.object({
    client_name: z.string().min(1, 'Client name required'),
    editing_hours: z.number().min(0.5).max(24),
    folder_link: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  })

  export const dailyUpdateSchema = z
    .object({
      attendance_status: z.enum(['present', 'absent', 'holiday', 'outside']),
      work_type: z.enum(['office', 'outside', 'wfh']).optional(),
      working_hours: z.number().min(0).max(24).optional(),
      learning_hours: z.number().min(0).max(24).default(0),
      shoot_count: z.number().int().min(0).default(0),
      notes: z.string().optional(),
      shoot_entries: z.array(shootEntrySchema).optional().default([]),
      editing_entries: z.array(editingEntrySchema).optional().default([]),
    })
    .superRefine((val, ctx) => {
      if (val.attendance_status === 'present' && !val.work_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Work type required when present',
          path: ['work_type'],
        })
      }
    })

  export type DailyUpdateInput = z.infer<typeof dailyUpdateSchema>
  export type ShootEntryInput = z.infer<typeof shootEntrySchema>
  export type EditingEntryInput = z.infer<typeof editingEntrySchema>
  ```

- [ ] **Step 4: Run to confirm pass**

  ```bash
  pnpm test --run lib/validations/daily-update.test.ts
  ```

  Expected: PASS (4 tests)

- [ ] **Step 5: Create lib/actions/daily-updates.ts**

  ```typescript
  'use server'

  import { createServerClient } from '@/lib/supabase/server'
  import { revalidatePath } from 'next/cache'
  import { dailyUpdateSchema, type DailyUpdateInput } from '@/lib/validations/daily-update'

  export async function submitDailyUpdate(
    input: DailyUpdateInput
  ): Promise<{ success: boolean; error?: string }> {
    const parsed = dailyUpdateSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0].message }
    }

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const claims = JSON.parse(atob(user.user_metadata?.access_token?.split('.')[1] ?? 'e30='))
    const company_id = claims.company_id as string

    const today = new Date().toISOString().split('T')[0]

    const { data: update, error: updateError } = await supabase
      .from('daily_updates')
      .insert({
        company_id,
        user_id: user.id,
        date: today,
        attendance_status: parsed.data.attendance_status,
        work_type: parsed.data.work_type ?? null,
        working_hours: parsed.data.working_hours ?? null,
        learning_hours: parsed.data.learning_hours,
        shoot_count: parsed.data.shoot_count,
        notes: parsed.data.notes ?? null,
      })
      .select('id')
      .single()

    if (updateError) {
      if (updateError.code === '23505') {
        return { success: false, error: 'Already submitted today' }
      }
      return { success: false, error: updateError.message }
    }

    if (parsed.data.shoot_entries.length > 0) {
      const { error: shootError } = await supabase.from('shoot_entries').insert(
        parsed.data.shoot_entries.map((entry) => ({
          company_id,
          user_id: user.id,
          daily_update_id: update.id,
          client_name: entry.client_name,
          shoot_type: entry.shoot_type,
          video_count: entry.video_count,
          notes: entry.notes ?? null,
        }))
      )
      if (shootError) return { success: false, error: shootError.message }
    }

    if (parsed.data.editing_entries.length > 0) {
      const { error: editError } = await supabase.from('editing_entries').insert(
        parsed.data.editing_entries.map((entry) => ({
          company_id,
          user_id: user.id,
          daily_update_id: update.id,
          client_name: entry.client_name,
          editing_hours: entry.editing_hours,
          folder_link: entry.folder_link || null,
        }))
      )
      if (editError) return { success: false, error: editError.message }
    }

    revalidatePath('/member/update')
    revalidatePath('/admin/activities')
    return { success: true }
  }

  export async function getTodayUpdate() {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('daily_updates')
      .select('*, shoot_entries(*), editing_entries(*)')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    return data
  }
  ```

  > **Note on company_id extraction:** In production, company_id comes from the JWT claim (injected by the Postgres hook from Task 4). The server action reads it from the session's JWT. If you see `undefined` in development, ensure the auth hook is enabled in Supabase and the user was created after the hook was wired up.

- [ ] **Step 6: Commit**

  ```bash
  git add lib/validations/daily-update.ts lib/validations/daily-update.test.ts lib/actions/daily-updates.ts
  git commit -m "feat: daily update validation schema and server action"
  ```

---

## Task 7: Auth Middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Create middleware.ts**

  ```typescript
  import { createServerClient } from '@supabase/ssr'
  import { NextResponse } from 'next/server'
  import type { NextRequest } from 'next/server'

  function parseJwtClaims(accessToken: string): Record<string, string> {
    try {
      const payload = accessToken.split('.')[1]
      return JSON.parse(atob(payload))
    } catch {
      return {}
    }
  }

  export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            )
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const {
      data: { session },
    } = await supabase.auth.getSession()

    const pathname = request.nextUrl.pathname

    if (!session) {
      if (pathname === '/login') return supabaseResponse
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const claims = parseJwtClaims(session.access_token)
    const role = claims.role as string | undefined

    if (pathname === '/login' || pathname === '/') {
      const dest = role === 'ADMIN' ? '/admin/dashboard' : '/member/dashboard'
      return NextResponse.redirect(new URL(dest, request.url))
    }

    if (pathname.startsWith('/admin') && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/member/dashboard', request.url))
    }

    if (pathname.startsWith('/member') && role !== 'MEMBER') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url))
    }

    return supabaseResponse
  }

  export const config = {
    matcher: [
      '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
  }
  ```

- [ ] **Step 2: Type-check**

  ```bash
  pnpm typecheck
  ```

  Expected: No errors.

- [ ] **Step 3: Commit**

  ```bash
  git add middleware.ts
  git commit -m "feat: auth middleware with role-based routing"
  ```

---

## Task 8: Login Page

**Files:**
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/login/login-form.tsx`

- [ ] **Step 1: Create app/(auth)/login/login-form.tsx**

  ```tsx
  'use client'

  import { useActionState } from 'react'
  import { loginAction } from '@/lib/actions/auth'

  const initialState = null

  export function LoginForm() {
    const [state, formAction, isPending] = useActionState(loginAction, initialState)

    return (
      <form action={formAction} className="flex flex-col gap-4">
        {state?.error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {state.error}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="company_slug" className="text-sm font-medium text-gray-700">
            Company
          </label>
          <input
            id="company_slug"
            name="company_slug"
            type="text"
            defaultValue="grofast"
            required
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            placeholder="grofast"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="employee_id" className="text-sm font-medium text-gray-700">
            Employee ID
          </label>
          <input
            id="employee_id"
            name="employee_id"
            type="text"
            required
            autoComplete="username"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            placeholder="GF001"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    )
  }
  ```

- [ ] **Step 2: Create app/(auth)/login/page.tsx**

  ```tsx
  import { LoginForm } from './login-form'

  export const metadata = { title: 'Sign In — GroFast' }

  export default function LoginPage() {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream p-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="font-display text-2xl font-bold text-gray-900">GroFast</h1>
            <p className="mt-1 text-sm text-gray-500">Sign in to your workspace</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <LoginForm />
          </div>
        </div>
      </main>
    )
  }
  ```

- [ ] **Step 3: Manual test — start dev server**

  ```bash
  pnpm dev
  ```

  Navigate to `http://localhost:3000/login`.
  Verify: form renders, submitting invalid credentials shows "Invalid Employee ID or password".

- [ ] **Step 4: Commit**

  ```bash
  git add app/'(auth)'/login/
  git commit -m "feat: login page with employee id + company slug"
  ```

---

## Task 9: Update Admin Layout — Real Auth Guard

**Files:**
- Modify: `app/(admin)/layout.tsx`

- [ ] **Step 1: Read existing layout**

  Read `app/(admin)/layout.tsx` — note current structure (Sidebar + `ml-[260px]` wrapper).

- [ ] **Step 2: Replace mock guard with real Supabase check**

  Replace the full content of `app/(admin)/layout.tsx`:

  ```tsx
  import { redirect } from 'next/navigation'
  import { createServerClient } from '@/lib/supabase/server'
  import { Sidebar } from '@/components/admin/sidebar'

  export default async function AdminLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
      .from('users')
      .select('role, name, employee_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'ADMIN') redirect('/member/dashboard')

    return (
      <div className="flex min-h-screen">
        <Sidebar userName={profile.name} employeeId={profile.employee_id} />
        <main className="ml-[260px] flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    )
  }
  ```

- [ ] **Step 3: Update Sidebar to accept props**

  Open `components/admin/sidebar.tsx`. Find where the user name is hardcoded. Add props to the component signature:

  ```tsx
  interface SidebarProps {
    userName: string
    employeeId: string
  }

  export function Sidebar({ userName, employeeId }: SidebarProps) {
    // replace hardcoded name with userName
    // replace hardcoded ID with employeeId
  }
  ```

  Update the two spots in the JSX that show the user's name/ID to use the props. Keep everything else identical.

- [ ] **Step 4: Type-check**

  ```bash
  pnpm typecheck
  ```

  Expected: No errors.

- [ ] **Step 5: Commit**

  ```bash
  git add app/'(admin)'/layout.tsx components/admin/sidebar.tsx
  git commit -m "feat: admin layout with real supabase auth guard"
  ```

---

## Task 10: Member Layout + Member Dashboard

**Files:**
- Create: `app/(member)/layout.tsx`
- Create: `app/(member)/dashboard/page.tsx`

- [ ] **Step 1: Create app/(member)/layout.tsx**

  ```tsx
  import { redirect } from 'next/navigation'
  import { createServerClient } from '@/lib/supabase/server'
  import { MemberNav } from '@/components/member/member-nav'

  export default async function MemberLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
      .from('users')
      .select('role, name, employee_id, department_id, departments(name)')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'MEMBER') redirect('/admin/dashboard')

    return (
      <div className="flex min-h-screen flex-col bg-cream">
        <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-base font-bold text-gray-900">GroFast</p>
              <p className="text-xs text-gray-500">{profile.name} · {profile.employee_id}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-20">
          {children}
        </main>

        <MemberNav />
      </div>
    )
  }
  ```

- [ ] **Step 2: Create components/member/member-nav.tsx**

  ```tsx
  'use client'

  import Link from 'next/link'
  import { usePathname } from 'next/navigation'
  import { LayoutDashboard, ClipboardList, CalendarOff, User } from 'lucide-react'

  const links = [
    { href: '/member/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/member/update', label: 'Update', icon: ClipboardList },
    { href: '/member/leaves', label: 'Leave', icon: CalendarOff },
    { href: '/member/profile', label: 'Profile', icon: User },
  ]

  export function MemberNav() {
    const pathname = usePathname()

    return (
      <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-gray-100 bg-white">
        <div className="flex items-center justify-around px-2 py-2">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${
                  active ? 'text-brand' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    )
  }
  ```

- [ ] **Step 3: Create app/(member)/dashboard/page.tsx**

  ```tsx
  import { createServerClient } from '@/lib/supabase/server'
  import { getTodayUpdate } from '@/lib/actions/daily-updates'

  function formatHours(h: number | null) {
    if (!h) return '—'
    return `${h}h`
  }

  export default async function MemberDashboard() {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const today = getTodayUpdate()

    const { data: profile } = await supabase
      .from('users')
      .select('name, employee_id, departments(name)')
      .eq('id', user!.id)
      .single()

    const [todayUpdate, recentUpdates] = await Promise.all([
      today,
      supabase
        .from('daily_updates')
        .select('date, attendance_status, working_hours, shoot_count')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
        .limit(7)
        .then(({ data }) => data ?? []),
    ])

    const now = new Date()
    const greeting =
      now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening'

    return (
      <div className="p-4 space-y-4">
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">
            {greeting}, {profile?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-gray-500">
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Today's status card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Today</p>
          {todayUpdate ? (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 capitalize">
                  {todayUpdate.attendance_status}
                </span>
                {todayUpdate.work_type && (
                  <span className="text-xs text-gray-500 capitalize">{todayUpdate.work_type}</span>
                )}
              </div>
              <p className="text-sm text-gray-600">
                Hours: {formatHours(todayUpdate.working_hours)} · Shoots: {todayUpdate.shoot_count}
              </p>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm text-gray-500">No update submitted yet</p>
              <a
                href="/member/update"
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
              >
                Submit now
              </a>
            </div>
          )}
        </div>

        {/* Recent entries */}
        {recentUpdates.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Recent entries</h2>
            <div className="space-y-2">
              {recentUpdates.map((entry) => (
                <div
                  key={entry.date}
                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {new Date(entry.date).toLocaleDateString('en-IN', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">{entry.attendance_status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-gray-800">{formatHours(entry.working_hours)}</p>
                    {entry.shoot_count > 0 && (
                      <p className="text-xs text-gray-500">{entry.shoot_count} shoots</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 4: Type-check**

  ```bash
  pnpm typecheck
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add app/'(member)'/ components/member/
  git commit -m "feat: member layout with bottom nav and dashboard"
  ```

---

## Task 11: Member Daily Update Form

**Files:**
- Create: `app/(member)/update/page.tsx`
- Create: `components/member/daily-update-form.tsx`

- [ ] **Step 1: Create app/(member)/update/page.tsx**

  ```tsx
  import { createServerClient } from '@/lib/supabase/server'
  import { DailyUpdateForm } from '@/components/member/daily-update-form'

  export const metadata = { title: 'Daily Update — GroFast' }

  export default async function UpdatePage() {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    const today = new Date().toISOString().split('T')[0]

    const { data: existing } = await supabase
      .from('daily_updates')
      .select('id, attendance_status, working_hours, shoot_count, created_at')
      .eq('user_id', user!.id)
      .eq('date', today)
      .single()

    if (existing) {
      return (
        <div className="p-4">
          <div className="rounded-2xl border border-green-100 bg-green-50 p-5">
            <h2 className="font-semibold text-green-800">Today's update submitted</h2>
            <p className="mt-1 text-sm text-green-700 capitalize">
              Status: {existing.attendance_status} · Hours: {existing.working_hours ?? '—'} · Shoots: {existing.shoot_count}
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="p-4">
        <h1 className="mb-4 font-display text-lg font-bold text-gray-900">Daily Update</h1>
        <DailyUpdateForm />
      </div>
    )
  }
  ```

- [ ] **Step 2: Create components/member/daily-update-form.tsx**

  ```tsx
  'use client'

  import { useState, useTransition } from 'react'
  import { useForm, useFieldArray } from 'react-hook-form'
  import { zodResolver } from '@hookform/resolvers/zod'
  import { Plus, Trash2 } from 'lucide-react'
  import { dailyUpdateSchema, type DailyUpdateInput } from '@/lib/validations/daily-update'
  import { submitDailyUpdate } from '@/lib/actions/daily-updates'

  export function DailyUpdateForm() {
    const [isPending, startTransition] = useTransition()
    const [serverError, setServerError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)

    const {
      register,
      control,
      handleSubmit,
      watch,
      formState: { errors },
    } = useForm<DailyUpdateInput>({
      resolver: zodResolver(dailyUpdateSchema),
      defaultValues: {
        attendance_status: 'present',
        learning_hours: 0,
        shoot_count: 0,
        shoot_entries: [],
        editing_entries: [],
      },
    })

    const { fields: shootFields, append: addShoot, remove: removeShoot } = useFieldArray({
      control,
      name: 'shoot_entries',
    })

    const { fields: editFields, append: addEdit, remove: removeEdit } = useFieldArray({
      control,
      name: 'editing_entries',
    })

    const attendanceStatus = watch('attendance_status')
    const isPresent = attendanceStatus === 'present' || attendanceStatus === 'outside'

    function onSubmit(data: DailyUpdateInput) {
      setServerError(null)
      startTransition(async () => {
        const result = await submitDailyUpdate(data)
        if (result.success) {
          setSuccess(true)
        } else {
          setServerError(result.error ?? 'Something went wrong')
        }
      })
    }

    if (success) {
      return (
        <div className="rounded-2xl border border-green-100 bg-green-50 p-5">
          <h2 className="font-semibold text-green-800">Update submitted!</h2>
          <p className="mt-1 text-sm text-green-700">Your daily update has been recorded.</p>
        </div>
      )
    }

    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {serverError && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{serverError}</p>
        )}

        {/* Attendance Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Attendance</label>
          <div className="grid grid-cols-2 gap-2">
            {(['present', 'absent', 'holiday', 'outside'] as const).map((s) => (
              <label
                key={s}
                className="flex items-center gap-2 rounded-xl border border-gray-200 p-3 cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-brand/5"
              >
                <input type="radio" value={s} {...register('attendance_status')} className="accent-brand" />
                <span className="text-sm font-medium capitalize">{s}</span>
              </label>
            ))}
          </div>
        </div>

        {isPresent && (
          <>
            {/* Work Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Work Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['office', 'outside', 'wfh'] as const).map((w) => (
                  <label
                    key={w}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 p-2.5 cursor-pointer has-[:checked]:border-brand has-[:checked]:bg-brand/5"
                  >
                    <input type="radio" value={w} {...register('work_type')} className="accent-brand" />
                    <span className="text-xs font-medium uppercase">{w}</span>
                  </label>
                ))}
              </div>
              {errors.work_type && (
                <p className="mt-1 text-xs text-red-500">{errors.work_type.message}</p>
              )}
            </div>

            {/* Hours */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Working Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  {...register('working_hours', { valueAsNumber: true })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  placeholder="9"
                />
                {errors.working_hours && (
                  <p className="mt-1 text-xs text-red-500">{errors.working_hours.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Learning Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  {...register('learning_hours', { valueAsNumber: true })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Shoot Tracking */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">Shoot Entries</h3>
                <button
                  type="button"
                  onClick={() => addShoot({ client_name: '', shoot_type: '', video_count: 1 })}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              {shootFields.map((field, i) => (
                <div key={field.id} className="mb-2 rounded-xl border border-gray-100 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      {...register(`shoot_entries.${i}.client_name`)}
                      placeholder="Client name"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                    <input
                      {...register(`shoot_entries.${i}.shoot_type`)}
                      placeholder="Shoot type"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      {...register(`shoot_entries.${i}.video_count`, { valueAsNumber: true })}
                      placeholder="# videos"
                      className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => removeShoot(i)}
                      className="ml-auto rounded-lg p-1.5 text-red-400 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Editing Tracking */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-700">Editing Entries</h3>
                <button
                  type="button"
                  onClick={() => addEdit({ client_name: '', editing_hours: 1, folder_link: '' })}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              {editFields.map((field, i) => (
                <div key={field.id} className="mb-2 rounded-xl border border-gray-100 p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      {...register(`editing_entries.${i}.client_name`)}
                      placeholder="Client name"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      {...register(`editing_entries.${i}.editing_hours`, { valueAsNumber: true })}
                      placeholder="Hours"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      {...register(`editing_entries.${i}.folder_link`)}
                      placeholder="Google Drive link (optional)"
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => removeEdit(i)}
                      className="rounded-lg p-1.5 text-red-400 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
          <textarea
            {...register('notes')}
            rows={3}
            placeholder="Anything to add..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-xl bg-brand py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          {isPending ? 'Submitting…' : 'Submit Daily Update'}
        </button>
      </form>
    )
  }
  ```

- [ ] **Step 3: Install zod resolver**

  ```bash
  pnpm add @hookform/resolvers
  ```

- [ ] **Step 4: Type-check**

  ```bash
  pnpm typecheck
  ```

- [ ] **Step 5: Manual test**

  With dev server running, log in as a MEMBER. Navigate to `/member/update`.
  - Submit without work_type while status = "present" → should show validation error
  - Add a shoot entry, fill all fields, submit → should show success
  - Reload page → should show "Today's update submitted"

- [ ] **Step 6: Commit**

  ```bash
  git add app/'(member)'/update/ components/member/daily-update-form.tsx
  git commit -m "feat: member daily update form with shoot and editing entries"
  ```

---

## Task 12: Admin Activities Page

**Files:**
- Create: `app/(admin)/activities/page.tsx`

- [ ] **Step 1: Create app/(admin)/activities/page.tsx**

  ```tsx
  import { createServerClient } from '@/lib/supabase/server'
  import { Users, Clock, Camera, Scissors } from 'lucide-react'

  interface SearchParams {
    date?: string
    dept?: string
  }

  export const metadata = { title: 'Activities — GroFast Admin' }

  export default async function ActivitiesPage({
    searchParams,
  }: {
    searchParams: Promise<SearchParams>
  }) {
    const params = await searchParams
    const supabase = await createServerClient()

    const today = new Date().toISOString().split('T')[0]
    const filterDate = params.date ?? today

    const departments = await supabase
      .from('departments')
      .select('id, name')
      .order('name')
      .then(({ data }) => data ?? [])

    let query = supabase
      .from('daily_updates')
      .select(`
        id, date, attendance_status, work_type, working_hours,
        learning_hours, shoot_count, notes,
        users (id, name, employee_id, department_id, departments(name)),
        shoot_entries (id, client_name, shoot_type, video_count),
        editing_entries (id, client_name, editing_hours, folder_link)
      `)
      .eq('date', filterDate)
      .order('created_at', { ascending: false })

    if (params.dept) {
      query = query.eq('users.department_id', params.dept)
    }

    const { data: updates } = await query

    const totalHours = updates?.reduce((sum, u) => sum + (u.working_hours ?? 0), 0) ?? 0
    const presentCount = updates?.filter((u) => u.attendance_status === 'present' || u.attendance_status === 'outside').length ?? 0

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">Daily Activities</h1>
            <p className="text-sm text-gray-500">{new Date(filterDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>

          {/* Filters */}
          <form className="flex items-center gap-2" method="GET">
            <input
              type="date"
              name="date"
              defaultValue={filterDate}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
            <select
              name="dept"
              defaultValue={params.dept ?? ''}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <option value="">All Teams</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Filter
            </button>
          </form>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Entries', value: updates?.length ?? 0, icon: Users },
            { label: 'Present', value: presentCount, icon: Users },
            { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, icon: Clock },
            { label: 'Avg Hours', value: updates?.length ? `${(totalHours / updates.length).toFixed(1)}h` : '—', icon: Clock },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-gray-100 bg-white p-4">
              <Icon size={16} className="text-gray-400" />
              <p className="mt-2 text-xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>

        {/* Entries table */}
        {!updates?.length ? (
          <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500">
            No updates found for this date.
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Work Hrs</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Learn Hrs</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Shoots</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {updates.map((entry) => {
                    const user = entry.users as { name: string; employee_id: string; departments: { name: string } | null } | null
                    return (
                      <tr key={entry.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{user?.name ?? '—'}</p>
                          <p className="text-xs text-gray-400">{user?.employee_id}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {user?.departments?.name ?? '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            entry.attendance_status === 'present' || entry.attendance_status === 'outside'
                              ? 'bg-green-50 text-green-700'
                              : entry.attendance_status === 'absent'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-yellow-50 text-yellow-700'
                          }`}>
                            {entry.attendance_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 uppercase">{entry.work_type ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-sm">
                          <span className={entry.working_hours && entry.working_hours < 9 ? 'text-red-500 font-medium' : 'text-gray-700'}>
                            {entry.working_hours ?? '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">{entry.learning_hours ?? 0}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-600">{entry.shoot_count}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate">{entry.notes ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 2: Type-check + run all tests**

  ```bash
  pnpm typecheck && pnpm test --run
  ```

  Expected: No type errors. All tests pass.

- [ ] **Step 3: Manual test**

  Log in as ADMIN. Navigate to `/admin/activities`.
  - Verify today's date is selected by default
  - Submit a daily update as a MEMBER, then reload admin activities — entry should appear
  - Hours below 9 should show in red
  - Date filter and department filter should work

- [ ] **Step 4: Commit**

  ```bash
  git add app/'(admin)'/activities/
  git commit -m "feat: admin activities page with date and department filter"
  ```

---

## Phase 1 Complete — Checklist

- [ ] Supabase packages installed
- [ ] Database schema migrated in Supabase (all 7 tables)
- [ ] JWT claims hook enabled in Supabase Auth Hooks
- [ ] `.env.local` configured (not committed)
- [ ] `lib/supabase/server.ts` + `client.ts` created
- [ ] Auth validation tests passing
- [ ] Daily update validation tests passing
- [ ] Middleware routes ADMIN → `/admin/dashboard`, MEMBER → `/member/dashboard`
- [ ] Login page working with real Supabase auth
- [ ] Admin layout protected (redirects non-admins)
- [ ] Member layout with bottom nav
- [ ] Member can submit daily update (idempotent — one per day)
- [ ] Member dashboard shows today's status + recent 7 days
- [ ] Admin activities page shows all entries with date/dept filters

---

## What's NOT in This Plan (Next Plans)

- **Phase 2**: Client system + folder links, Leave/Permission system with status workflow, WFH session clock-in/out
- **Phase 3**: Google Sheets bidirectional sync (n8n + Sheets API), WhatsApp alerts on leave submission (n8n + WhatsApp API), Working hours analytics with underperformance alerts
