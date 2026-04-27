-- ============================================================
-- GroFast — Projects table
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS projects (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  business_name  text NOT NULL,
  client_name    text NOT NULL,
  location       text,
  status         text NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'completed', 'on_hold')),
  deadline       date,
  progress_pct   integer NOT NULL DEFAULT 0
                 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_projects" ON projects;

-- Tenant isolation: all roles can read; admin can write
CREATE POLICY "tenant_projects" ON projects
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
