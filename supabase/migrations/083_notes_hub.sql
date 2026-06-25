-- 083_notes_hub.sql — Notes Knowledge Hub Phase 1
-- 1. Folders table (created BEFORE the notes FK references it)
CREATE TABLE IF NOT EXISTS note_folders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL,
  name        text NOT NULL,
  icon        text,
  parent_id   uuid REFERENCES note_folders(id) ON DELETE CASCADE,
  scope       text NOT NULL DEFAULT 'private' CHECK (scope IN ('private','team','sop')),
  owner_id    uuid,
  position    int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_note_folders_company ON note_folders (company_id, scope, position);

-- 2. Notes columns
ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS folder_id  uuid REFERENCES note_folders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope      text NOT NULL DEFAULT 'private'
    CHECK (scope IN ('private','team','sop')),
  ADD COLUMN IF NOT EXISTS body       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by uuid;

UPDATE notes SET created_by = user_id WHERE created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_notes_scope_company ON notes (company_id, scope, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_folder        ON notes (folder_id);

-- 3. Seed a "Personal" private folder per existing note owner, then migrate their notes into it
WITH owners AS (
  SELECT DISTINCT user_id, company_id FROM notes WHERE user_id IS NOT NULL
), seeded AS (
  INSERT INTO note_folders (company_id, name, icon, scope, owner_id, position)
  SELECT company_id, 'Personal', '📁', 'private', user_id, 0
  FROM owners
  RETURNING id, owner_id
)
UPDATE notes n
SET folder_id = s.id, scope = 'private'
FROM seeded s
WHERE n.user_id = s.owner_id AND n.folder_id IS NULL;

-- 4. Wrap existing plain-text content into a minimal TipTap doc so the editor renders it
UPDATE notes
SET body = jsonb_build_object(
  'type','doc',
  'content', jsonb_build_array(
    jsonb_build_object('type','paragraph','content',
      CASE WHEN coalesce(content,'') = '' THEN '[]'::jsonb
           ELSE jsonb_build_array(jsonb_build_object('type','text','text',content)) END)
  ))
WHERE body = '{}'::jsonb;

-- 5. RLS (defense-in-depth; server actions also enforce)
ALTER TABLE note_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_note_folders ON note_folders;
CREATE POLICY tenant_isolation_note_folders ON note_folders
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
