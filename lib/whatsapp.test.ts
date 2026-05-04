import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatPhone, TEMPLATE_MAP, sendNotificationViaTemplate } from './whatsapp'
import type { MissingUpdatePayload, LeaveSubmittedPayload } from '@/lib/notifications/types'

describe('formatPhone', () => {
  it('prepends 91 to 10-digit number', () => {
    expect(formatPhone('9876543210')).toBe('919876543210')
  })

  it('replaces leading 0 on 11-digit number', () => {
    expect(formatPhone('09876543210')).toBe('919876543210')
  })

  it('strips non-digit characters', () => {
    expect(formatPhone('+91 98765-43210')).toBe('919876543210')
  })

  it('leaves already-prefixed numbers unchanged', () => {
    expect(formatPhone('919876543210')).toBe('919876543210')
  })
})

describe('TEMPLATE_MAP', () => {
  it('has an entry for daily_update.missing', () => {
    expect(TEMPLATE_MAP['daily_update.missing']).toBeDefined()
    expect(TEMPLATE_MAP['daily_update.missing']!.name).toBe('grofast_missed_update')
  })

  it('has an entry for leave.submitted with buttons', () => {
    const entry = TEMPLATE_MAP['leave.submitted']
    expect(entry).toBeDefined()
    expect(entry!.name).toBe('grofast_leave_request')
    expect(entry!.buildButtons).toBeDefined()
    const payload: LeaveSubmittedPayload = {
      event: 'leave.submitted',
      leave_id: 'abc-123',
      employee_name: 'Ravi',
      employee_id: 'EMP001',
      from_date: '2026-05-10',
      to_date: '2026-05-12',
      reason: 'vacation',
      admin_phone: '9876543210',
    }
    expect(entry!.buildButtons!(payload)).toEqual([
      { index: 0, payload: 'approve:abc-123' },
      { index: 1, payload: 'reject:abc-123' },
    ])
  })

  it('resolves phone from MissingUpdatePayload', () => {
    const payload: MissingUpdatePayload = {
      event: 'daily_update.missing',
      employee_name: 'Ravi',
      employee_phone: '9876543210',
      date: '2026-05-03',
    }
    expect(TEMPLATE_MAP['daily_update.missing']!.resolvePhone(payload)).toBe('9876543210')
  })

  it('builds params from MissingUpdatePayload', () => {
    const payload: MissingUpdatePayload = {
      event: 'daily_update.missing',
      employee_name: 'Ravi',
      employee_phone: '9876543210',
      date: '2026-05-03',
    }
    expect(TEMPLATE_MAP['daily_update.missing']!.buildParams(payload)).toEqual(['Ravi', '2026-05-03'])
  })
})

describe('sendNotificationViaTemplate', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('skips and warns when no template exists for event', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await sendNotificationViaTemplate({
      event: 'announcement.new',
      title: 'Hello',
      message: 'World',
      company_id: 'abc',
      team_phones: [],
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no template for "announcement.new"'))
  })

  it('skips and warns when phone is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await sendNotificationViaTemplate({
      event: 'daily_update.missing',
      employee_name: 'Ravi',
      employee_phone: '',
      date: '2026-05-03',
    })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no phone for "daily_update.missing"'))
  })
})
