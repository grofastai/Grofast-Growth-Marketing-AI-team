-- 068_content_reminder_sent.sql
-- Prevents duplicate WhatsApp reminders for the same post
ALTER TABLE content_posts ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT FALSE;
