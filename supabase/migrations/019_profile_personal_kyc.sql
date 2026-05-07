-- Add personal detail columns to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS photo_url               TEXT,
  ADD COLUMN IF NOT EXISTS blood_group             TEXT,
  ADD COLUMN IF NOT EXISTS address                 TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;

-- Create member_kyc table for bank and document details
CREATE TABLE IF NOT EXISTS member_kyc (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL,
  bank_name       TEXT,
  bank_account    TEXT,
  bank_ifsc       TEXT,
  govt_id_type    TEXT,
  govt_id_url     TEXT,
  ration_card_url TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE member_kyc ENABLE ROW LEVEL SECURITY;

-- Members can read and write their own KYC record
CREATE POLICY "member_kyc_self" ON member_kyc
  FOR ALL USING (
    user_id = auth.uid()
  );

-- Admins can read all KYC records in their company
CREATE POLICY "member_kyc_admin_read" ON member_kyc
  FOR SELECT USING (
    (auth.jwt() ->> 'role') = 'ADMIN'
    AND company_id = (auth.jwt() ->> 'company_id')::uuid
  );
