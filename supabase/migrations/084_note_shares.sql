-- 084_note_shares.sql — Notes Hub Phase 2: sharing
CREATE TABLE IF NOT EXISTS note_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  note_id     uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  shared_with uuid NOT NULL,
  permission  text NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
  shared_by   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, shared_with)
);
CREATE INDEX IF NOT EXISTS idx_note_shares_user    ON note_shares (shared_with);
CREATE INDEX IF NOT EXISTS idx_note_shares_company ON note_shares (company_id);

ALTER TABLE note_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_note_shares ON note_shares;
CREATE POLICY tenant_isolation_note_shares ON note_shares
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
