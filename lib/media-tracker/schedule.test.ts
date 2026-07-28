import { describe, it, expect } from 'vitest'
import { groupSchedule, buildMonthGrid, type ScheduleEntry } from './schedule'

function entry(overrides: Partial<ScheduleEntry> & Pick<ScheduleEntry, 'id' | 'date'>): ScheduleEntry {
  return {
    time: null, title: 'Test entry', client: 'Acme', accent: '#000000', overdue: false, actions: [],
    ...overrides,
  }
}

describe('groupSchedule', () => {
  it('pulls past-due entries into an Overdue group above Today', () => {
    const entries = [
      entry({ id: 'past', date: '2026-07-20' }),
      entry({ id: 'today', date: '2026-07-28' }),
    ]
    const groups = groupSchedule(entries, '2026-07-28')
    expect(groups[0].heading).toBe('Overdue')
    expect(groups[0].entries.map(e => e.id)).toEqual(['past'])
    expect(groups[1].heading).toBe('Today')
    expect(groups[1].entries.map(e => e.id)).toEqual(['today'])
  })

  it('labels the next day Tomorrow and later dates by weekday/date', () => {
    const entries = [
      entry({ id: 'tmrw', date: '2026-07-29' }),
      entry({ id: 'later', date: '2026-08-02' }),
    ]
    const groups = groupSchedule(entries, '2026-07-28')
    const expectedLaterHeading = new Date('2026-08-02T00:00:00')
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    expect(groups.map(g => g.heading)).toEqual(['Tomorrow', expectedLaterHeading])
  })

  it('sorts same-day entries with untimed first, then by time ascending', () => {
    const entries = [
      entry({ id: 'five-pm', date: '2026-07-28', time: '17:00' }),
      entry({ id: 'untimed', date: '2026-07-28', time: null }),
      entry({ id: 'nine-am', date: '2026-07-28', time: '09:00' }),
    ]
    const groups = groupSchedule(entries, '2026-07-28')
    expect(groups[0].entries.map(e => e.id)).toEqual(['untimed', 'nine-am', 'five-pm'])
  })

  it('returns no groups for an empty entry list', () => {
    expect(groupSchedule([], '2026-07-28')).toEqual([])
  })
})

describe('buildMonthGrid', () => {
  it('returns a 42-day grid covering the full month with complete leading/trailing weeks', () => {
    const grid = buildMonthGrid(2026, 7, [], '2026-07-28')
    expect(grid).toHaveLength(42)
    const julyDays = grid.filter(d => d.inCurrentMonth)
    expect(julyDays).toHaveLength(31)
    expect(julyDays[0].date).toBe('2026-07-01')
    expect(julyDays[30].date).toBe('2026-07-31')
  })

  it('buckets entries onto their date and flags today', () => {
    const entries = [entry({ id: 'a', date: '2026-07-28' })]
    const grid = buildMonthGrid(2026, 7, entries, '2026-07-28')
    const day = grid.find(d => d.date === '2026-07-28')!
    expect(day.entries.map(e => e.id)).toEqual(['a'])
    expect(day.isToday).toBe(true)
    const otherDay = grid.find(d => d.date === '2026-07-27')!
    expect(otherDay.isToday).toBe(false)
    expect(otherDay.entries).toEqual([])
  })

  it('sorts multiple entries on the same day the same way groupSchedule does', () => {
    const entries = [
      entry({ id: 'pm', date: '2026-07-15', time: '15:00' }),
      entry({ id: 'am', date: '2026-07-15', time: '08:00' }),
    ]
    const grid = buildMonthGrid(2026, 7, entries, '2026-07-28')
    const day = grid.find(d => d.date === '2026-07-15')!
    expect(day.entries.map(e => e.id)).toEqual(['am', 'pm'])
  })
})
