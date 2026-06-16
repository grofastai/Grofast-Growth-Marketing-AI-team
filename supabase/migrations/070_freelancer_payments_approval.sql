-- Add approval flow to work entries (date already exists)
ALTER TABLE freelancer_work_entries
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

-- Add payment/contact fields to freelancers
ALTER TABLE freelancers
  ADD COLUMN IF NOT EXISTS upi_id text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS ifsc text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS location text;

-- Separate payments table
CREATE TABLE IF NOT EXISTS freelancer_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  freelancer_id    uuid NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  amount           numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method   text NOT NULL CHECK (payment_method IN ('upi', 'cash', 'bank_transfer')),
  reference_number text,
  notes            text,
  paid_date        date NOT NULL DEFAULT CURRENT_DATE,
  paid_by          uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE freelancer_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON freelancer_payments
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Activity logs
CREATE TABLE IF NOT EXISTS freelancer_activity_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  freelancer_id uuid NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  action        text NOT NULL,
  actor_id      uuid REFERENCES users(id),
  actor_name    text,
  remarks       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE freelancer_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON freelancer_activity_logs
  FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_freelancer_payments_freelancer ON freelancer_payments(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_freelancer_activity_freelancer ON freelancer_activity_logs(freelancer_id);
CREATE INDEX IF NOT EXISTS idx_freelancer_work_entries_approval ON freelancer_work_entries(approval_status);
