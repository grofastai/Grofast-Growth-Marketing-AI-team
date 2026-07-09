export type SalaryHistoryRow = { user_id: string; monthly_salary: number; effective_from: string }

// Single source of truth for "what was this person's hourly rate on this date",
// shared by Expenses/Clients (computeDeliverables) and Team Insights so they
// can never quietly diverge from each other again.
export function hourlyRateOnDate(
  user: { id: string; hourly_rate?: number | null; monthly_salary?: number | null },
  date: string,
  salaryHistory: SalaryHistoryRow[],
): number {
  if (user.hourly_rate && user.hourly_rate > 0) return user.hourly_rate

  let best: SalaryHistoryRow | null = null
  for (const h of salaryHistory) {
    if (h.user_id !== user.id) continue
    if (h.effective_from > date) continue
    if (!best || h.effective_from > best.effective_from) best = h
  }
  const salary = best?.monthly_salary ?? user.monthly_salary ?? 0
  return salary > 0 ? salary / 25 / 8.5 : 0
}
