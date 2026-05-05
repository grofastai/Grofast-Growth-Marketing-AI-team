/**
 * Reads client data from a public Google Sheet via CSV export.
 * The sheet must be shared as "Anyone with the link can view".
 *
 * Expected column order (first row = headers, ignored):
 *  A: Business Name
 *  B: Client Name
 *  C: Location
 *  D: Services  (comma-separated, e.g. "Video Editing, Social Media Management")
 *  E: Status    ("Active" | "Completed" | "On Hold")
 *  F: Package
 *  G: Start Month  (YYYY-MM, e.g. 2025-01)
 *  H: End Month    (YYYY-MM)
 *  I: Progress     (0–100)
 */

export interface SheetClient {
  id: string
  business_name: string
  client_name: string
  location: string | null
  service_types: string[]
  status: "active" | "completed" | "on_hold"
  package_name: string | null
  start_month: string | null
  end_month: string | null
  progress_pct: number
  created_at: string
}

function mapStatus(raw: string): "active" | "completed" | "on_hold" {
  const s = raw.toLowerCase().trim()
  if (s === "completed") return "completed"
  if (s === "on hold" || s === "on_hold" || s === "onhold") return "on_hold"
  return "active"
}

function toMonthDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  // already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // YYYY-MM → YYYY-MM-01
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`
  return null
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let cur = ""
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        cells.push(cur); cur = ""
      } else {
        cur += ch
      }
    }
    cells.push(cur)
    rows.push(cells)
  }
  return rows
}

export async function fetchSheetClients(sheetId: string): Promise<SheetClient[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`
  const res = await fetch(url, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Google Sheets fetch failed: ${res.status}`)
  const text = await res.text()
  const rows = parseCSV(text)
  // Skip header row
  return rows.slice(1).map((cols, idx) => ({
    id: `sheet-${idx}`,
    business_name: (cols[0] ?? "").trim(),
    client_name: (cols[1] ?? "").trim(),
    location: (cols[2] ?? "").trim() || null,
    service_types: (cols[3] ?? "").split(",").map(s => s.trim()).filter(Boolean),
    status: mapStatus(cols[4] ?? ""),
    package_name: (cols[5] ?? "").trim() || null,
    start_month: toMonthDate(cols[6] ?? ""),
    end_month: toMonthDate(cols[7] ?? ""),
    progress_pct: Math.min(100, Math.max(0, parseInt(cols[8] ?? "0", 10) || 0)),
    created_at: new Date().toISOString(),
  })).filter(c => c.business_name)
}
