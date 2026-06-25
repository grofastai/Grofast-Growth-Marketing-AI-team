type Node = { type?: string; attrs?: { id?: string }; content?: Node[] }

export function extractMentionIds(doc: unknown): string[] {
  const ids = new Set<string>()
  const walk = (n: Node | null | undefined) => {
    if (!n || typeof n !== 'object') return
    if (n.type === 'mention' && n.attrs?.id) ids.add(n.attrs.id)
    n.content?.forEach(walk)
  }
  walk(doc as Node)
  return [...ids]
}
