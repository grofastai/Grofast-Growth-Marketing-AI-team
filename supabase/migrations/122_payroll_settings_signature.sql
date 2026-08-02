-- Lets an admin upload a company signature image (e.g. the owner's scanned
-- signature) to use as the "Authorised Signatory" mark on the payroll
-- Report, same pattern as member_kyc.signature_url for employees.
alter table payroll_settings
  add column if not exists authorised_signature_url text;
