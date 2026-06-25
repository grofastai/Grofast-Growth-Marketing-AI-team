export function exportFilename(title: string | null, ext: 'pdf' | 'doc'): string {
  const slug = (title ?? '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'note'}.${ext}`
}

export function buildWordDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${bodyHtml}</body></html>`
}
