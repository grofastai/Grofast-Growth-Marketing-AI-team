CREATE TABLE IF NOT EXISTS task_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL,
  company_id UUID        NOT NULL,
  comment    TEXT        NOT NULL CHECK (char_length(comment) > 0 AND char_length(comment) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON task_comments
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id    ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_company_id ON task_comments(company_id);
