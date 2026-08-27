import { describe, it, expect } from 'vitest'
import { resolveImpersonationTarget } from './impersonation'

const ADMIN = 'admin-1'
const TARGET = 'member-9'
const CO = 'company-a'

// The member pages used to trust the gf_impersonate cookie on sight and then read
// through the service-role client, so anyone who set that cookie by hand in DevTools
// could read another member's payslip, attendance and documents. Every rule below is
// the reason that cookie alone is no longer enough.
describe('resolveImpersonationTarget', () => {
  it('allows an ADMIN to impersonate a member in the same company', () => {
    expect(resolveImpersonationTarget({
      selfId: ADMIN, selfRole: 'ADMIN', selfCompanyId: CO,
      cookieValue: TARGET, targetCompanyId: CO,
    })).toBe(TARGET)
  })

  it('ignores the cookie when there is none', () => {
    expect(resolveImpersonationTarget({
      selfId: ADMIN, selfRole: 'ADMIN', selfCompanyId: CO,
      cookieValue: undefined, targetCompanyId: CO,
    })).toBeNull()
  })

  it('refuses a non-admin who forged the cookie', () => {
    // The exact escalation: a MEMBER sets gf_impersonate in DevTools.
    expect(resolveImpersonationTarget({
      selfId: 'member-1', selfRole: 'MEMBER', selfCompanyId: CO,
      cookieValue: TARGET, targetCompanyId: CO,
    })).toBeNull()
  })

  it('refuses a target in a different company', () => {
    expect(resolveImpersonationTarget({
      selfId: ADMIN, selfRole: 'ADMIN', selfCompanyId: CO,
      cookieValue: TARGET, targetCompanyId: 'company-b',
    })).toBeNull()
  })

  it('refuses when the target company is unknown (target row missing)', () => {
    expect(resolveImpersonationTarget({
      selfId: ADMIN, selfRole: 'ADMIN', selfCompanyId: CO,
      cookieValue: TARGET, targetCompanyId: null,
    })).toBeNull()
  })

  it('refuses when the admin has no company of their own', () => {
    expect(resolveImpersonationTarget({
      selfId: ADMIN, selfRole: 'ADMIN', selfCompanyId: null,
      cookieValue: TARGET, targetCompanyId: CO,
    })).toBeNull()
  })

  it('ignores a cookie pointing at the viewer themselves', () => {
    expect(resolveImpersonationTarget({
      selfId: ADMIN, selfRole: 'ADMIN', selfCompanyId: CO,
      cookieValue: ADMIN, targetCompanyId: CO,
    })).toBeNull()
  })

  it('refuses an empty-string cookie rather than treating it as a user id', () => {
    expect(resolveImpersonationTarget({
      selfId: ADMIN, selfRole: 'ADMIN', selfCompanyId: CO,
      cookieValue: '', targetCompanyId: CO,
    })).toBeNull()
  })
})
