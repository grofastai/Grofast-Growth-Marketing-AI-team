import { describe, it, expect } from 'vitest'
import { canEditNote, canReadNote } from './access'

const admin = { id: 'a', role: 'ADMIN' as const }
const memberOwner = { id: 'm', role: 'MEMBER' as const }
const other = { id: 'x', role: 'MEMBER' as const }

describe('canEditNote', () => {
  it('private: only owner edits', () => {
    expect(canEditNote({ user_id: 'm', scope: 'private' }, memberOwner)).toBe(true)
    expect(canEditNote({ user_id: 'm', scope: 'private' }, other)).toBe(false)
  })
  it('team: owner or share-edit user edits', () => {
    expect(canEditNote({ user_id: 'm', scope: 'team' }, memberOwner)).toBe(true)
    expect(canEditNote({ user_id: 'm', scope: 'team' }, other)).toBe(false)
    expect(canEditNote({ user_id: 'm', scope: 'team', shareEdit: true }, other)).toBe(true)
  })
  it('sop: only admins edit', () => {
    expect(canEditNote({ user_id: 'm', scope: 'sop' }, admin)).toBe(true)
    expect(canEditNote({ user_id: 'm', scope: 'sop' }, memberOwner)).toBe(false)
  })
})

describe('canReadNote', () => {
  it('private: owner only', () => {
    expect(canReadNote({ user_id: 'm', scope: 'private' }, memberOwner)).toBe(true)
    expect(canReadNote({ user_id: 'm', scope: 'private' }, other)).toBe(false)
  })
  it('private shared with me: readable', () => {
    expect(canReadNote({ user_id: 'm', scope: 'private', shared: true }, other)).toBe(true)
  })
  it('team & sop: anyone in company reads', () => {
    expect(canReadNote({ user_id: 'm', scope: 'team' }, other)).toBe(true)
    expect(canReadNote({ user_id: 'm', scope: 'sop' }, other)).toBe(true)
  })
})
