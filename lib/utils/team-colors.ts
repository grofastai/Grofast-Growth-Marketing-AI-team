// Shared helper for badge/chip colors sourced from the `teams` table (see
// supabase/migrations/104_teams_positions_tables.sql). Pure display formatting
// only — never reads or writes work-entry, cost, or payroll data.
export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean
  const num = parseInt(full, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
