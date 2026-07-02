// Hardcoded fallbacks — must stay identical to the defaults in
// supabase/migrations/086_payroll_settings.sql and to the values that were
// previously hardcoded directly in app/admin/payroll/page.tsx and
// app/api/payslip/route.ts. If a company has no settings row yet (or the
// settings fetch fails for any reason), payroll math must come out
// identical to before this feature existed.
//
// Kept in a plain (non "use server") module since a "use server" file may
// only export async functions — this constant and type are consumed by
// both server code (lib/actions/payroll-settings.ts) and client code
// (payroll-client.tsx's form state).
export const PAYROLL_SETTINGS_DEFAULTS = {
  ot_threshold_hrs: 9.5,
  half_day_threshold_hrs: 4,
  salary_basis_days: 30,
  basic_pct: 50,
  hra_pct: 20,
  travel_pct: 7,
  medical_pct: 3,
}

export type PayrollSettings = typeof PAYROLL_SETTINGS_DEFAULTS
