type WorkEntryForCalc = {
  task_type: string
  start_time?: string | null
  end_time?: string | null
  duration_hours?: number | null
  _travel_hours?: number | null
}

// Net work hours from work_entries using interval-merge algorithm:
// 1. Merge overlapping work intervals
// 2. Carve out break intervals that overlap work
// 3. Add duration_hours for entries with no start/end time
// NOTE: _travel_hours is NOT added here — travel is already inside the shoot window the employee entered
export function calcNetWorkHours(entries: WorkEntryForCalc[], workLayout?: 'media' | 'non_media' | 'freelance_media'): number {
  function toMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

  const workEntries = workLayout === 'freelance_media'
    ? entries.filter(e => e.task_type === 'shoot' || e.task_type === 'edit')
    : entries.filter(e => e.task_type !== 'break')
  const breakEntries = entries.filter(e => e.task_type === 'break')

  const workIntervals = workEntries
    .filter(e => e.start_time && e.end_time)
    .map(e => {
      const start = toMins(e.start_time!)
      let end = toMins(e.end_time!)
      if (end <= start) end += 1440 // crosses midnight into the next day
      return { start, end }
    })
    .filter(i => i.end > i.start)
    .sort((a, b) => a.start - b.start)

  let merged: { start: number; end: number }[] = []
  if (workIntervals.length > 0) {
    let cs = workIntervals[0].start, ce = workIntervals[0].end
    for (let i = 1; i < workIntervals.length; i++) {
      if (workIntervals[i].start < ce) { ce = Math.max(ce, workIntervals[i].end) }
      else { merged.push({ start: cs, end: ce }); cs = workIntervals[i].start; ce = workIntervals[i].end }
    }
    merged.push({ start: cs, end: ce })
  }

  const breakIntervals = breakEntries
    .filter(e => e.start_time && e.end_time)
    .map(e => {
      const start = toMins(e.start_time!)
      let end = toMins(e.end_time!)
      if (end <= start) end += 1440 // crosses midnight into the next day
      return { start, end }
    })
    .filter(i => i.end > i.start)

  for (const brk of breakIntervals) {
    const next: { start: number; end: number }[] = []
    for (const w of merged) {
      if (brk.end <= w.start || brk.start >= w.end) { next.push(w) }
      else {
        if (brk.start > w.start) next.push({ start: w.start, end: brk.start })
        if (brk.end   < w.end)   next.push({ start: brk.end, end: w.end   })
      }
    }
    merged = next
  }

  const timedMins = merged.reduce((s, i) => s + (i.end - i.start), 0)
  const untimedH  = workEntries
    .filter(e => !e.start_time || !e.end_time)
    .reduce((s, e) => s + (e.duration_hours ?? 0), 0)

  return Math.round((timedMins / 60 + untimedH) * 10) / 10
}

export type OverlapCheckEntry = {
  id?: string | null
  task_type?: string
  start_time?: string | null
  end_time?: string | null
  title?: string | null
}

// Server-side guard so an overlap can never reach the database, regardless of which
// form/action wrote it — mirrors the tolerance (3 min, to absorb rounding) of the
// client-side check in app/member/update/daily-update-form.tsx's timesOverlap(), but
// this is the one place ALL write paths (submitDailyUpdate, updatePastDailyUpdate,
// addEntryToDate) funnel through, so it can't be bypassed by any of them.
// Any two timed entries overlapping — work-vs-work, work-vs-break, break-vs-break,
// or vs a leave block — is rejected; task_type is never distinguished.
export function findEntryOverlap(entries: OverlapCheckEntry[], thresholdMins = 3): string | null {
  function toMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  function overlaps(s1: string, e1: string, s2: string, e2: string): boolean {
    const a = toMins(s1), c = toMins(s2)
    let b = toMins(e1), d = toMins(e2)
    if (b <= a) b += 1440 // crosses midnight into the next day
    if (d <= c) d += 1440
    return Math.min(b, d) - Math.max(a, c) > thresholdMins
  }
  const timed = entries.filter(e => e.start_time && e.end_time)
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], b = timed[j]
      if (overlaps(a.start_time!, a.end_time!, b.start_time!, b.end_time!)) {
        const aLabel = a.title || a.task_type || 'entry'
        const bLabel = b.title || b.task_type || 'entry'
        return `Time ${a.start_time}–${a.end_time} (${aLabel}) overlaps with ${b.start_time}–${b.end_time} (${bLabel}). Fix the times before saving.`
      }
    }
  }
  return null
}

// The 5 break types kept after the Tea/Personal/Lunch/Personal Break cleanup (2026-07-29).
// Lunch Break/Short Break can run up to 1h30m (real breaks that occasionally run long);
// Late Login/Early Logoff are capped at a strict 1h since those mean "not working" — past
// that it's a real absence and belongs in Permission, not a break entry. Team Outing has
// no cap (company event, not a personal break).
export const BREAK_TYPE_OPTIONS = ["Lunch Break", "Short Break", "Late Login", "Early Logoff", "Team Outing"] as const
const BREAK_TYPE_CAP_HOURS: Record<string, number | null> = {
  "Lunch Break": 1.5,
  "Short Break": 1.5,
  "Late Login": 1,
  "Early Logoff": 1,
  "Team Outing": null,
}

// Shared client+server guard so a break can never exceed its cap regardless of which
// form/action wrote it — same pattern as findEntryOverlap above.
export function breakCapError(title: string, durationHours: number): string | null {
  const cap = BREAK_TYPE_CAP_HOURS[title]
  if (cap == null || durationHours <= cap) return null
  const capLabel = cap === 1 ? "1 hour" : "1h30m"
  const guidance = (title === "Late Login" || title === "Early Logoff")
    ? " Apply Permission for the rest instead."
    : ""
  return `${title} cannot exceed ${capLabel}.${guidance}`
}
