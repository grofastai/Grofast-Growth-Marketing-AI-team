-- Add optional monthly fee to clients so admin can track profitability.
-- NULL means no fee configured for that client yet.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2);
