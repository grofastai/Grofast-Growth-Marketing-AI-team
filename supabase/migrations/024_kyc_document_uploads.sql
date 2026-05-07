-- Add individual document photo columns to member_kyc
ALTER TABLE member_kyc
  ADD COLUMN IF NOT EXISTS aadhaar_back_url  TEXT,
  ADD COLUMN IF NOT EXISTS pan_front_url     TEXT,
  ADD COLUMN IF NOT EXISTS pan_back_url      TEXT,
  ADD COLUMN IF NOT EXISTS ration_card_url2  TEXT;

-- Note: govt_id_url is reused as aadhaar_front_url (no rename needed)
