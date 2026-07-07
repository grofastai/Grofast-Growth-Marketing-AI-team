-- 088: allow editing support ticket replies (tracks when a reply was last edited)

ALTER TABLE support_responses
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- DELETE realtime events only include the primary key by default, but the
-- member/admin support chat needs to know which row was removed to update
-- the thread live for the other party.
ALTER TABLE support_responses REPLICA IDENTITY FULL;
