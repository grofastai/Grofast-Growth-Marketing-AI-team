-- Tracks admin sign-off on a member's uploaded KYC documents — surfaced as a verified
-- badge on their profile (Instagram-tick style), set via the "Verify KYC" action on the
-- admin Documents page once the admin has reviewed the uploaded docs.
alter table member_kyc
  add column if not exists kyc_verified boolean not null default false,
  add column if not exists kyc_verified_at timestamptz,
  add column if not exists kyc_verified_by uuid references users(id);
