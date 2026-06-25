export function monthMatrix(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1)
  const startDow = first.getDay() // 0 = Sun
  const daysIn = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysIn; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (Date | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function bucketByDay(notes: { id: string; reminder_at: string | null }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const n of notes) {
    if (!n.reminder_at) continue
    const d = new Date(n.reminder_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    ;(out[key] ??= []).push(n.id)
  }
  return out
}
