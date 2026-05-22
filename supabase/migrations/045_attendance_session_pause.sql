-- Track app-session logout so the live timer pauses while the user is signed out.
-- paused_seconds: accumulated seconds the user was signed out while clocked in.
-- session_paused_at: timestamp of the most recent app-logout (cleared on next login).

ALTER TABLE attendance_logs
  ADD COLUMN IF NOT EXISTS paused_seconds    int          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_paused_at timestamptz;
