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

  const initials = member.name.split(' ').map((n: string) => n[0] ?? '').join('').slice(0, 2).toUpperCase()
  const attendPct = workDays > 0 ? Math.round((presentDays / workDays) * 100) : 0
  const grossPay  = basePay + otPay

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Salary Slip — ${member.name} — ${monthName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',system-ui,sans-serif;background:#0f0f0f;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .topbar{background:#111;color:#fff;padding:12px 24px;font-size:13px;display:flex;align-items:center;gap:12px}
  .topbar span{color:#9CA3AF;font-size:12px}
  .print-btn{margin-left:auto;background:linear-gradient(135deg,#DE1A1A,#7F1D1D);color:#fff;border:none;padding:9px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:0.02em}
  .wrap{max-width:820px;margin:28px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.5)}

  /* ── HEADER ── */
  .hdr{background:linear-gradient(135deg,#DE1A1A 0%,#8B1212 55%,#1a0808 100%);padding:32px 36px;position:relative;overflow:hidden}
  .hdr-glow{position:absolute;top:-60px;right:-40px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,0.06);pointer-events:none}
  .hdr-glow2{position:absolute;bottom:-80px;left:60px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.04);pointer-events:none}
  .hdr-inner{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px}
  .brand{display:flex;flex-direction:column;gap:2px}
  .brand-name{font-size:26px;font-weight:900;color:#fff;letter-spacing:0.05em}
  .brand-tag{font-size:9px;letter-spacing:0.3em;text-transform:uppercase;color:rgba(255,255,255,0.55);margin-top:2px}
  .slip-badge{background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:12px;padding:12px 20px;text-align:right;backdrop-filter:blur(8px)}
  .slip-badge-title{font-size:18px;font-weight:800;color:#fff;letter-spacing:0.02em}
  .slip-badge-month{font-size:11px;color:rgba(255,255,255,0.65);margin-top:3px;font-weight:500}

  /* ── EMPLOYEE STRIP ── */
  .emp-strip{background:#fafafa;border-bottom:1px solid #f0f0f0;padding:24px 36px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}
  .avatar{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#DE1A1A,#7F1D1D);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;flex-shrink:0;box-shadow:0 4px 16px rgba(222,26,26,0.35)}
  .emp-info{flex:1;min-width:140px}
  .emp-name{font-size:17px;font-weight:800;color:#111;letter-spacing:-0.01em}
  .emp-sub{font-size:12px;color:#6B7280;margin-top:3px;font-weight:500}
  .emp-badges{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
  .badge{font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:0.03em}
  .badge-team{background:#FFF1F2;color:#BE123C}
  .badge-type{background:#EFF6FF;color:#1D4ED8}
  .meta-chips{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
  .chip{background:#fff;border:1.5px solid #E5E7EB;border-radius:12px;padding:10px 16px;text-align:center;min-width:80px}
  .chip-val{font-size:16px;font-weight:900;color:#111}
  .chip-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#9CA3AF;margin-top:2px}

  /* ── ATTENDANCE BAR ── */
  .att-bar-wrap{padding:20px 36px;background:#fff;border-bottom:1px solid #f0f0f0}
  .att-bar-row{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .att-bar-bg{flex:1;height:8px;border-radius:4px;background:#F3F4F6;overflow:hidden}
  .att-bar-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,#16A34A,#4ADE80)}
  .att-pct{font-size:13px;font-weight:800;color:#16A34A;min-width:36px;text-align:right}
  .att-chips{display:flex;gap:8px;flex-wrap:wrap}
  .att-chip{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#6B7280}
  .att-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}

  /* ── BODY ── */
  .body{padding:28px 36px;display:flex;flex-direction:column;gap:24px}

  /* ── SECTION HEADER ── */
  .sec-hdr{display:flex;align-items:center;gap:10px;margin-bottom:12px}
  .sec-pill{width:4px;height:18px;border-radius:2px}
  .sec-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.18em;color:#6B7280}

  /* ── EARNINGS / DEDUCTIONS TABLE ── */
  .pay-table{width:100%;border-collapse:collapse}
  .pay-table tr{border-bottom:1px solid #F5F5F5}
  .pay-table tr:last-child{border-bottom:none}
  .pay-table td{padding:10px 14px;font-size:13px;color:#374151}
  .pay-table td:first-child{color:#111;font-weight:500}
  .pay-table td:last-child{text-align:right;font-weight:700}
  .pay-table .sub{background:#FAFAFA;border-radius:8px}
  .pay-table .sub td{font-size:11px;color:#9CA3AF;font-weight:500;padding:7px 14px}
  .pay-table .total-row{background:linear-gradient(90deg,#F9FAFB,#F3F4F6)}
  .pay-table .total-row td{font-size:13px;font-weight:800;color:#111;padding:12px 14px;border-radius:8px}
  .earn-amt{color:#16A34A}
  .ded-amt{color:#DE1A1A}
  .ot-amt{color:#EA580C}

  /* ── NET PAY CARD ── */
  .net-card{background:linear-gradient(135deg,#DE1A1A 0%,#8B1212 55%,#1a0808 100%);border-radius:16px;padding:24px 28px;display:flex;align-items:center;justify-content:space-between;position:relative;overflow:hidden}
  .net-glow{position:absolute;top:-40px;right:-20px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,0.06);pointer-events:none}
  .net-label-wrap{position:relative;z-index:1}
  .net-label{font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.18em;margin-bottom:4px}
  .net-period{font-size:13px;color:rgba(255,255,255,0.75);font-weight:500}
  .net-amount{position:relative;z-index:1;font-size:36px;font-weight:900;color:#fff;letter-spacing:-0.03em}
  .net-pence{font-size:18px;opacity:0.7}

  /* ── SUMMARY ROW ── */
  .summary-row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
  .sum-card{border-radius:12px;padding:14px 16px;border:1.5px solid}
  .sum-earn{background:#F0FDF4;border-color:#BBF7D0}
  .sum-ded{background:#FFF1F2;border-color:#FECDD3}
  .sum-net{background:#EFF6FF;border-color:#BFDBFE}
  .sum-lbl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;margin-bottom:6px}
  .sum-lbl-earn{color:#15803D}
  .sum-lbl-ded{color:#BE123C}
  .sum-lbl-net{color:#1D4ED8}
  .sum-val{font-size:18px;font-weight:900}
  .sum-val-earn{color:#16A34A}
  .sum-val-ded{color:#DE1A1A}
  .sum-val-net{color:#1D4ED8}

  /* ── FOOTER ── */
  .foot{background:#FAFAFA;border-top:1px solid #F0F0F0;padding:20px 36px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}
  .foot-note{font-size:10px;color:#9CA3AF;line-height:1.6}
  .sig-area{text-align:center}
  .sig-line{width:120px;border-top:1.5px solid #374151;margin:0 auto 6px}
  .sig-lbl{font-size:10px;font-weight:600;color:#374151}
  .sig-sub{font-size:9px;color:#9CA3AF;margin-top:1px}
  .watermark{font-size:9px;color:#D1D5DB;text-align:center;padding:10px 0 16px;letter-spacing:0.12em;text-transform:uppercase}

  @media print{
    body{background:#fff}
    .topbar{display:none}
    .wrap{margin:0;border-radius:0;box-shadow:none;max-width:100%}
    .hdr,.att-bar-wrap,.net-card{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  }
</style>
</head>
<body>
<div class="topbar no-print">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
  <span>${member.name} &nbsp;·&nbsp; ${monthName} &nbsp;·&nbsp; #${member.employee_id}</span>
  <button class="print-btn" onclick="window.print()">⬇&nbsp; Download PDF</button>
</div>

<div class="wrap">
  <!-- HEADER -->
  <div class="hdr">
    <div class="hdr-glow"></div>
    <div class="hdr-glow2"></div>
    <div class="hdr-inner">
      <div class="brand">
        <div class="brand-name">GROFAST</div>
        <div class="brand-tag">Growth Marketing &amp; AI Solutions</div>
      </div>
      <div class="slip-badge">
        <div class="slip-badge-title">Salary Slip</div>
        <div class="slip-badge-month">${monthName}</div>
      </div>
    </div>
  </div>

  <!-- EMPLOYEE STRIP -->
  <div class="emp-strip">
    <div class="avatar">${initials}</div>
    <div class="emp-info">
      <div class="emp-name">${member.name}</div>
      <div class="emp-sub">#${member.employee_id} &nbsp;·&nbsp; Pay date: 3rd of next month</div>
      <div class="emp-badges">
        ${member.team ? `<span class="badge badge-team">${member.team}</span>` : ''}
        <span class="badge badge-type">${empType.replace('_', ' ')}</span>
      </div>
    </div>
    <div class="meta-chips">
      <div class="chip">
        <div class="chip-val">${workDays}</div>
        <div class="chip-lbl">Work Days</div>
      </div>
      <div class="chip">
        <div class="chip-val">${presentDays}</div>
        <div class="chip-lbl">Present</div>
      </div>
      <div class="chip">
        <div class="chip-val" style="color:${absentDays > 0 ? '#DE1A1A' : '#16A34A'}">${absentDays}</div>
        <div class="chip-lbl">Absent</div>
      </div>
      <div class="chip">
        <div class="chip-val" style="color:#EA580C">${otHours}h</div>
        <div class="chip-lbl">OT Hours</div>
      </div>
    </div>
  </div>

  <!-- ATTENDANCE BAR -->
  <div class="att-bar-wrap">
    <div class="att-bar-row">
      <span style="font-size:11px;font-weight:700;color:#6B7280;min-width:80px">Attendance</span>
      <div class="att-bar-bg"><div class="att-bar-fill" style="width:${attendPct}%"></div></div>
      <span class="att-pct">${attendPct}%</span>
    </div>
    <div class="att-chips">
      <div class="att-chip"><span class="att-dot" style="background:#16A34A"></span>${presentDays} Present</div>
      <div class="att-chip"><span class="att-dot" style="background:#DE1A1A"></span>${absentDays} Absent</div>
      <div class="att-chip"><span class="att-dot" style="background:#6B7280"></span>${totalHours}h Total hours</div>
      ${otHours > 0 ? `<div class="att-chip"><span class="att-dot" style="background:#EA580C"></span>${otHours}h Overtime</div>` : ''}
    </div>
  </div>

  <!-- BODY -->
  <div class="body">

    <!-- SUMMARY ROW -->
    <div class="summary-row">
      <div class="sum-card sum-earn">
        <div class="sum-lbl sum-lbl-earn">Gross Earnings</div>
        <div class="sum-val sum-val-earn">${fmt(grossPay)}</div>
      </div>
      <div class="sum-card sum-ded">
        <div class="sum-lbl sum-lbl-ded">Total Deductions</div>
        <div class="sum-val sum-val-ded">${deduction > 0 ? `-${fmt(deduction)}` : '—'}</div>
      </div>
      <div class="sum-card sum-net">
        <div class="sum-lbl sum-lbl-net">Net Pay</div>
        <div class="sum-val sum-val-net">${fmt(netPay)}</div>
      </div>
    </div>

    <!-- EARNINGS -->
    <div>
      <div class="sec-hdr">
        <div class="sec-pill" style="background:#16A34A"></div>
        <div class="sec-title">Earnings</div>
      </div>
      <table class="pay-table">
        ${empType === 'regular'
          ? `<tr><td>Basic / Monthly Salary</td><td class="earn-amt">${fmt(basePay)}</td></tr>
             ${otPay > 0 ? `<tr><td>Overtime Pay</td><td class="ot-amt">${fmt(otPay)}</td></tr>
             <tr class="sub"><td colspan="2">${otHours}h @ ₹${Math.round(basePay / workDays / 9)}/hr</td></tr>` : ''}
             <tr class="total-row"><td>Gross Earnings</td><td class="earn-amt">${fmt(grossPay)}</td></tr>`
          : `<tr><td>Hours Worked</td><td class="earn-amt">${fmt(basePay)}</td></tr>
             <tr class="sub"><td colspan="2">${totalHours}h × ₹${member.hourly_rate}/hr</td></tr>
             <tr class="total-row"><td>Gross Earnings</td><td class="earn-amt">${fmt(basePay)}</td></tr>`
        }
      </table>
    </div>

    ${deduction > 0 ? `
    <!-- DEDUCTIONS -->
    <div>
      <div class="sec-hdr">
        <div class="sec-pill" style="background:#DE1A1A"></div>
        <div class="sec-title">Deductions</div>
      </div>
      <table class="pay-table">
        <tr><td>Absence Deduction</td><td class="ded-amt">-${fmt(deduction)}</td></tr>
        <tr class="sub"><td colspan="2">${absentDays} day${absentDays > 1 ? 's' : ''} × ₹${Math.round(basePay / workDays)}/day</td></tr>
        <tr class="total-row"><td>Total Deductions</td><td class="ded-amt">-${fmt(deduction)}</td></tr>
      </table>
    </div>` : ''}

    <!-- NET PAY -->
    <div class="net-card">
      <div class="net-glow"></div>
      <div class="net-label-wrap">
        <div class="net-label">Net Pay</div>
        <div class="net-period">${monthName} &nbsp;·&nbsp; Paid on 3rd</div>
      </div>
      <div class="net-amount">${fmt(netPay)}</div>
    </div>

  </div>

  <!-- FOOTER -->
  <div class="foot">
    <div class="foot-note">
      Generated on ${generatedOn}<br/>
      This is a computer-generated salary slip and does not require a physical signature.
    </div>
    <div class="sig-area">
      <div class="sig-line"></div>
      <div class="sig-lbl">Authorised Signatory</div>
      <div class="sig-sub">GroFast Growth Marketing &amp; AI Solutions</div>
    </div>
  </div>
  <div class="watermark">Confidential &nbsp;·&nbsp; GroFast Team Tracking &nbsp;·&nbsp; ${generatedOn}</div>
</div>

<script>
  if (!window.opener && !document.referrer) {
    setTimeout(() => window.print(), 800)
  }
</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
