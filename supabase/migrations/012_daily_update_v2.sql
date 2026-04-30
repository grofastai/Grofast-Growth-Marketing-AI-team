-- ============================================================
-- Daily Update v2
-- Adds structured work entry storage (JSONB) and learning fields
-- so each update captures per-client, per-task time blocks.
-- Backward compatible: existing columns are kept.
-- ============================================================

ALTER TABLE daily_updates
  ADD COLUMN IF NOT EXISTS work_entries      jsonb         NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS learning_topic    text,
  ADD COLUMN IF NOT EXISTS learning_notes    text,
  ADD COLUMN IF NOT EXISTS links             jsonb         NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS editing_count     integer       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shoot_time_hours  numeric(4,1),
  ADD COLUMN IF NOT EXISTS editing_time_hours numeric(4,1);

-- attendance_status already has DEFAULT 'present' so it no longer
-- needs to be supplied by the form — the new form omits it.
-- Existing rows are untouched.
