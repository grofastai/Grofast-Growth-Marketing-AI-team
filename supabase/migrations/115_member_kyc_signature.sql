-- Lets a member upload their own signature (scanned or digital) from their profile page,
-- same pattern as the existing govt_id/pan/ration_card KYC document fields.
alter table member_kyc
  add column if not exists signature_url text;
