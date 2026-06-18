-- Extend notes reminder to support multiple recipients and a custom message.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reminder_recipients uuid[] DEFAULT '{}';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS reminder_message text;
