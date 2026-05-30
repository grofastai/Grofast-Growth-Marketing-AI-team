// __tests__/attendance-nudge.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

function parseAttendanceJson(raw: string): { work_type: 'office' | 'wfh' | 'shoot' | 'leave'; present: boolean } | null {
  try {
    const parsed = JSON.parse(raw.trim())
    if (!parsed.work_type || typeof parsed.present !== 'boolean') return null
    if (!['office', 'wfh', 'shoot', 'leave'].includes(parsed.work_type)) return null
    return parsed as { work_type: 'office' | 'wfh' | 'shoot' | 'leave'; present: boolean }
  } catch {
    return null
  }
}

describe('parseAttendanceJson', () => {
  it('parses valid office response', () => {
    const result = parseAttendanceJson('{"work_type":"office","present":true}')
    expect(result).toEqual({ work_type: 'office', present: true })
  })

  it('parses valid leave response', () => {
    const result = parseAttendanceJson('{"work_type":"leave","present":false}')
    expect(result).toEqual({ work_type: 'leave', present: false })
  })

  it('returns null for garbage input', () => {
    expect(parseAttendanceJson('not json')).toBeNull()
  })

  it('returns null for invalid work_type', () => {
    expect(parseAttendanceJson('{"work_type":"holiday","present":true}')).toBeNull()
  })

  it('handles extra whitespace/newlines from AI', () => {
    const result = parseAttendanceJson('\n{"work_type":"wfh","present":true}\n')
    expect(result).toEqual({ work_type: 'wfh', present: true })
  })
})
