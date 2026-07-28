// Hardcoded fallbacks — must stay identical to the defaults in
// supabase/migrations/086_payroll_settings.sql (as updated by migration 092)
// and to lib/utils/attendance-stats.ts's HALF_DAY_THRESHOLD_HOURS /
// FULL_DAY_HOURS, which now govern Present Days counting everywhere else
// (Dashboard, Attendance, History, Payslip). If a company has no settings
// row yet (or the settings fetch fails for any reason), payroll math must
// come out identical to those shared constants.
//
// Kept in a plain (non "use server") module since a "use server" file may
// only export async functions — this constant and type are consumed by
// both server code (lib/actions/payroll-settings.ts) and client code
// (payroll-client.tsx's form state).
export const PAYROLL_SETTINGS_DEFAULTS = {
  ot_threshold_hrs: 9.5,
  half_day_threshold_hrs: 4.5,
  salary_basis_days: 30,
  basic_pct: 50,
  hra_pct: 20,
  travel_pct: 7,
  medical_pct: 3,
}

export type PayrollSettings = typeof PAYROLL_SETTINGS_DEFAULTS
