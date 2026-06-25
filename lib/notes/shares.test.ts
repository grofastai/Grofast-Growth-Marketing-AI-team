import { describe, it, expect } from 'vitest'
import { indexShares, noteShareState } from './shares'

const viewer = { id: 'me', role: 'MEMBER' as const }

describe('noteShareState', () => {
  it('marks a note shared to me (not my own) and respects edit permission', () => {
    const map = indexShares([{ note_id: 'n1', permission: 'edit' }, { note_id: 'n2', permission: 'view' }])
    expect(noteShareState({ id: 'n1', user_id: 'other', scope: 'private' }, map, viewer)).toEqual({ shared: true, can_edit: true })
    expect(noteShareState({ id: 'n2', user_id: 'other', scope: 'private' }, map, viewer)).toEqual({ shared: true, can_edit: false })
  })
  it('does not mark my own note as shared', () => {
    const map = indexShares([{ note_id: 'n3', permission: 'edit' }])
    expect(noteShareState({ id: 'n3', user_id: 'me', scope: 'private' }, map, viewer)).toEqual({ shared: false, can_edit: true })
  })
  it('unshared note: not shared, edit by normal scope rules', () => {
    const map = indexShares([])
    expect(noteShareState({ id: 'n4', user_id: 'other', scope: 'team' }, map, viewer)).toEqual({ shared: false, can_edit: false })
  })
})
