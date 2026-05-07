-- Add Aadhaar number and PAN number columns to member_kyc
ALTER TABLE member_kyc
  ADD COLUMN IF NOT EXISTS aadhaar_number TEXT,
  ADD COLUMN IF NOT EXISTS pan_number     TEXT;
