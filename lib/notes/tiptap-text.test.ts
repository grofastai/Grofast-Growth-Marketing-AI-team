import { describe, it, expect } from 'vitest'
import { extractPlainText } from './tiptap-text'

describe('extractPlainText', () => {
  it('joins text nodes across paragraphs', () => {
    const doc = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: ' world' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Line two' }] },
    ]}
    expect(extractPlainText(doc)).toBe('Hello world\nLine two')
  })
  it('handles empty / contentless docs', () => {
    expect(extractPlainText({ type: 'doc' })).toBe('')
    expect(extractPlainText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('')
  })
  it('extracts text from nested nodes (lists, tasks)', () => {
    const doc = { type: 'doc', content: [
      { type: 'taskList', content: [
        { type: 'taskItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'todo a' }] }] },
      ]},
    ]}
    expect(extractPlainText(doc)).toBe('todo a')
  })
})
