import { describe, it, expect } from 'vitest'
import { hasFiledUpdate, pickUnfiledDate, type GateUpdateRow } from './attendance-gate'

const filed: GateUpdateRow = { work_entries: [{ task_type: 'work', title: 'Edit reel' }] }
const emptied: GateUpdateRow = { work_entries: [] }

// workedDates are newest-first, as the query returns them
describe('pickUnfiledDate', () => {
  it('returns null when every worked day is filed', () => {
    const updates = new Map([['2026-07-13', filed], ['2026-07-11', filed]])
    expect(pickUnfiledDate(['2026-07-13', '2026-07-11'], updates, new Set())).toBeNull()
  })

  it('catches a day whose entries were emptied out, even when it is not yesterday', () => {
    // The whole point of scanning back: an older day that got emptied by a delete or a
    // move must still block, instead of being forgiven once it stops being yesterday.
    const updates = new Map([['2026-07-14', filed], ['2026-07-13', emptied]])
    expect(pickUnfiledDate(['2026-07-14', '2026-07-13'], updates, new Set())).toBe('2026-07-13')
  })

  it('catches a worked day with no update row at all', () => {
    expect(pickUnfiledDate(['2026-06-26'], new Map(), new Set())).toBe('2026-06-26')
  })

  it('skips days covered by approved leave', () => {
    const updates = new Map([['2026-07-13', emptied]])
    expect(pickUnfiledDate(['2026-07-13'], updates, new Set(['2026-07-13']))).toBeNull()
  })

  it('returns the most recent unfiled day when several are unfiled', () => {
    const updates = new Map([['2026-07-13', emptied]])
    expect(pickUnfiledDate(['2026-07-13', '2026-07-10'], updates, new Set())).toBe('2026-07-13')
  })

  it('returns null when the member has no worked days in range', () => {
    expect(pickUnfiledDate([], new Map(), new Set())).toBeNull()
  })
})

describe('hasFiledUpdate', () => {
  it('counts a day with real work entries as filed', () => {
    expect(hasFiledUpdate({ work_entries: [{ task_type: 'work', title: 'Edit reel' }] })).toBe(true)
  })

  it('does NOT count a row whose entries were all deleted (GF009, 2026-07-13)', () => {
    // The exact shape the History page leaves behind when a member removes their last
    // entry, or moves it to another date: the row survives with an empty entry list.
    // An existence-only check read this as "update submitted" and let him log in.
    expect(hasFiledUpdate({ work_entries: [] })).toBe(false)
  })

  it('does not count a missing row as filed', () => {
    expect(hasFiledUpdate(null)).toBe(false)
    expect(hasFiledUpdate(undefined)).toBe(false)
  })

  it('does not count an auto-inserted leave entry as work', () => {
    // Leave approval writes a marker entry into work_entries. It is not work the
    // member reported, so it must not satisfy the daily-update requirement.
    expect(hasFiledUpdate({ work_entries: [{ _is_leave: true, title: 'Half Day Leave' }] })).toBe(false)
  })

  it('counts real work alongside a leave marker as filed', () => {
    expect(hasFiledUpdate({
      work_entries: [{ _is_leave: true, title: 'Half Day Leave' }, { task_type: 'work', title: 'Shoot' }],
    })).toBe(true)
  })

  it('counts a learning-only day as filed', () => {
    expect(hasFiledUpdate({ work_entries: [], learning_hours: 2 })).toBe(true)
    expect(hasFiledUpdate({ work_entries: [], learning_hours: '1.5' })).toBe(true)
    expect(hasFiledUpdate({ work_entries: [], learning_hours: 0 })).toBe(false)
  })

  it('does not count a break-only day as filed (GF009 recurring pattern: logging only "Lunch Break")', () => {
    expect(hasFiledUpdate({ work_entries: [{ task_type: 'break', title: 'Lunch Break' }] })).toBe(false)
    expect(hasFiledUpdate({ work_entries: [{ task_type: 'break' }, { task_type: 'break' }] })).toBe(false)
  })

  it('counts real work alongside a break entry as filed', () => {
    expect(hasFiledUpdate({
      work_entries: [{ task_type: 'break', title: 'Lunch Break' }, { task_type: 'edit', title: 'Reel cut' }],
    })).toBe(true)
  })

  it('tolerates a malformed work_entries value', () => {
    expect(hasFiledUpdate({ work_entries: null })).toBe(false)
    expect(hasFiledUpdate({})).toBe(false)
  })
})
