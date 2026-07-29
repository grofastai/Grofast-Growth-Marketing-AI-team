-- Correct the half-day threshold from 4.5h to 4.75h (4h45m) — 4.5 was never
-- actually half of the 9.5h workday (half of 9.5 is 4.75), confirmed 2026-07-28.
-- Matches lib/utils/attendance-stats.ts's HALF_DAY_THRESHOLD_HOURS, which now
-- governs Present Days counting AND Permission-hours-to-days conversion
-- across Dashboard, Attendance, History, Admin Payroll, and the Payslip PDF.
--
-- Unlike migration 116 (which only touched the column DEFAULT, leaving
-- existing rows alone since it couldn't tell a deliberate 4h choice from an
-- unedited default), this one also updates existing rows still sitting at
-- the pre-116 default of 4 or the 116 default of 4.5 — this correction is a
-- formula fix confirmed by the business owner, not a per-company preference,
-- so every company should move to the corrected value.
ALTER TABLE payroll_settings ALTER COLUMN half_day_threshold_hrs SET DEFAULT 4.75;

UPDATE payroll_settings
SET half_day_threshold_hrs = 4.75
WHERE half_day_threshold_hrs IN (4, 4.5);
