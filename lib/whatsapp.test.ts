import { describe, it, expect, vi, beforeEach } from 'vitest'
import { formatPhone, TEMPLATE_MAP, sendNotificationViaTemplate, shouldUpgradeDeliveryStatus } from './whatsapp'
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
    expect(TEMPLATE_MAP['daily_update.missing']!.name).toBe('grofast_missed_update_v2')
  })

  it('has an entry for leave.submitted with buttons', () => {
    const entry = TEMPLATE_MAP['leave.submitted']
    expect(entry).toBeDefined()
    expect(entry!.name).toBe('grofast_leave_request_v2')
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

describe('shouldUpgradeDeliveryStatus', () => {
  it('accepts the first status on a row that has none', () => {
    expect(shouldUpgradeDeliveryStatus(null, 'sent')).toBe(true)
    expect(shouldUpgradeDeliveryStatus(null, 'failed')).toBe(true)
  })

  it('moves forward through the delivery funnel', () => {
    expect(shouldUpgradeDeliveryStatus('accepted', 'sent')).toBe(true)
    expect(shouldUpgradeDeliveryStatus('sent', 'delivered')).toBe(true)
    expect(shouldUpgradeDeliveryStatus('delivered', 'read')).toBe(true)
  })

  it('never downgrades when Meta replays an earlier event out of order', () => {
    expect(shouldUpgradeDeliveryStatus('read', 'delivered')).toBe(false)
    expect(shouldUpgradeDeliveryStatus('delivered', 'sent')).toBe(false)
    expect(shouldUpgradeDeliveryStatus('sent', 'accepted')).toBe(false)
  })

  it('ignores a repeat of the status already recorded', () => {
    expect(shouldUpgradeDeliveryStatus('delivered', 'delivered')).toBe(false)
    expect(shouldUpgradeDeliveryStatus('failed', 'failed')).toBe(false)
  })

  it('lets failed override any earlier success — this is the case that was invisible', () => {
    expect(shouldUpgradeDeliveryStatus('accepted', 'failed')).toBe(true)
    expect(shouldUpgradeDeliveryStatus('sent', 'failed')).toBe(true)
    expect(shouldUpgradeDeliveryStatus('read', 'failed')).toBe(true)
  })

  it('never reverts a failed row back into the success funnel', () => {
    expect(shouldUpgradeDeliveryStatus('failed', 'delivered')).toBe(false)
    expect(shouldUpgradeDeliveryStatus('failed', 'read')).toBe(false)
  })

  it('rejects statuses Meta does not define', () => {
    expect(shouldUpgradeDeliveryStatus('sent', 'wobble')).toBe(false)
    expect(shouldUpgradeDeliveryStatus(null, '')).toBe(false)
  })

  it('treats an unrecognised legacy value as no status at all', () => {
    expect(shouldUpgradeDeliveryStatus('queued', 'delivered')).toBe(true)
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
