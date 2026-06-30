import { describe, it, expect } from 'vitest'
import { extractMentionIds } from './mentions'

describe('extractMentionIds', () => {
  it('collects unique mention ids from nested content', () => {
    const doc = { type: 'doc', content: [
      { type: 'paragraph', content: [
        { type: 'text', text: 'hi ' },
        { type: 'mention', attrs: { id: 'u1', label: 'Rahul' } },
        { type: 'mention', attrs: { id: 'u2', label: 'Punith' } },
      ]},
      { type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u1', label: 'Rahul' } }] },
    ]}
    expect(extractMentionIds(doc).sort()).toEqual(['u1', 'u2'])
  })
  it('returns [] for docs with no mentions or bad input', () => {
    expect(extractMentionIds({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual([])
    expect(extractMentionIds(null)).toEqual([])
  })
})
