import { describe, it, expect } from 'vitest'
import { exportFilename, buildWordDocument } from './export'

describe('exportFilename', () => {
  it('slugs the title and appends extension', () => {
    expect(exportFilename('Meeting With Client!', 'pdf')).toBe('meeting-with-client.pdf')
    expect(exportFilename('  ', 'doc')).toBe('note.doc')
    expect(exportFilename(null, 'doc')).toBe('note.doc')
  })
})

describe('buildWordDocument', () => {
  it('wraps body in a full HTML doc containing the title', () => {
    const html = buildWordDocument('Hello', '<p>World</p>')
    expect(html).toContain('<html')
    expect(html).toContain('Hello')
    expect(html).toContain('<p>World</p>')
  })
})
