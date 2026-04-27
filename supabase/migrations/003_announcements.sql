-- GroFast — Announcements + Tasks tables

CREATE TABLE IF NOT EXISTS announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title       text NOT NULL,
  message     text NOT NULL,
  pinned      boolean NOT NULL DEFAULT false,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_announcements" ON announcements;
CREATE POLICY "tenant_announcements" ON announcements
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE TABLE IF NOT EXISTS tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  title       text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','completed')),
  priority    text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date    date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_tasks" ON tasks;
CREATE POLICY "tenant_tasks" ON tasks
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Add service_type to projects if not exists
ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_type text;
