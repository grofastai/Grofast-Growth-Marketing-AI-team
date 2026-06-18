-- Add assigned_to field to support_tickets for Agency Request Center
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to text;
