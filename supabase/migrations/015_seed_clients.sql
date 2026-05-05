-- GroFast Client Seed — 13 active clients from CRM sheet
-- Run in: Supabase Dashboard → SQL Editor → Run
-- Skipped columns: PAYMENT STATUS, CURRENT MONTH, PREVIOUS MONTH, RECEIVED, PENDING

WITH cid AS (SELECT id FROM companies LIMIT 1)
INSERT INTO projects (
  company_id, business_name, client_name, location,
  service_types, status, package_name, start_month, end_month, progress_pct
)
SELECT
  (SELECT id FROM cid),
  business_name, client_name, location,
  service_types, 'active', package_name, start_month, end_month, 0
FROM (VALUES

  -- 1. AASFIE BRIYANI — Monthly May-2026
  ('AASFIE BRIYANI', 'GOKUL', 'HOSUR',
   ARRAY['Performance Marketing','Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  -- 2. GRAND SLAM SCHOOL — Monthly May-2026
  ('GRAND SLAM SCHOOL', 'MUGHIL RAVICHANDIRAN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  -- 3. MUGIL TRUST — Monthly May-2026
  ('MUGIL TRUST', 'MUGHIL RAVICHANDIRAN', 'HOSUR',
   ARRAY['Performance Marketing','Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  -- 4. SWEGASS BEAUTY — Monthly May-2026
  ('SWEGASS BEAUTY', 'RAJALAKSHMI', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  -- 5. SREE HERBAL CARE — Monthly May-2026
  ('SREE HERBAL CARE', 'JAYALAKSHMI', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  -- 6. MAHALAKSHMI SILKS — Monthly May-2026
  ('MAHALAKSHMI SILKS', 'MANJU', 'HOSUR',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  -- 7. ADAM DETAILS — Yearly Apr 2026 – Mar 2027
  ('ADAM DETAILS', 'SAJATH', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'YEARLY', '2026-04-01'::date, '2027-03-31'::date),

  -- 8. NETRA EYE CARE — Half Yearly Mar 2026 – Aug 2026
  ('NETRA EYE CARE', 'NEELAGANDAN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Management'],
   'HALF YEARLY', '2026-03-01'::date, '2026-08-31'::date),

  -- 9. EVAN STYLES MAKEOVER — Monthly May-2026
  ('EVAN STYLES MAKEOVER', 'EVANGELINE PAUL', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  -- 10. BGAUSS KRISHNAGIRI — Monthly May-2026
  ('BGAUSS KRISHNAGIRI', 'KAVIN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  -- 11. ASHOK MISSION SCHOOL — Quarterly Apr 2026 – Jun 2026
  ('ASHOK MISSION SCHOOL', 'ANBARASU', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'QUARTERLY', '2026-04-01'::date, '2026-06-30'::date),

  -- 12. ASHOK MISSION COLLEGE — Quarterly Apr 2026 – Jun 2026
  ('ASHOK MISSION COLLEGE', 'ANBARASU', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'QUARTERLY', '2026-04-01'::date, '2026-06-30'::date),

  -- 13. SVV SCHOOL — Quarterly Mar 2026 – May 2026
  ('SVV SCHOOL', 'VENKATASAMY', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'QUARTERLY', '2026-03-01'::date, '2026-05-31'::date)

) AS v(business_name, client_name, location, service_types, package_name, start_month, end_month);
