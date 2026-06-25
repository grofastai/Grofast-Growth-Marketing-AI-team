import { describe, it, expect } from 'vitest'
import { filterNotes, type FilterNote } from './filter'

const notes: FilterNote[] = [
  { id: '1', user_id: 'me', scope: 'private', folder_id: 'f1', title: 'My private', content: 'alpha', labels: [] },
  { id: '2', user_id: 'me', scope: 'team',    folder_id: 'f1', title: 'Team note', content: 'beta', labels: ['x'] },
  { id: '3', user_id: 'you', scope: 'sop',    folder_id: 'f2', title: 'SOP doc', content: 'gamma', labels: [] },
  { id: '4', user_id: 'you', scope: 'private', shared: true, folder_id: null, title: 'Shared in', content: 'delta', labels: [] },
]

describe('filterNotes view', () => {
  it('mine = my-authored private notes', () => {
    expect(filterNotes(notes, { view: 'mine', viewerId: 'me' }).map(n => n.id)).toEqual(['1'])
  })
  it('team / sop / shared', () => {
    expect(filterNotes(notes, { view: 'team', viewerId: 'me' }).map(n => n.id)).toEqual(['2'])
    expect(filterNotes(notes, { view: 'sop', viewerId: 'me' }).map(n => n.id)).toEqual(['3'])
    expect(filterNotes(notes, { view: 'shared', viewerId: 'me' }).map(n => n.id)).toEqual(['4'])
  })
  it('all = everything visible', () => {
    expect(filterNotes(notes, { view: 'all', viewerId: 'me' }).map(n => n.id)).toEqual(['1', '2', '3', '4'])
  })
})

describe('filterNotes folder + search', () => {
  it('filters by folder', () => {
    expect(filterNotes(notes, { view: 'all', viewerId: 'me', folderId: 'f1' }).map(n => n.id)).toEqual(['1', '2'])
  })
  it('search matches title/content/labels', () => {
    expect(filterNotes(notes, { view: 'all', viewerId: 'me', q: 'gamma' }).map(n => n.id)).toEqual(['3'])
    expect(filterNotes(notes, { view: 'all', viewerId: 'me', q: 'team' }).map(n => n.id)).toEqual(['2'])
    expect(filterNotes(notes, { view: 'all', viewerId: 'me', q: 'x' }).map(n => n.id)).toEqual(['2'])
  })
})
