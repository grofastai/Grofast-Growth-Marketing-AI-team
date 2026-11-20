// shoots.start_time / end_time are timestamptz. Postgres hands them back in UTC
// ("2026-11-20T04:30:00+00:00" for a 10:00 IST shoot), but the app is IST-only and the edit
// forms save wall-clock IST. Reading the date or time by cutting that string at "T" gives
// the UTC clock — 5½ hours behind, and a whole day behind before 05:30 IST — so re-saving
// an untouched shoot moved it. Always go through these (or ist-date) instead.
import { toISTDateString, toISTTimeString } from '@/lib/utils/ist-date'

// What a shoot's edit form should show: IST date + HH:MM times. `to` is '' with no end.
export function shootFormFields(startTime: string, endTime: string | null | undefined): { date: string; from: string; to: string } {
  return {
    date: toISTDateString(startTime),
    from: toISTTimeString(startTime),
    to: endTime ? toISTTimeString(endTime) : '',
  }
}

// An explicit-IST instant for a date + HH:MM entered in a form — the same shape the server
// actions write, so optimistic local state matches what a reload will return.
export function shootInstant(date: string, time: string): string {
  return `${date}T${time}:00+05:30`
}
