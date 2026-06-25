-- 085_note_attachments.sql — Notes Hub Phase 3: attachments (voice notes)
CREATE TABLE IF NOT EXISTS note_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  note_id    uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('audio','file')),
  url        text NOT NULL,
  filename   text,
  duration   int,
  size       int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments (note_id);

ALTER TABLE note_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_note_attachments ON note_attachments;
CREATE POLICY tenant_isolation_note_attachments ON note_attachments
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
