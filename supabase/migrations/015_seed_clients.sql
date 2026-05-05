-- GroFast Client Seed — ACTIVE CLIENTS + PAST CLIENTS sheets
-- Run in: Supabase Dashboard → SQL Editor → Run
-- Payment columns excluded. Shop info only.

-- ── Step 1: Clear previously seeded projects ──────────────────────────────────
DELETE FROM projects
WHERE company_id = (SELECT id FROM companies LIMIT 1);

-- ── Step 2: Active clients (status = active) ──────────────────────────────────
INSERT INTO projects (company_id, business_name, client_name, location, service_types, status, package_name, start_month, end_month, progress_pct)
SELECT
  (SELECT id FROM companies LIMIT 1),
  business_name, client_name, location, service_types,
  'active', package_name, start_month, end_month, 0
FROM (VALUES

  ('AASFIE BRIYANI', 'GOKUL', 'HOSUR',
   ARRAY['Performance Marketing','Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  ('GRAND SLAM SCHOOL', 'MUGHIL RAVICHANDIRAN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  ('MUGIL TRUST', 'MUGHIL RAVICHANDIRAN', 'HOSUR',
   ARRAY['Performance Marketing','Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  ('SREE HERBAL CARE', 'JAYALAKSHMI', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  ('MAHALAKSHMI SILKS', 'MANJU', 'HOSUR',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  ('ADAM DETAILS', 'SAJATH', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'YEARLY', '2026-04-01'::date, '2027-03-31'::date),

  ('NETRA EYE CARE', 'NEELAGANDAN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Management'],
   'HALF YEARLY', '2026-03-01'::date, '2026-08-31'::date),

  ('EVAN STYLES MAKEOVER', 'EVANGELINE PAUL', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  ('BGAUSS KRISHNAGIRI', 'KAVIN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  ('ASHOK MISSION SCHOOL', 'ANBARASU', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'QUARTERLY', '2026-04-01'::date, '2026-06-30'::date),

  ('ASHOK MISSION COLLEGE', 'ANBARASU', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'QUARTERLY', '2026-04-01'::date, '2026-06-30'::date),

  ('SVV SCHOOL', 'VENKATASAMY', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'QUARTERLY', '2026-03-01'::date, '2026-05-31'::date)

) AS v(business_name, client_name, location, service_types, package_name, start_month, end_month);


-- ── Step 3: Past clients (status = completed) ─────────────────────────────────
INSERT INTO projects (company_id, business_name, client_name, location, service_types, status, package_name, start_month, end_month, progress_pct)
SELECT
  (SELECT id FROM companies LIMIT 1),
  business_name, client_name, location, service_types,
  'completed', package_name, start_month, end_month, 100
FROM (VALUES

  -- Fully Paid Past Clients ──────────────────────────────────────────────────

  ('U CARE BEAUTY & FASHION', 'ASHA', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '7 DAYS', '2025-01-01'::date, '2025-01-31'::date),

  ('SAKISA SEA FOODS', 'SARAVANAN', 'CHENNAI',
   ARRAY['Performance Marketing','Personal Branding','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2025-01-01'::date, '2025-01-31'::date),

  ('DAKSHA BRIDAL FASHION', 'KAVITHA', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '15 DAYS', '2025-01-01'::date, '2025-01-31'::date),

  ('PRABHA CARS', 'MANOJ PRABHAKAR', 'KRISHNAGIRI & HOSUR',
   ARRAY['Performance Marketing','Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2025-02-01'::date, '2025-05-31'::date),

  ('AKASHKRISH TOYOTA', 'MANOJ PRABHAKAR', 'KRISHNAGIRI & HOSUR',
   ARRAY['Performance Marketing','Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2025-02-01'::date, '2025-05-31'::date),

  ('AKASHKRISH CHETAK', 'MANOJ PRABHAKAR', 'KRISHNAGIRI & HOSUR',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   'MONTHLY', '2025-03-01'::date, '2025-05-31'::date),

  ('AKASHKRISH TRIUMPH', 'MANOJ PRABHAKAR', 'KRISHNAGIRI & HOSUR',
   ARRAY['Performance Marketing','Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2025-03-01'::date, '2025-05-31'::date),

  ('AKASHKRISH BAJAJ', 'MANOJ PRABHAKAR', 'HOSUR',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   'MONTHLY', '2025-03-01'::date, '2025-05-31'::date),

  ('AKASHKRISH KTM', 'MANOJ PRABHAKAR', 'KRISHNAGIRI & HOSUR',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   'MONTHLY', '2025-03-01'::date, '2025-05-31'::date),

  ('AKASHKRISH FORD', 'MANOJ PRABHAKAR', 'HOSUR',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   'MONTHLY', '2025-03-01'::date, '2025-05-31'::date),

  ('TVS CHINNASAMY AGENCY', 'NAGKRISH', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2025-07-01'::date, '2025-07-31'::date),

  ('CUTS & COMB', 'HASEEB', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2025-07-01'::date, '2025-07-31'::date),

  ('BUN MAN CHAI', 'HASEEB', 'KRISHNAGIRI',
   ARRAY['Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion','Social Media Management'],
   'MONTHLY', '2025-07-01'::date, '2025-07-31'::date),

  ('SUDHARSAN', 'DSK CONSULTING', 'DHARMAPURI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing'],
   '15 DAYS', '2025-07-01'::date, '2025-07-31'::date),

  ('KVP ENTERPRISES', 'VIGNESH', 'CHENNAI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing'],
   '15 DAYS', '2025-08-01'::date, '2025-08-31'::date),

  ('AMSA WATER', 'DINESH', 'KAVERIPATTINAM',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing'],
   '7 DAYS', '2025-08-01'::date, '2025-08-31'::date),

  ('SHRI SARASWATHI VIDHYALAYA', 'BUPESH', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '7 DAYS', '2025-09-01'::date, '2025-09-30'::date),

  ('GSCRO - AQUA', 'GANDHI', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing'],
   'MONTHLY', '2025-11-01'::date, '2025-11-30'::date),

  ('SHOAIB ADVOCATE', 'SHOAIB', 'KAVERIPATTINAM',
   ARRAY['Personal Branding','Professional RJ Voice Over','Video Editing','Social Media Management'],
   '10 DAYS', '2025-12-01'::date, '2025-12-31'::date),

  ('HNV HARDWARES', 'SURESH', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Video Editing','Social Media Promotion'],
   'MONTHLY', '2025-12-01'::date, '2025-12-31'::date),

  ('AYANGARAN CASTLE', 'SRIRAM', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Video Editing','Social Media Promotion'],
   'MONTHLY', '2025-12-01'::date, '2025-12-31'::date),

  ('3K AUTO SPA', 'ARAVIND', 'KAVERIPATTINAM',
   ARRAY['Performance Marketing','Personal Branding','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Management'],
   '10 DAYS', '2026-01-01'::date, '2026-01-31'::date),

  ('NK ELECTRONICS', 'NASSEM', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   'MONTHLY', '2026-01-01'::date, '2026-01-31'::date),

  ('REVOLT HOSUR', 'KAVIN', 'HOSUR',
   ARRAY['Performance Marketing','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   'MONTHLY', '2026-02-01'::date, '2026-03-31'::date),

  ('ANNAI VELANKANNI', 'DO NO', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Video Editing','Social Media Promotion'],
   '15 DAYS', '2026-02-01'::date, '2026-02-28'::date),

  ('RENUGAMBAL JOTHIDAM', 'KRISHNAN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Video Editing'],
   'MONTHLY', '2026-03-01'::date, '2026-03-31'::date),

  -- SWEGASS BEAUTY (moved to past — fully paid)
  ('SWEGASS BEAUTY', 'RAJALAKSHMI', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','SAAS Tool','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing'],
   'MONTHLY', '2026-05-01'::date, '2026-05-31'::date),

  -- Free Trial / Trail Clients ───────────────────────────────────────────────

  ('MOUNT VIEW AVENUE', 'RAJAN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   'MONTHLY', '2025-04-01'::date, '2025-04-30'::date),

  ('VIJAY VIDHYALAYA', 'UNKNOWN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '7 DAYS', '2025-05-01'::date, '2025-05-31'::date),

  ('THIRUMALAI CONSULTING', 'THIRUMALAI', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '7 DAYS', '2025-05-01'::date, '2025-05-31'::date),

  ('GLOMAXX ASTHETICS', 'VEDHA', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '10 DAYS', '2025-05-01'::date, '2025-05-31'::date),

  ('SP HOSPITAL', 'UNKNOWN', 'KAVERIPATTINAM',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '7 DAYS', '2025-06-01'::date, '2025-06-30'::date),

  ('RADIANT SCANS', 'UNKNOWN', 'KAVERIPATTINAM',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '10 DAYS', '2025-06-01'::date, '2025-06-30'::date),

  ('ROYAL SIGNS', 'UNKNOWN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '15 DAYS', '2025-08-01'::date, '2025-08-31'::date),

  ('BEST CHOICE BUILDERS', 'ASIF', 'KAVERIPATTINAM',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '15 DAYS', '2025-08-01'::date, '2025-08-31'::date),

  ('YOKAMA TYRES', 'VARADHARAJA', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '15 DAYS', '2025-09-01'::date, '2025-09-30'::date),

  ('HEMALATHA BEAUTY PARLOUR', 'HEMALATHA', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '7 DAYS', '2025-09-01'::date, '2025-09-30'::date),

  ('OM SHANTHI ELECTRONICS', 'UNKNOWN', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '7 DAYS', '2025-09-01'::date, '2025-09-30'::date),

  ('TINY HEARTS PRESCHOOL', 'UDHAYA', 'KRISHNAGIRI',
   ARRAY['Performance Marketing','Advertisement Shoot','Professional RJ Voice Over','Poster Designing','Video Editing','Social Media Promotion'],
   '7 DAYS', '2025-09-01'::date, '2025-09-30'::date)

) AS v(business_name, client_name, location, service_types, package_name, start_month, end_month);
