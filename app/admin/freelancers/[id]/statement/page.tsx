export const revalidate = 0

import { createClient } from "@supabase/supabase-js"
import { createServerClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const TYPE_LABEL: Record<string, string> = {
  voice_over: "Voice Artist",
  video_editor: "Video Editor",
  video_shooter: "Video Shooter",
  other: "Other",
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function monthName(m: number) {
  return ["January","February","March","April","May","June","July","August","September","October","November","December"][m - 1]
}

export default async function StatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ year?: string; month?: string }>
}) {
  const { id } = await params
  const sp     = await searchParams
  const year   = parseInt(sp.year  ?? String(new Date().getFullYear()))
  const month  = parseInt(sp.month ?? String(new Date().getMonth() + 1))

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()

  const { data: profile } = await admin
    .from("users").select("company_id, name").eq("id", user.id).single()
  if (!profile?.company_id) redirect("/login")

  const { data: freelancer } = await admin
    .from("freelancers").select("*")
    .eq("id", id).eq("company_id", profile.company_id).single()
  if (!freelancer) notFound()

  const { data: company } = await admin
    .from("companies").select("name").eq("id", profile.company_id).single()

  const monthStr = `${year}-${String(month).padStart(2, "0")}`
  const fromDate = `${monthStr}-01`
  const toDate   = `${monthStr}-31`

  const { data: entries } = await admin
    .from("freelancer_work_entries")
    .select("*")
    .eq("freelancer_id", id)
    .eq("company_id", profile.company_id)
    .eq("approval_status", "approved")
    .gte("date", fromDate)
    .lte("date", toDate)
    .order("date", { ascending: true })

  const { data: payments } = await admin
    .from("freelancer_payments")
    .select("*")
    .eq("freelancer_id", id)
    .eq("company_id", profile.company_id)
    .gte("paid_date", fromDate)
    .lte("paid_date", toDate)
    .order("paid_date", { ascending: true })

  const totalEarned = (entries ?? []).reduce((s: number, e: { amount?: number }) => s + (e.amount ?? 0), 0)
  const totalPaid   = (payments ?? []).reduce((s: number, p: { amount?: number }) => s + (p.amount ?? 0), 0)
  const balance     = totalEarned - totalPaid

  const printedOn = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })

  return (
    <html>
      <head>
        <title>{`Statement – ${freelancer.name} – ${monthName(month)} ${year}`}</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #111827; background: #fff; padding: 40px; }
          @media print {
            body { padding: 20px; }
            .no-print { display: none !important; }
            @page { margin: 15mm; }
          }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 2px solid #DE1A1A; padding-bottom: 20px; }
          .logo { font-size: 22px; font-weight: 900; color: #DE1A1A; }
          .logo span { color: #111827; }
          .header-right { text-align: right; }
          .title { font-size: 28px; font-weight: 900; color: #111827; margin-bottom: 24px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
          .meta-card { background: #F9FAFB; border-radius: 10px; padding: 16px; }
          .meta-label { font-size: 10px; font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
          .meta-value { font-size: 14px; font-weight: 700; color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { background: #F3F4F6; padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.04em; }
          td { padding: 11px 14px; border-bottom: 1px solid #F3F4F6; font-size: 13px; color: #111827; }
          tr:last-child td { border-bottom: none; }
          .amount { text-align: right; font-weight: 700; }
          .summary { background: #F9FAFB; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }
          .summary-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #E5E7EB; }
          .summary-row:last-child { border-bottom: none; padding-top: 12px; }
          .summary-label { font-size: 13px; color: #374151; font-weight: 600; }
          .summary-value { font-size: 14px; font-weight: 800; color: #111827; }
          .balance-positive { color: #DE1A1A; }
          .balance-zero { color: #16A34A; }
          .footer { font-size: 11px; color: #9CA3AF; text-align: center; margin-top: 32px; border-top: 1px solid #E5E7EB; padding-top: 16px; }
          .print-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 10px; background: #DE1A1A; color: #fff; border: none; font-size: 13px; font-weight: 700; cursor: pointer; margin-bottom: 24px; }
          .empty { text-align: center; padding: 24px; color: #9CA3AF; font-size: 13px; }
          .method-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; background: rgba(16,185,129,0.1); color: #059669; }
          h2 { font-size: 15px; font-weight: 800; color: #111827; margin-bottom: 12px; }
        `}</style>
      </head>
      <body>
        <button className="print-btn no-print" onClick={undefined}>
          Print / Save as PDF
        </button>
        <script dangerouslySetInnerHTML={{ __html: `
          document.querySelector('.print-btn').addEventListener('click', function() { window.print() })
        `}} />

        {/* Header */}
        <div className="header">
          <div>
            <div className="logo">Gro<span>Fast</span></div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 4 }}>{company?.name ?? "GroFast Digital"}</div>
          </div>
          <div className="header-right">
            <div style={{ fontSize: 12, color: "#6B7280" }}>Printed on {printedOn}</div>
            <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>Statement ref: {id.slice(0, 8).toUpperCase()}</div>
          </div>
        </div>

        <div className="title">{monthName(month)} {year} — Statement</div>

        <div className="meta-grid">
          <div className="meta-card">
            <div className="meta-label">Freelancer</div>
            <div className="meta-value">{freelancer.name}</div>
            <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{TYPE_LABEL[freelancer.type] ?? "Freelancer"}</div>
            {freelancer.phone && <div style={{ fontSize: 12, color: "#6B7280" }}>{freelancer.phone}</div>}
          </div>
          <div className="meta-card">
            <div className="meta-label">Payment Details</div>
            {freelancer.upi_id && <div className="meta-value">UPI: {freelancer.upi_id}</div>}
            {freelancer.bank_name && (
              <>
                <div style={{ fontSize: 12, color: "#374151", marginTop: 2 }}>{freelancer.bank_name}</div>
                {freelancer.account_number && <div style={{ fontSize: 12, color: "#374151" }}>A/C: {freelancer.account_number}</div>}
                {freelancer.ifsc && <div style={{ fontSize: 12, color: "#374151" }}>IFSC: {freelancer.ifsc}</div>}
              </>
            )}
            {!freelancer.upi_id && !freelancer.bank_name && <div style={{ fontSize: 12, color: "#9CA3AF" }}>Not provided</div>}
          </div>
        </div>

        {/* Work Entries */}
        <h2>Work Entries (Approved)</h2>
        {(entries ?? []).length === 0 ? (
          <div className="empty">No approved work entries for this month.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th>Client</th>
                <th className="amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e: { id: string; date: string; title?: string; client_name?: string; amount?: number }) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.date)}</td>
                  <td>{e.title ?? "—"}</td>
                  <td>{e.client_name ?? "—"}</td>
                  <td className="amount">{fmt(e.amount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Payments */}
        <h2>Payments Made This Month</h2>
        {(payments ?? []).length === 0 ? (
          <div className="empty">No payments recorded for this month.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th className="amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(payments ?? []).map((p: { id: string; paid_date: string; payment_method: string; reference_number?: string; amount?: number }) => (
                <tr key={p.id}>
                  <td>{fmtDate(p.paid_date)}</td>
                  <td><span className="method-badge">{p.payment_method.toUpperCase()}</span></td>
                  <td>{p.reference_number ?? "—"}</td>
                  <td className="amount">{fmt(p.amount ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Summary */}
        <div className="summary">
          <div className="summary-row">
            <span className="summary-label">Total Earned (Approved)</span>
            <span className="summary-value">{fmt(totalEarned)}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">Total Paid This Month</span>
            <span className="summary-value">{fmt(totalPaid)}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label" style={{ fontWeight: 800, fontSize: 15 }}>Balance Due</span>
            <span className={`summary-value ${balance > 0 ? "balance-positive" : "balance-zero"}`} style={{ fontSize: 18 }}>
              {fmt(balance)}
            </span>
          </div>
        </div>

        <div className="footer">
          This statement was generated automatically by GroFast Team Tracking.
          It covers work entries approved and payments made in {monthName(month)} {year}.
        </div>
      </body>
    </html>
  )
}
