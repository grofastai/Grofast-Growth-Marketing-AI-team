/**
 * Reads client data from the GroFast Google Sheet.
 * Sheet must be shared as "Anyone with the link can view".
 *
 * Column order (0-indexed):
 *  0:  S.NO
 *  1:  CLIENT STATUS
 *  2:  CUSTOMER NAME
 *  3:  COMPANY NAME
 *  4:  PERIOD
 *  5:  DUE DATE
 *  6:  PACKAGE
 *  7:  PAYMENT STATUS
 *  8:  CURRENT MONTH
 *  9:  PREVIOUS MONTH
 *  10: RECIEVED
 *  11: PENDING
 *  12: INDUSTRY
 *  13: PLACE
 *  14: MOB NO
 *  15: GENDER
 *  16: POSITION
 *  17: AGE GROUP
 *  18: CLIENT INCOME STAGE
 *  19: BUSINESS STAGE
 *  20: EMAIL ID
 *  21: SOURCE
 *  22: ONBOARDED MONTH
 *  23: SERVICE
 *  24: CLIENT STAGE
 */

export interface SheetClient {
  sno: string
  client_status: string
  customer_name: string
  company_name: string
  period: string
  due_date: string
  package_name: string
  payment_status: string
  current_month: string
  previous_month: string
  received: string
  pending: string
  industry: string
  place: string
  mob_no: string
  gender: string
  position: string
  age_group: string
  client_income_stage: string
  business_stage: string
  email: string
  source: string
  onboarded_month: string
  service: string
  client_stage: string
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

function col(cols: string[], idx: number): string {
  return (cols[idx] ?? "").trim()
}

export async function fetchSheetClients(sheetId: string, gid?: string): Promise<SheetClient[]> {
  const gidParam = gid ? `&gid=${gid}` : ""
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv${gidParam}`
  const res = await fetch(url, { next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`Google Sheets fetch failed: ${res.status}`)
  const text = await res.text()
  const rows = parseCSV(text)

  // Find the header row dynamically — it's the first row containing "S.NO" or "CLIENT STATUS"
  const headerIdx = rows.findIndex(r =>
    r.some(cell => /^s\.?no\.?$/i.test(cell.trim()) || /client.?status/i.test(cell.trim()))
  )
  // Start data from the row after the header, skipping any blank rows
  const dataRows = (headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows.slice(1))
    .filter(r => r.some(cell => cell.trim()))

  return dataRows
    .map(cols => ({
      sno:                 col(cols, 0),
      client_status:       col(cols, 1),
      customer_name:       col(cols, 2),
      company_name:        col(cols, 3),
      period:              col(cols, 4),
      due_date:            col(cols, 5),
      package_name:        col(cols, 6),
      payment_status:      col(cols, 7),
      current_month:       col(cols, 8),
      previous_month:      col(cols, 9),
      received:            col(cols, 10),
      pending:             col(cols, 11),
      industry:            col(cols, 12),
      place:               col(cols, 13),
      mob_no:              col(cols, 14),
      gender:              col(cols, 15),
      position:            col(cols, 16),
      age_group:           col(cols, 17),
      client_income_stage: col(cols, 18),
      business_stage:      col(cols, 19),
      email:               col(cols, 20),
      source:              col(cols, 21),
      onboarded_month:     col(cols, 22),
      service:             col(cols, 23),
      client_stage:        col(cols, 24),
    }))
    .filter(c => c.company_name || c.customer_name)
}
