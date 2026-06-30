-- Add Drive folder ID to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS drive_folder_id text;

-- Member documents table
CREATE TABLE IF NOT EXISTS member_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  file_type     text NOT NULL,
  drive_file_id text NOT NULL,
  drive_url     text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE member_documents ENABLE ROW LEVEL SECURITY;

-- Tenant isolation
CREATE POLICY "tenant_isolation" ON member_documents
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
  );

-- Members can view their own documents
CREATE POLICY "member_view_own" ON member_documents
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- Only admin can insert/delete (via service role in server actions)
CREATE INDEX IF NOT EXISTS member_documents_user_id_idx ON member_documents(user_id);
CREATE INDEX IF NOT EXISTS member_documents_company_id_idx ON member_documents(company_id);
