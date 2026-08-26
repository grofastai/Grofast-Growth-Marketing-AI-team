-- ── Freelancer payment QR (GPay / PhonePe / any UPI app) ─────────────────────
-- Public URL of an uploaded QR image, stored in the `documents` bucket under
-- the `freelancer-qr/` folder via POST /api/upload-photo. Phone already exists
-- on this table (063_freelancer_module.sql) — only the QR is new.

ALTER TABLE freelancers ADD COLUMN IF NOT EXISTS payment_qr_url text;
