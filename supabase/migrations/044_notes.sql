-- Member notes with optional reminders (Google Keep style)
CREATE TABLE notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text,
  content     text        NOT NULL,
  color       text        NOT NULL DEFAULT '#FFFFFF',
  pinned      boolean     NOT NULL DEFAULT false,
  reminder_at timestamptz,
  reminded    boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notes_own" ON notes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_notes_user      ON notes (user_id, created_at DESC);
CREATE INDEX idx_notes_reminders ON notes (reminder_at) WHERE reminded = false AND reminder_at IS NOT NULL;
