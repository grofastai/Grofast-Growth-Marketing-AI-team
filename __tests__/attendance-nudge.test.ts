// __tests__/attendance-nudge.test.ts
import { describe, it, expect } from 'vitest'

// ── helpers under test (extracted from route, tested in isolation) ──

function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

function needsNudge(
  employee: { id: string; phone: string | null },
  markedIds: Set<string>,
  onLeaveIds: Set<string>
): boolean {
  if (!employee.phone) return false
  if (markedIds.has(employee.id)) return false
  if (onLeaveIds.has(employee.id)) return false
  return true
}

describe('needsNudge', () => {
  it('returns true for employee with no attendance and no leave', () => {
    expect(needsNudge(
      { id: 'u1', phone: '9876543210' },
      new Set(),
      new Set()
    )).toBe(true)
  })

  it('returns false if employee already has attendance', () => {
    expect(needsNudge(
      { id: 'u1', phone: '9876543210' },
      new Set(['u1']),
      new Set()
    )).toBe(false)
  })

  it('returns false if employee is on approved leave', () => {
    expect(needsNudge(
      { id: 'u1', phone: '9876543210' },
      new Set(),
      new Set(['u1'])
    )).toBe(false)
  })

  it('returns false if employee has no phone', () => {
    expect(needsNudge(
      { id: 'u1', phone: null },
      new Set(),
      new Set()
    )).toBe(false)
  })
})

