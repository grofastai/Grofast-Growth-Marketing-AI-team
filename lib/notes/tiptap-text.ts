export interface TiptapNode { type: string; text?: string; content?: TiptapNode[] }
export interface TiptapDoc { type: string; content?: TiptapNode[] }

// Block-level nodes whose boundary should produce a newline between them.
const BLOCK = new Set(['paragraph', 'heading', 'listItem', 'taskItem', 'blockquote'])

export function extractPlainText(doc: TiptapDoc | TiptapNode | null | undefined): string {
  if (!doc) return ''
  const lines: string[] = []
  const walk = (node: TiptapNode, buf: { s: string }) => {
    if (node.text) buf.s += node.text
    node.content?.forEach(child => {
      if (BLOCK.has(child.type)) {
        const inner = { s: '' }
        walk(child, inner)
        if (inner.s.trim()) lines.push(inner.s.trim())
      } else {
        walk(child, buf)
      }
    })
  }
  const root = { s: '' }
  walk(doc as TiptapNode, root)
  if (root.s.trim()) lines.unshift(root.s.trim())
  return lines.join('\n')
}
