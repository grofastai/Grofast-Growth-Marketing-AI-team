// Single source of truth for client dropdown options — used everywhere a client select appears.
// Import INTERNAL_BRANDS and buildClientOptions from here; never define them inline in a page/form.

export const INTERNAL_BRANDS = ["GROFAST DIGITAL", "KARTHICK BRANDS", "GROFAST AI"]

function norm(s: string) { return s.trim().replace(/\s+/g, ' ').toLowerCase() }

/**
 * Builds the active + past client option lists with deduplication.
 * activeClients  — names from clients table (status=active)
 * pastClients    — names from clients table (status=past)
 * projectNames   — optional project business names to include in active list
 *
 * Returns:
 *   activeOptions — INTERNAL_BRANDS first, then projects + active clients (deduped)
 *   pastOptions   — past clients not already in activeOptions
 */
export function buildClientOptions(
  activeClients: string[],
  pastClients: string[] = [],
  projectNames: string[] = [],
): { activeOptions: string[]; pastOptions: string[] } {
  const seen = new Set(INTERNAL_BRANDS.map(norm))
  const activeOptions: string[] = [...INTERNAL_BRANDS]

  for (const n of [...projectNames, ...activeClients]) {
    const t = n?.trim()
    if (t && !seen.has(norm(t))) { seen.add(norm(t)); activeOptions.push(t) }
  }

  const pastOptions: string[] = []
  for (const n of pastClients) {
    const t = n?.trim()
    if (t && !seen.has(norm(t))) { seen.add(norm(t)); pastOptions.push(t) }
  }

  return { activeOptions, pastOptions }
}
