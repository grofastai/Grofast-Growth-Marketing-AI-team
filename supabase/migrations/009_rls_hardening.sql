-- ============================================================
-- RLS Hardening
-- Splits "FOR ALL" policies on tasks, projects, and announcements
-- into explicit per-operation rules so members cannot mutate
-- data they should only be reading.
-- ============================================================

-- ── tasks ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_tasks"  ON tasks;
DROP POLICY IF EXISTS "tasks_select"  ON tasks;
DROP POLICY IF EXISTS "tasks_insert"  ON tasks;
DROP POLICY IF EXISTS "tasks_update"  ON tasks;
DROP POLICY IF EXISTS "tasks_delete"  ON tasks;

-- Everyone in the company can read tasks
CREATE POLICY "tasks_select" ON tasks
  FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Only admins can create or delete tasks
CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

-- Admins can update any task; members can update only tasks assigned to them
-- (status changes for Kanban, daily update links, etc.)
CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (
      (auth.jwt() ->> 'role') = 'ADMIN'
      OR assigned_to = auth.uid()
    )
  );

-- ── projects ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_projects"  ON projects;
DROP POLICY IF EXISTS "projects_select"  ON projects;
DROP POLICY IF EXISTS "projects_write"   ON projects;
DROP POLICY IF EXISTS "projects_update"  ON projects;
DROP POLICY IF EXISTS "projects_delete"  ON projects;

-- All tenant users can read projects
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Only admins can mutate projects
CREATE POLICY "projects_write" ON projects
  FOR INSERT WITH CHECK (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

-- ── announcements ─────────────────────────────────────────────
DROP POLICY IF EXISTS "tenant_announcements"   ON announcements;
DROP POLICY IF EXISTS "announcements_select"   ON announcements;
DROP POLICY IF EXISTS "announcements_write"    ON announcements;
DROP POLICY IF EXISTS "announcements_update"   ON announcements;
DROP POLICY IF EXISTS "announcements_delete"   ON announcements;

-- All tenant users can read announcements
CREATE POLICY "announcements_select" ON announcements
  FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Only admins can create, edit, or delete announcements
CREATE POLICY "announcements_write" ON announcements
  FOR INSERT WITH CHECK (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY "announcements_update" ON announcements
  FOR UPDATE USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY "announcements_delete" ON announcements
  FOR DELETE USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
    AND (auth.jwt() ->> 'role') = 'ADMIN'
  );
