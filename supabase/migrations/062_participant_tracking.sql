-- ── Participant tracking for collaborative work ───────────────────────────────
-- When a member submits a work update, they can tag teammates who participated.
-- This lets senior members (Founders, CEOs, Managers) get auto-tracked even if
-- they don't submit their own daily updates.

-- work_logs: activity-based updates (activity-update-form)
ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS participant_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS work_logs_participant_ids_idx
  ON work_logs USING GIN(participant_ids);

-- daily_updates: media-team updates (daily-update-form)
ALTER TABLE daily_updates
  ADD COLUMN IF NOT EXISTS participant_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS daily_updates_participant_ids_idx
  ON daily_updates USING GIN(participant_ids);

-- RLS: participants can read work_logs they appear in
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'work_logs' AND policyname = 'participant_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "participant_read" ON work_logs
        FOR SELECT USING (
          company_id = (auth.jwt() ->> 'company_id')::uuid
          AND auth.uid() = ANY(participant_ids)
        )
    $policy$;
  END IF;
END$$;
