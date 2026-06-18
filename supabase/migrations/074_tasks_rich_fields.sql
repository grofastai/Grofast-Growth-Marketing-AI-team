-- Add rich task fields that the application code uses but were missing from the schema
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS category            text,
  ADD COLUMN IF NOT EXISTS manager_note        text,
  ADD COLUMN IF NOT EXISTS checklist           jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS attachments         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expected_time       text,
  ADD COLUMN IF NOT EXISTS expected_deliverable text,
  ADD COLUMN IF NOT EXISTS approval_required   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_task      text    NOT NULL DEFAULT 'none';

-- Fix status CHECK constraint to include 'review' (the code already uses it)
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'review', 'completed'));

-- Backfill: set recurring_task to 'none' for rows that had no value
UPDATE tasks SET recurring_task = 'none' WHERE recurring_task IS NULL;
