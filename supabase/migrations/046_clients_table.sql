-- Supabase-backed clients table so admin changes immediately reflect
-- in the member panel without Google Sheets caching delays.
-- Google Sheets data is synced here on every admin clients page load.

CREATE TABLE IF NOT EXISTS clients (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  contact_name text,
  industry     text,
  location     text,
  service      text,
  package_name text,
  status       text        NOT NULL DEFAULT 'active',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, name)
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON clients
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
  );

CREATE POLICY "admin_write" ON clients
  FOR INSERT WITH CHECK (
    (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY "admin_update" ON clients
  FOR UPDATE USING (
    (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE POLICY "admin_delete" ON clients
  FOR DELETE USING (
    (auth.jwt() ->> 'role') = 'ADMIN'
  );

CREATE INDEX IF NOT EXISTS clients_company_status_idx ON clients(company_id, status);
