-- ── 1. Documents storage bucket + policies ─────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "documents_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Public read
CREATE POLICY "documents_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');

-- Authenticated users can delete
CREATE POLICY "documents_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents');

-- ── 2. Documents metadata table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  uploaded_by  uuid NOT NULL REFERENCES users(id),
  name         text NOT NULL,
  file_url     text NOT NULL,
  file_type    text,
  file_size    bigint,
  doc_type     text NOT NULL DEFAULT 'Other',
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: admin can see all docs in their company
CREATE POLICY "documents_select"
ON documents FOR SELECT
TO authenticated
USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Admin can insert
CREATE POLICY "documents_insert"
ON documents FOR INSERT
TO authenticated
WITH CHECK (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  AND (auth.jwt() ->> 'role') = 'ADMIN'
);

-- Admin can delete
CREATE POLICY "documents_delete_row"
ON documents FOR DELETE
TO authenticated
USING (
  company_id = (auth.jwt() ->> 'company_id')::uuid
  AND (auth.jwt() ->> 'role') = 'ADMIN'
);

-- Index for fast per-company lookups
CREATE INDEX IF NOT EXISTS documents_company_id_idx ON documents(company_id);
CREATE INDEX IF NOT EXISTS documents_user_id_idx    ON documents(user_id);
