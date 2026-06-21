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
// 3. Add _travel_hours for shoot entries (travel has no separate timeline entry)
// 4. Add duration_hours for entries with no start/end time
export function calcNetWorkHours(entries: WorkEntryForCalc[]): number {
  function toMins(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m }

  const workEntries  = entries.filter(e => e.task_type !== 'break' && e.task_type !== 'learning')
  const breakEntries = entries.filter(e => e.task_type === 'break')

  const workIntervals = workEntries
    .filter(e => e.start_time && e.end_time)
    .map(e => ({ start: toMins(e.start_time!), end: toMins(e.end_time!) }))
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
    .map(e => ({ start: toMins(e.start_time!), end: toMins(e.end_time!) }))
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
  const travelH   = workEntries
    .filter(e => e.task_type === 'shoot')
    .reduce((s, e) => s + Number(e._travel_hours ?? 0), 0)
  const untimedH  = workEntries
    .filter(e => !e.start_time || !e.end_time)
    .reduce((s, e) => s + (e.duration_hours ?? 0), 0)

  return Math.round((timedMins / 60 + travelH + untimedH) * 10) / 10
}
