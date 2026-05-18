-- ── Freelancer specialty on users ────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS specialty text;

-- ── Payment + deadline fields on freelancer_updates ───────────────────────────
ALTER TABLE freelancer_updates
  ADD COLUMN IF NOT EXISTS cost           numeric(10,2),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_date      date,
  ADD COLUMN IF NOT EXISTS deadline       date;

-- Index for payment queries
CREATE INDEX IF NOT EXISTS idx_freelancer_updates_payment
  ON freelancer_updates(company_id, payment_status);
