// Single source of truth for "what date/day is it right now" in IST.
//
// The app is IST-only, but the server (Vercel) runs in UTC. IST is UTC+5:30, so the
// calendar day on a UTC clock only rolls over at 05:30 IST — not at midnight IST. Any
// code that computed "today" via `new Date().toISOString().split('T')[0]` (or read
// `.getDay()`/`.getDate()` off a bare `new Date()`) was silently one day behind for
// anyone active between 00:00 and 05:30 IST. Always use these helpers instead.
const IST_TIME_ZONE = 'Asia/Kolkata'

// Current calendar date in IST, as YYYY-MM-DD.
export function todayIST(): string {
  return new Date().toLocaleString('en-CA', { timeZone: IST_TIME_ZONE }).split(',')[0]
}

// YYYY-MM-DD for an arbitrary instant, in IST.
export function toISTDateString(d: Date | number | string): string {
  return new Date(d).toLocaleString('en-CA', { timeZone: IST_TIME_ZONE }).split(',')[0]
}

// HH:MM (24h) for an arbitrary instant, in IST — e.g. converting a clock_in/clock_out
// timestamptz to the same wall-clock format leave times (half_day_from_time etc.) are
// stored in, so the two can be compared directly.
export function toISTTimeString(d: Date | number | string): string {
  return new Date(d).toLocaleTimeString('en-GB', { timeZone: IST_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false })
}

// A Date whose UTC-getter methods (getUTCDay, getUTCDate, getUTCMonth, getUTCFullYear)
// read as IST wall-clock values — for day-of-week / week-range / month-boundary math.
// Always read it with the getUTC* methods, never the local getters (those would apply
// the server's own timezone on top and double-shift it).
export function nowISTShifted(): Date {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
}
