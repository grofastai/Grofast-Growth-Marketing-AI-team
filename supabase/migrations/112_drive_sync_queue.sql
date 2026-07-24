-- Retry queue for documents/KYC files whose Google Drive sync failed on
-- first attempt. Rows are only ever inserted on failure — successful
-- syncs go straight to `member_documents` and never touch this table.
CREATE TABLE IF NOT EXISTS drive_sync_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  storage_path     text NOT NULL,
  mime_type        text NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'failed')),
  attempts         int NOT NULL DEFAULT 0,
  last_error       text,
  last_attempt_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE drive_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON drive_sync_queue
  FOR ALL USING (
    company_id = (auth.jwt() ->> 'company_id')::uuid
  );

CREATE INDEX IF NOT EXISTS drive_sync_queue_status_idx ON drive_sync_queue(status);
