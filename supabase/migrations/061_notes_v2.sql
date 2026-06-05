ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS note_type text NOT NULL DEFAULT 'text'
    CHECK (note_type IN ('text', 'checklist')),
  ADD COLUMN IF NOT EXISTS items    jsonb   NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS labels   text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notes_archived ON notes (user_id, archived, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_labels   ON notes USING gin (labels);
