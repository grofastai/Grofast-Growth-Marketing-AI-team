-- ============================================================
-- GroFast Team Tracking — Full Schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  plan        text NOT NULL DEFAULT 'free',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS departments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  employee_id   text NOT NULL,
  role          text NOT NULL CHECK (role IN ('ADMIN', 'MEMBER')),
  name          text NOT NULL,
  email         text,
  phone         text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, employee_id)
);

CREATE TABLE IF NOT EXISTS daily_updates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date              date NOT NULL DEFAULT CURRENT_DATE,
  attendance_status text NOT NULL DEFAULT 'present'
                    CHECK (attendance_status IN ('present', 'absent', 'holiday', 'outside')),
  work_type         text CHECK (work_type IN ('office', 'outside', 'wfh')),
  working_hours     numeric(4,1),
  learning_hours    numeric(4,1) NOT NULL DEFAULT 0,
  shoot_count       integer NOT NULL DEFAULT 0,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS shoot_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_update_id  uuid NOT NULL REFERENCES daily_updates(id) ON DELETE CASCADE,
  client_name      text NOT NULL,
  shoot_type       text NOT NULL,
  video_count      integer NOT NULL DEFAULT 0,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS editing_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  daily_update_id  uuid NOT NULL REFERENCES daily_updates(id) ON DELETE CASCADE,
  client_name      text NOT NULL,
  editing_hours    numeric(4,1) NOT NULL DEFAULT 0,
  folder_link      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leaves (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_date   date NOT NULL,
  to_date     date NOT NULL,
  reason      text NOT NULL,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_updates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shoot_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE editing_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaves          ENABLE ROW LEVEL SECURITY;

-- Drop existing policies before recreating (safe to re-run)
DROP POLICY IF EXISTS "tenant_read_company"    ON companies;
DROP POLICY IF EXISTS "tenant_departments"     ON departments;
DROP POLICY IF EXISTS "tenant_read_users"      ON users;
DROP POLICY IF EXISTS "admin_write_users"      ON users;
DROP POLICY IF EXISTS "admin_update_users"     ON users;
DROP POLICY IF EXISTS "tenant_daily_updates"   ON daily_updates;
DROP POLICY IF EXISTS "tenant_shoot_entries"   ON shoot_entries;
DROP POLICY IF EXISTS "tenant_editing_entries" ON editing_entries;
DROP POLICY IF EXISTS "tenant_leaves"          ON leaves;

-- companies: only same-tenant users can read their own company
CREATE POLICY "tenant_read_company" ON companies
  FOR SELECT USING (id = (auth.jwt() ->> 'company_id')::uuid);

-- departments: tenant isolation
CREATE POLICY "tenant_departments" ON departments
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- users: tenant isolation (read all in same company)
CREATE POLICY "tenant_read_users" ON users
  FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- users: admin can insert/update/delete; member can only update own row
CREATE POLICY "admin_write_users" ON users
  FOR INSERT WITH CHECK ((auth.jwt() ->> 'role') = 'ADMIN');

CREATE POLICY "admin_update_users" ON users
  FOR UPDATE USING (
    (auth.jwt() ->> 'role') = 'ADMIN'
    OR id = auth.uid()
  );

-- daily_updates: tenant isolation; member sees only own rows; admin sees all
CREATE POLICY "tenant_daily_updates" ON daily_updates
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (
      (auth.jwt() ->> 'role') = 'ADMIN'
      OR user_id = auth.uid()
    )
  );

-- shoot_entries: same as daily_updates
CREATE POLICY "tenant_shoot_entries" ON shoot_entries
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (
      (auth.jwt() ->> 'role') = 'ADMIN'
      OR user_id = auth.uid()
    )
  );

-- editing_entries: same as daily_updates
CREATE POLICY "tenant_editing_entries" ON editing_entries
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (
      (auth.jwt() ->> 'role') = 'ADMIN'
      OR user_id = auth.uid()
    )
  );

-- leaves: tenant isolation; member sees own; admin sees all
CREATE POLICY "tenant_leaves" ON leaves
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (
      (auth.jwt() ->> 'role') = 'ADMIN'
      OR user_id = auth.uid()
    )
  );

-- ============================================================
-- JWT CUSTOM CLAIMS HOOK
-- Injects company_id, role, employee_id into the access token
-- ============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims      jsonb;
  user_row    record;
BEGIN
  SELECT company_id, role, employee_id
    INTO user_row
    FROM public.users
   WHERE id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  IF user_row IS NOT NULL THEN
    claims := jsonb_set(claims, '{company_id}', to_jsonb(user_row.company_id::text));
    claims := jsonb_set(claims, '{role}',       to_jsonb(user_row.role));
    claims := jsonb_set(claims, '{employee_id}',to_jsonb(user_row.employee_id));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grant execute permission to the supabase_auth_admin role
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

-- ============================================================
-- SEED: Create GroFast company + first admin
-- Run section below AFTER the schema, separately if needed
-- ============================================================

-- Step 1: Insert company
-- INSERT INTO companies (name, slug, plan) VALUES ('GroFast', 'grofast', 'pro');

-- Step 2: Create auth user via Supabase dashboard or API, then:
-- INSERT INTO users (id, company_id, employee_id, role, name, email, phone)
-- VALUES (
--   '<auth_user_id_from_supabase>',
--   (SELECT id FROM companies WHERE slug = 'grofast'),
--   'GF001',
--   'ADMIN',
--   'Sajetha',
--   'GF001@grofast.internal',
--   '91XXXXXXXXXX'
-- );
