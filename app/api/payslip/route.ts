import { createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getPayrollSettings } from '@/lib/actions/payroll-settings'
import {
  computeEmployeeMonth, fetchEmployeeMonthData,
  type EmployeeMonthMember, type EmployeeMonthBreakdown,
} from '@/lib/payroll/compute-month'

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function inWords(n: number): string {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  if (n <= 0) return 'Zero'
  if (n < 20) return ones[n]
  if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '')
  if (n < 1000) return ones[Math.floor(n/100)]+' Hundred'+(n%100 ? ' '+inWords(n%100) : '')
  if (n < 100000) return inWords(Math.floor(n/1000))+' Thousand'+(n%1000 ? ' '+inWords(n%1000) : '')
  if (n < 10000000) return inWords(Math.floor(n/100000))+' Lakh'+(n%100000 ? ' '+inWords(n%100000) : '')
  return inWords(Math.floor(n/10000000))+' Crore'+(n%10000000 ? ' '+inWords(n%10000000) : '')
}

// Every "YYYY-MM" from the financial year's start (April) through targetMonth
// inclusive — clamped to the employee's joining month if they joined after
// the financial year started, so Year to Date never counts months before
// they were employed.
function fyMonthsUpTo(targetMonth: string, joinedAt: string | null): string[] {
  const [ty, tm] = targetMonth.split('-').map(Number)
  const fyStartYear = tm >= 4 ? ty : ty - 1
  let startYear = fyStartYear, startMon = 4
  if (joinedAt) {
    const joinMonth = joinedAt.slice(0, 7)
    const fyStartStr = `${fyStartYear}-04`
    if (joinMonth > fyStartStr) {
      const [jy, jm] = joinMonth.split('-').map(Number)
      startYear = jy; startMon = jm
    }
  }
  const months: string[] = []
  let y = startYear, m = startMon
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

type YtdField = 'basic' | 'hra' | 'travelAllowance' | 'medicalAllowance' | 'otherAllowance'
  | 'otPay' | 'bonus' | 'incentive' | 'deduction' | 'advance' | 'basePay' | 'finalNetPay'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const userId = searchParams.get('userId')
  const month  = searchParams.get('month')

  if (!userId || !month) return new NextResponse('Missing params', { status: 400 })

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const admin = adminSupabase()
  const { data: requester } = await admin
    .from('users').select('company_id, role').eq('id', user.id).single()
  if (!requester) return new NextResponse('Forbidden', { status: 403 })
  // Admin can view any; member can only view their own
  if (requester.role !== 'ADMIN' && userId !== user.id) return new NextResponse('Forbidden', { status: 403 })

  const [year, mon] = month.split('-').map(Number)
  const settings    = await getPayrollSettings(requester.company_id)

  const [{ data: memberRaw }, { data: companyRaw }, { data: kycRaw }] = await Promise.all([
    admin.from('users')
      .select('id, name, employee_id, team, employment_type, monthly_salary, hourly_rate, created_at, position')
      .eq('id', userId).eq('company_id', requester.company_id).single(),
    admin.from('companies').select('name, slug').eq('id', requester.company_id).single(),
    admin.from('member_kyc').select('bank_account, bank_name, bank_ifsc')
      .eq('user_id', userId).maybeSingle(),
  ])

  if (!memberRaw) return new NextResponse('Member not found', { status: 404 })

  type MemberRow = {
    id: string; name: string; employee_id: string; team: string | null
    employment_type: string | null; monthly_salary: number | null; hourly_rate: number | null
    created_at: string | null; position: string | null
  }
  const member  = memberRaw as MemberRow
  const company = companyRaw as { name: string; slug: string } | null
  const kyc     = kycRaw as { bank_account: string | null; bank_name: string | null; bank_ifsc: string | null } | null

  const memberForCalc: EmployeeMonthMember = {
    employment_type: member.employment_type,
    monthly_salary: member.monthly_salary,
    hourly_rate: member.hourly_rate,
  }

  const currentRaw = await fetchEmployeeMonthData(admin, { userId, companyId: requester.company_id, month })
  const current = computeEmployeeMonth({ ...currentRaw, member: memberForCalc }, settings)

  // Year to Date: same calculation, looped over every month from the financial
  // year's start (or this employee's joining month, if later) through the
  // target month — summed per line item below.
  const ytdMonths = fyMonthsUpTo(month, member.created_at)
  const monthBreakdowns: EmployeeMonthBreakdown[] = await Promise.all(
    ytdMonths.map(async m => {
      if (m === month) return current
      const raw = await fetchEmployeeMonthData(admin, { userId, companyId: requester.company_id, month: m })
      return computeEmployeeMonth({ ...raw, member: memberForCalc }, settings)
    })
  )
  function sumYtd(field: YtdField): number {
    return Math.round(monthBreakdowns.reduce((s, b) => s + b[field], 0) * 100) / 100
  }
  const ytd = {
    basic: sumYtd('basic'), hra: sumYtd('hra'), travelAllowance: sumYtd('travelAllowance'),
    medicalAllowance: sumYtd('medicalAllowance'), otherAllowance: sumYtd('otherAllowance'),
    otPay: sumYtd('otPay'), bonus: sumYtd('bonus'), incentive: sumYtd('incentive'),
    deduction: sumYtd('deduction'), advance: sumYtd('advance'),
    basePay: sumYtd('basePay'), finalNetPay: sumYtd('finalNetPay'),
  }

  const monthName   = new Date(year, mon - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const generatedTs = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })
  const payslipId   = `GSPL/${year}/${String(mon).padStart(2,'0')}/${member.employee_id}`

  const fmt = (n: number) => `₹ ${Math.round(n).toLocaleString('en-IN')}`
  const companyName = company?.name ?? 'GroFast'

  const joiningDateFmt = member.created_at
    ? new Date(member.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  const isRegular = current.employment_type === 'regular' && !!member.monthly_salary

  const earningsRows = isRegular ? `
    <tr><td>Basic Salary</td><td>${Math.round(current.basic).toLocaleString('en-IN')}</td><td>${Math.round(ytd.basic).toLocaleString('en-IN')}</td></tr>
    <tr><td>HRA</td><td>${Math.round(current.hra).toLocaleString('en-IN')}</td><td>${Math.round(ytd.hra).toLocaleString('en-IN')}</td></tr>
    <tr><td>Travel Allowance</td><td>${Math.round(current.travelAllowance).toLocaleString('en-IN')}</td><td>${Math.round(ytd.travelAllowance).toLocaleString('en-IN')}</td></tr>
    <tr><td>Medical Allowance</td><td>${Math.round(current.medicalAllowance).toLocaleString('en-IN')}</td><td>${Math.round(ytd.medicalAllowance).toLocaleString('en-IN')}</td></tr>
    ${current.otherAllowance > 0 ? `<tr><td>Other Allowance</td><td>${Math.round(current.otherAllowance).toLocaleString('en-IN')}</td><td>${Math.round(ytd.otherAllowance).toLocaleString('en-IN')}</td></tr>` : ''}
    ${current.otPay > 0 ? `<tr><td>Overtime Pay</td><td>${Math.round(current.otPay).toLocaleString('en-IN')}</td><td>${Math.round(ytd.otPay).toLocaleString('en-IN')}</td></tr>` : ''}
    ${current.bonus > 0 ? `<tr><td>Bonus</td><td>${Math.round(current.bonus).toLocaleString('en-IN')}</td><td>${Math.round(ytd.bonus).toLocaleString('en-IN')}</td></tr>` : ''}
    ${current.incentive > 0 ? `<tr><td>Incentive</td><td>${Math.round(current.incentive).toLocaleString('en-IN')}</td><td>${Math.round(ytd.incentive).toLocaleString('en-IN')}</td></tr>` : ''}
  ` : `<tr><td>Hours Worked (${current.totalHours}h)</td><td>${Math.round(current.basePay).toLocaleString('en-IN')}</td><td>${Math.round(ytd.basePay).toLocaleString('en-IN')}</td></tr>`

  const totalEarningsCurrent = current.basePay + current.otPay + current.bonus + current.incentive
  const totalEarningsYtd     = ytd.basePay + ytd.otPay + ytd.bonus + ytd.incentive
  const totalDeductionsCurrent = current.deduction + current.advance
  const totalDeductionsYtd     = ytd.deduction + ytd.advance

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${payslipId} — ${member.name} — ${monthName}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#F3F4F6;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:12.5px}
.topbar{background:#111;padding:10px 24px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:100}
.topbar-dot{width:7px;height:7px;border-radius:50%;background:#DC2626;flex-shrink:0}
.topbar-text{font-size:12px;color:#9CA3AF;font-weight:500;flex:1}
.topbar-id{font-size:11px;color:#6B7280;background:#1F2937;padding:3px 10px;border-radius:6px;font-weight:600}
.dl-btn{background:#DC2626;color:#fff;border:none;padding:7px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px}
.page{max-width:800px;margin:20px auto 40px;background:#fff;border:1px solid #D1D5DB}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:20px 24px;border-bottom:2px solid #111}
.co-name{font-size:19px;font-weight:800;color:#111;letter-spacing:0.01em}
.co-sub{font-size:10px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px}
.co-addr{font-size:10.5px;color:#6B7280;margin-top:6px;line-height:1.6}
.slip-title{font-size:15px;font-weight:800;color:#111;text-align:right}
.slip-sub{font-size:10.5px;color:#6B7280;text-align:right;margin-top:2px}
.info-grid{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #D1D5DB}
.info-box{padding:14px 24px}
.info-box+.info-box{border-left:1px solid #D1D5DB}
.info-row{display:flex;justify-content:space-between;font-size:12px;padding:3px 0}
.info-lbl{color:#6B7280}
.info-val{font-weight:700;color:#111}
.wd-row{display:flex;border-bottom:1px solid #D1D5DB;background:#F9FAFB}
.wd-cell{flex:1;padding:10px 24px;text-align:center;border-left:1px solid #D1D5DB}
.wd-cell:first-child{border-left:none;text-align:left}
.wd-lbl{font-size:9.5px;color:#6B7280;text-transform:uppercase;letter-spacing:0.04em}
.wd-val{font-size:15px;font-weight:800;color:#111;margin-top:2px}
.amt-note{padding:8px 24px;font-size:10.5px;color:#6B7280;font-style:italic;border-bottom:1px solid #D1D5DB}
.ed-grid{display:grid;grid-template-columns:1fr 1fr}
.ed-col+.ed-col{border-left:1px solid #D1D5DB}
table.ed-table{width:100%;border-collapse:collapse}
.ed-table th{font-size:9.5px;text-transform:uppercase;letter-spacing:0.03em;color:#374151;background:#F3F4F6;padding:6px 10px;text-align:left;border-bottom:1px solid #D1D5DB}
.ed-table th:not(:first-child){text-align:right}
.ed-table td{font-size:12px;padding:6px 10px;border-bottom:1px solid #F3F4F6}
.ed-table td:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
.ed-table tr.total td{font-weight:800;border-top:2px solid #111;border-bottom:none;background:#F9FAFB}
.net-bar{display:flex;justify-content:space-between;align-items:center;padding:14px 24px;border-top:2px solid #111;background:#FEF2F2}
.net-lbl{font-size:11px;font-weight:800;color:#111;text-transform:uppercase;letter-spacing:0.06em}
.net-words{font-size:10.5px;color:#6B7280;margin-top:2px}
.net-amounts{display:flex;gap:24px;text-align:right}
.net-amt-col .net-amt-lbl{font-size:9.5px;color:#6B7280;text-transform:uppercase}
.net-amt-col .net-amt-val{font-size:17px;font-weight:900;color:#111}
.footer{padding:12px 24px;font-size:10px;color:#9CA3AF;text-align:center;border-top:1px solid #D1D5DB}
@media print{body{background:#fff}.topbar{display:none}.page{margin:0;max-width:100%;border:none}}
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-dot"></div>
  <span class="topbar-text">${member.name} &nbsp;·&nbsp; ${monthName} &nbsp;·&nbsp; Salary Slip</span>
  <span class="topbar-id">${payslipId}</span>
  <button class="dl-btn" id="dl-btn" onclick="downloadPDF()">
    <svg id="dl-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    <span id="dl-label">Download / Print</span>
  </button>
</div>
<div class="page">

  <div class="hdr">
    <div>
      <div class="co-name">${companyName}</div>
      <div class="co-sub">Group Of Companies</div>
      <div class="co-addr">4-188D, Poomalai Nagar, Kaveripattinam,<br/>Chowttahalli, Tamil Nadu 635112</div>
    </div>
    <div>
      <div class="slip-title">Salary Slip for the month of ${monthName}</div>
      <div class="slip-sub">Payslip ID: ${payslipId}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <div class="info-row"><span class="info-lbl">Name</span><span class="info-val">${member.name}</span></div>
      <div class="info-row"><span class="info-lbl">Designation</span><span class="info-val">${member.position || member.team || 'Team Member'}</span></div>
      <div class="info-row"><span class="info-lbl">Employee No</span><span class="info-val">${member.employee_id}</span></div>
      <div class="info-row"><span class="info-lbl">Team</span><span class="info-val">${member.team ?? '—'}</span></div>
    </div>
    <div class="info-box">
      <div class="info-row"><span class="info-lbl">Joining Date</span><span class="info-val">${joiningDateFmt}</span></div>
      <div class="info-row"><span class="info-lbl">Bank Name</span><span class="info-val">${kyc?.bank_name ?? '—'}</span></div>
      <div class="info-row"><span class="info-lbl">Bank A/C No</span><span class="info-val">${kyc?.bank_account ? `XXXX XXXX ${kyc.bank_account.slice(-4)}` : '—'}</span></div>
      <div class="info-row"><span class="info-lbl">IFSC</span><span class="info-val">${kyc?.bank_ifsc ?? '—'}</span></div>
    </div>
  </div>

  <div class="wd-row">
    <div class="wd-cell"><div class="wd-lbl">Total Working Days</div><div class="wd-val">${current.effectiveWorkDays}</div></div>
    <div class="wd-cell"><div class="wd-lbl">LOP Days</div><div class="wd-val">${current.deductibleDays}</div></div>
  </div>

  <div class="amt-note">(Amount in ₹)</div>

  <div class="ed-grid">
    <div class="ed-col">
      <table class="ed-table">
        <thead><tr><th>Earnings</th><th>Current Period</th><th>Year to Date</th></tr></thead>
        <tbody>
          ${earningsRows}
          <tr class="total"><td>Total Earnings</td><td>${Math.round(totalEarningsCurrent).toLocaleString('en-IN')}</td><td>${Math.round(totalEarningsYtd).toLocaleString('en-IN')}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="ed-col">
      <table class="ed-table">
        <thead><tr><th>Deductions</th><th>Current Period</th><th>Year to Date</th></tr></thead>
        <tbody>
          ${current.deduction > 0
            ? `<tr><td>Attendance Deduction (${current.deductibleDays} day${current.deductibleDays !== 1 ? 's' : ''})</td><td>${Math.round(current.deduction).toLocaleString('en-IN')}</td><td>${Math.round(ytd.deduction).toLocaleString('en-IN')}</td></tr>`
            : `<tr><td style="color:#9CA3AF">No deductions this month</td><td style="color:#9CA3AF">—</td><td>${Math.round(ytd.deduction).toLocaleString('en-IN')}</td></tr>`}
          ${current.advance > 0 ? `<tr><td>Advance Recovery</td><td>${Math.round(current.advance).toLocaleString('en-IN')}</td><td>${Math.round(ytd.advance).toLocaleString('en-IN')}</td></tr>` : ''}
          <tr class="total"><td>Total Deductions</td><td>${Math.round(totalDeductionsCurrent).toLocaleString('en-IN')}</td><td>${Math.round(totalDeductionsYtd).toLocaleString('en-IN')}</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="net-bar">
    <div>
      <div class="net-lbl">Net Pay for the month</div>
      <div class="net-words">Rupees ${inWords(Math.round(current.finalNetPay))} Only</div>
    </div>
    <div class="net-amounts">
      <div class="net-amt-col"><div class="net-amt-lbl">Current Period</div><div class="net-amt-val">${fmt(current.finalNetPay)}</div></div>
      <div class="net-amt-col"><div class="net-amt-lbl">Year to Date</div><div class="net-amt-val">${fmt(ytd.finalNetPay)}</div></div>
    </div>
  </div>

  <div class="footer">This is a computer-generated payslip. No signature is required. &nbsp;·&nbsp; Generated on ${generatedTs}</div>

</div>
<script>
function downloadPDF(){
  window.print();
}
</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
