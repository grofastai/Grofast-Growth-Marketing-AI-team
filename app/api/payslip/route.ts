import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function workingDaysInMonth(year: number, month: number) {
  let count = 0
  const days = new Date(year, month, 0).getDate()
  for (let d = 1; d <= days; d++) {
    const day = new Date(year, month - 1, d).getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const userId = searchParams.get('userId')
  const month  = searchParams.get('month') // YYYY-MM

  if (!userId || !month) {
    return new NextResponse('Missing params', { status: 400 })
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const admin = adminSupabase()

  // Verify requester is admin of the same company
  const { data: requester } = await admin.from('users').select('company_id, role').eq('id', user.id).single()
  if (!requester || requester.role !== 'ADMIN') return new NextResponse('Forbidden', { status: 403 })

  const [year, mon] = month.split('-').map(Number)
  const monthStart  = `${month}-01`
  const monthEnd    = `${month}-${new Date(year, mon, 0).getDate()}`
  const workDays    = workingDaysInMonth(year, mon)

  const [{ data: memberRaw }, { data: updatesRaw }] = await Promise.all([
    admin.from('users')
      .select('id, name, employee_id, team, employment_type, monthly_salary, hourly_rate')
      .eq('id', userId)
      .eq('company_id', requester.company_id)
      .single(),
    admin.from('daily_updates')
      .select('attendance_status, working_hours')
      .eq('user_id', userId)
      .gte('date', monthStart)
      .lte('date', monthEnd),
  ])

  if (!memberRaw) return new NextResponse('Member not found', { status: 404 })

  type UpdateRow = { attendance_status: string; working_hours: number | null }
  const updates     = (updatesRaw ?? []) as UpdateRow[]
  const presentRows = updates.filter(u => u.attendance_status === 'present')
  const presentDays = presentRows.length
  const absentDays  = Math.max(workDays - presentDays, 0)
  const totalHours  = presentRows.reduce((s, u) => s + (u.working_hours ?? 0), 0)
  const otHours     = Math.round(presentRows.reduce((s, u) => {
    const h = u.working_hours ?? 0; return h > 9 ? s + (h - 9) : s
  }, 0) * 10) / 10

  type MemberRow = {
    id: string; name: string; employee_id: string; team: string | null
    employment_type: string | null; monthly_salary: number | null; hourly_rate: number | null
  }
  const member = memberRaw as MemberRow

  let basePay = 0, deduction = 0, otPay = 0, netPay = 0
  const empType = member.employment_type ?? 'regular'

  if (empType === 'regular' && member.monthly_salary) {
    const dailyRate = member.monthly_salary / workDays
    basePay   = member.monthly_salary
    deduction = Math.round(absentDays * dailyRate * 100) / 100
    otPay     = Math.round(otHours * (dailyRate / 9) * 100) / 100
    netPay    = Math.round((basePay - deduction + otPay) * 100) / 100
  } else if (member.hourly_rate) {
    basePay = Math.round(totalHours * member.hourly_rate * 100) / 100
    netPay  = basePay
  }

  const monthName = new Date(year, mon - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
  const generatedOn = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Salary Slip — ${member.name} — ${monthName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f5f5; color: #111; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 12mm 14mm; }
  .header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 8mm; border-bottom: 3px solid #de1a1a; margin-bottom: 8mm; }
  .logo { font-size: 28px; font-weight: 900; letter-spacing: 0.1em; color: #de1a1a; }
  .logo-sub { font-size: 9px; letter-spacing: 0.25em; text-transform: uppercase; color: #6B7280; margin-top: 2px; }
  .slip-title { text-align: right; }
  .slip-title h2 { font-size: 18px; font-weight: 700; color: #111; }
  .slip-title p { font-size: 12px; color: #6B7280; margin-top: 3px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 8mm; }
  .meta-box { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 5mm; }
  .meta-box label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.15em; color: #6B7280; font-weight: 700; display: block; margin-bottom: 4px; }
  .meta-box span { font-size: 14px; font-weight: 600; color: #111; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6mm; }
  th { background: #F3F4F6; text-align: left; padding: 3mm 4mm; font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #6B7280; font-weight: 700; }
  td { padding: 3mm 4mm; border-bottom: 1px solid #F0F0F0; font-size: 13px; }
  td:last-child { text-align: right; font-weight: 600; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: #6B7280; margin-bottom: 3mm; }
  .net-box { background: linear-gradient(135deg, #de1a1a, #7F1D1D); border-radius: 10px; padding: 6mm 8mm; display: flex; align-items: center; justify-content: space-between; margin-top: 4mm; }
  .net-label { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 0.1em; }
  .net-amount { font-size: 28px; font-weight: 900; color: #fff; letter-spacing: -0.02em; }
  .footer { margin-top: 10mm; padding-top: 5mm; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; align-items: flex-end; }
  .footer p { font-size: 10px; color: #6B7280; }
  .signature { text-align: center; }
  .signature-line { width: 45mm; border-top: 1px solid #374151; margin: 0 auto 2mm; }
  .signature p { font-size: 10px; color: #6B7280; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; padding: 10mm 12mm; box-shadow: none; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="no-print" style="background:#1f1f1f;color:#fff;padding:12px 20px;font-size:13px;font-family:sans-serif;display:flex;align-items:center;gap:12px;">
  <span>Salary Slip — ${member.name} — ${monthName}</span>
  <button onclick="window.print()" style="margin-left:auto;background:#de1a1a;color:#fff;border:none;padding:8px 20px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">⬇ Download PDF</button>
</div>
<div class="page">
  <div class="header">
    <div>
      <div class="logo">GROFAST</div>
      <div class="logo-sub">Growth Marketing &amp; AI Solutions</div>
    </div>
    <div class="slip-title">
      <h2>Salary Slip</h2>
      <p>${monthName}</p>
    </div>
  </div>

  <div class="meta">
    <div class="meta-box"><label>Employee Name</label><span>${member.name}</span></div>
    <div class="meta-box"><label>Employee ID</label><span>#${member.employee_id}</span></div>
    <div class="meta-box"><label>Department / Team</label><span>${member.team ?? '—'}</span></div>
    <div class="meta-box"><label>Employment Type</label><span style="text-transform:capitalize">${(empType).replace('_', ' ')}</span></div>
    <div class="meta-box"><label>Pay Period</label><span>${monthName}</span></div>
    <div class="meta-box"><label>Working Days</label><span>${workDays} days</span></div>
  </div>

  <div class="section-title">Attendance</div>
  <table>
    <thead><tr><th>Item</th><th style="text-align:right">Value</th></tr></thead>
    <tbody>
      <tr><td>Present Days</td><td>${presentDays} days</td></tr>
      <tr><td>Absent Days</td><td>${absentDays} days</td></tr>
      <tr><td>Total Hours Worked</td><td>${totalHours}h</td></tr>
      <tr><td>Overtime Hours</td><td>${otHours > 0 ? `${otHours}h` : '—'}</td></tr>
    </tbody>
  </table>

  <div class="section-title" style="margin-top:6mm">Earnings</div>
  <table>
    <thead><tr><th>Component</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${empType === 'regular'
        ? `<tr><td>Basic Salary</td><td>${fmt(basePay)}</td></tr>
           ${otPay > 0 ? `<tr><td>Overtime Pay (${otHours}h)</td><td style="color:#EA580C">${fmt(otPay)}</td></tr>` : ''}`
        : `<tr><td>Hours Worked (${totalHours}h × ₹${member.hourly_rate}/hr)</td><td>${fmt(basePay)}</td></tr>`
      }
      <tr style="background:#F9FAFB;font-weight:700"><td><strong>Gross Earnings</strong></td><td><strong>${fmt(basePay + otPay)}</strong></td></tr>
    </tbody>
  </table>

  ${deduction > 0 ? `
  <div class="section-title" style="margin-top:4mm">Deductions</div>
  <table>
    <thead><tr><th>Component</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      <tr><td>Absence Deduction (${absentDays} days)</td><td style="color:#de1a1a">-${fmt(deduction)}</td></tr>
      <tr style="background:#F9FAFB;font-weight:700"><td><strong>Total Deductions</strong></td><td style="color:#de1a1a"><strong>-${fmt(deduction)}</strong></td></tr>
    </tbody>
  </table>` : ''}

  <div class="net-box">
    <div class="net-label">Net Pay — ${monthName}</div>
    <div class="net-amount">${fmt(netPay)}</div>
  </div>

  <div class="footer">
    <div>
      <p>Generated on ${generatedOn}</p>
      <p style="margin-top:2px">This is a computer-generated document.</p>
    </div>
    <div class="signature">
      <div class="signature-line"></div>
      <p>Authorised Signature</p>
    </div>
  </div>
</div>
<script>
  // Auto-trigger print only when opened directly (not when embedded)
  if (window.opener || document.referrer) {
    // opened from another page — show bar and let user click
  } else {
    setTimeout(() => window.print(), 800)
  }
</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
