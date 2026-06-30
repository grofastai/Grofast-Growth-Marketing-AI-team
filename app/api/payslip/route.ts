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
  const monthStart  = `${month}-01`
  const monthEnd    = `${month}-${new Date(year, mon, 0).getDate()}`
  const workDays    = workingDaysInMonth(year, mon)

  const [{ data: memberRaw }, { data: updatesRaw }, { data: logsRaw }, { data: companyRaw }, { data: runRaw }, { data: kycRaw }, { data: collabRaw }] = await Promise.all([
    admin.from('users')
      .select('id, name, employee_id, team, employment_type, monthly_salary, hourly_rate, created_at, phone, passport_photo_url')
      .eq('id', userId).eq('company_id', requester.company_id).single(),
    admin.from('daily_updates').select('working_hours')
      .eq('user_id', userId).gte('date', monthStart).lte('date', monthEnd),
    admin.from('attendance_logs').select('date, clock_in, clock_out')
      .eq('user_id', userId).gte('date', monthStart).lte('date', monthEnd),
    admin.from('companies').select('name, slug').eq('id', requester.company_id).single(),
    admin.from('payroll_runs').select('bonus, advance, incentive, is_paid, paid_at')
      .eq('user_id', userId).eq('month', month).maybeSingle(),
    admin.from('member_kyc').select('bank_account, bank_name, bank_ifsc')
      .eq('user_id', userId).maybeSingle(),
    admin.from('collaboration_confirmations').select('confirmed_hours')
      .eq('collaborator_id', userId)
      .in('status', ['confirmed', 'edited_confirmed'])
      .gte('date', monthStart).lte('date', monthEnd),
  ])

  if (!memberRaw) return new NextResponse('Member not found', { status: 404 })

  type UpdateRow = { working_hours: number | null }
  type LogRow    = { date: string; clock_in: string | null; clock_out: string | null }

  const updates     = (updatesRaw ?? []) as UpdateRow[]
  const logs        = (logsRaw   ?? []) as LogRow[]
  const presentDays = logs.filter(l => l.clock_in !== null).length || updates.filter(u => (u.working_hours ?? 0) > 0).length
  const absentDays  = Math.max(workDays - presentDays, 0)
  const leaveDays   = absentDays
  const collabHours = ((collabRaw ?? []) as { confirmed_hours: number | null }[]).reduce((s, c) => s + (c.confirmed_hours ?? 0), 0)
  const totalHours  = Math.round((updates.reduce((s, u) => s + (u.working_hours ?? 0), 0) + collabHours) * 10) / 10
  const otHours     = Math.round(updates.reduce((s, u) => {
    const h = u.working_hours ?? 0; return h > 9.5 ? s + (h - 9.5) : s
  }, 0) * 10) / 10

  type MemberRow = {
    id: string; name: string; employee_id: string; team: string | null
    employment_type: string | null; monthly_salary: number | null; hourly_rate: number | null
    created_at: string | null; phone: string | null; passport_photo_url: string | null
  }
  const member  = memberRaw as MemberRow
  const company = companyRaw as { name: string; slug: string } | null
  const kyc     = kycRaw as { bank_account: string | null; bank_name: string | null; bank_ifsc: string | null } | null

  const bonus     = (runRaw as any)?.bonus     ?? 0
  const advance   = (runRaw as any)?.advance   ?? 0
  const incentive = (runRaw as any)?.incentive ?? 0

  const empType = member.employment_type ?? 'regular'
  let basic = 0, hra = 0, travelAllowance = 0, medicalAllowance = 0, otherAllowance = 0
  let deduction = 0, otPay = 0

  if (empType === 'regular' && member.monthly_salary) {
    const gross     = member.monthly_salary
    const dailyRate = gross / workDays
    basic             = Math.round(gross * 0.50)
    hra               = Math.round(basic * 0.20)        // 10% of gross
    travelAllowance   = Math.round(gross * 0.07)        // 7% of gross
    medicalAllowance  = Math.round(gross * 0.03)        // 3% of gross
    otherAllowance    = Math.max(0, gross - basic - hra - travelAllowance - medicalAllowance) // ~30%
    deduction = Math.round(absentDays * dailyRate * 100) / 100
    otPay     = Math.round(otHours * (dailyRate / 9.5) * 100) / 100
  } else if (member.hourly_rate) {
    basic = Math.round(totalHours * member.hourly_rate * 100) / 100
  }

  const totalEarnings   = Math.round((basic + hra + travelAllowance + medicalAllowance + otherAllowance + otPay + bonus + incentive) * 100) / 100
  const totalDeductions = Math.round((deduction + advance) * 100) / 100
  const finalNetPay     = Math.round((totalEarnings - totalDeductions) * 100) / 100
  const attendPct      = workDays > 0 ? Math.round((presentDays / workDays) * 100) : 0

  const payDate     = new Date(year, mon, 5)
  const payDateStr  = payDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const monthName   = new Date(year, mon - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const generatedOn = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const payslipId   = `GSPL/${year}/${String(mon).padStart(2,'0')}/${member.employee_id}`

  const fmt = (n: number) => `₹ ${Math.round(n).toLocaleString('en-IN')}`
  const initials = member.name.split(' ').map((n: string) => n[0] ?? '').join('').slice(0, 2).toUpperCase()
  const companyName = company?.name ?? 'GroFast'

  // ── Donut chart ──────────────────────────────────────────────────────────────
  const grossBase = basic + hra + travelAllowance + medicalAllowance + otherAllowance
  const pieColors = ['#22C55E','#F43F5E','#3B82F6','#F97316','#A855F7']
  const pieItems = [
    { label:'Basic Salary',      val: basic },
    { label:'HRA',               val: hra },
    { label:'Travel Allowance',  val: travelAllowance },
    { label:'Medical Allowance', val: medicalAllowance },
    { label:'Other Allowance',   val: otherAllowance },
  ].filter(it => it.val > 0)
  const pieR = 54, pieCx = 70, pieCy = 70, pieCirc = 2 * Math.PI * pieR
  let pieAcc = 0
  const donutSegs = grossBase > 0 ? pieItems.map((it, idx) => {
    const pct = it.val / grossBase
    const dash = pct * pieCirc
    const off = -(pieAcc * pieCirc)
    pieAcc += pct
    return `<circle cx="${pieCx}" cy="${pieCy}" r="${pieR}" fill="none" stroke="${pieColors[idx]}" stroke-width="20" stroke-dasharray="${dash.toFixed(1)} ${(pieCirc-dash).toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" style="transform:rotate(-90deg);transform-origin:${pieCx}px ${pieCy}px"/>`
  }).join('') : ''
  const donutSvg = `<svg viewBox="0 0 140 140" width="140" height="140"><circle cx="${pieCx}" cy="${pieCy}" r="${pieR}" fill="none" stroke="#F3F4F6" stroke-width="20"/>${donutSegs}<text x="${pieCx}" y="${pieCy-6}" text-anchor="middle" font-size="10" font-weight="800" fill="#111" font-family="Inter,sans-serif">${fmt(grossBase)}</text><text x="${pieCx}" y="${pieCy+8}" text-anchor="middle" font-size="8" fill="#9CA3AF" font-family="Inter,sans-serif">Gross Salary</text></svg>`

  // ── Timestamp ────────────────────────────────────────────────────────────────
  const generatedTs = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })

  // ── SVG Icons ────────────────────────────────────────────────────────────────
  const ic = (color: string) => ({
    person:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`,
    building: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20M10 6h.01M14 6h.01M10 10h.01M14 10h.01M10 14h.01M14 14h.01"/></svg>`,
    calendar: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    card:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    bank:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="22" x2="21" y2="22"/><path d="M12 2L3 8h18L12 2z"/><line x1="5" y1="8" x2="5" y2="22"/><line x1="10" y1="8" x2="10" y2="22"/><line x1="14" y1="8" x2="14" y2="22"/><line x1="19" y1="8" x2="19" y2="22"/></svg>`,
    hash:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>`,
    wallet:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>`,
    calX:     `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="14" x2="14" y2="18"/><line x1="14" y1="14" x2="10" y2="18"/></svg>`,
    clock:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    check:    `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    absent:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`,
    transfer: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><path d="M8 3L4 7l4 4"/><path d="M4 7h16"/><path d="M16 21l4-4-4-4"/><path d="M20 17H4"/></svg>`,
    id:       `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="12" y2="16"/></svg>`,
    money:    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M14.5 9.5a2.5 2.5 0 0 0-5 0c0 1.4 1 2.1 2.5 2.5s2.5 1.1 2.5 2.5a2.5 2.5 0 0 1-5 0"/><line x1="12" y1="7" x2="12" y2="17"/></svg>`,
    phone:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6.09 6.09l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16.92z"/></svg>`,
    mail:     `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,4 12,13 2,4"/></svg>`,
    globe:    `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    earn:     `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
    deduct:   `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  })
  const R = ic('#DC2626')
  const G = ic('#16A34A')
  const B = ic('#2563EB')

  // Sparkline paths
  const spGreen  = `<svg viewBox="0 0 80 24" width="80" height="24"><path d="M0,20 C15,17 30,12 45,9 S65,5 80,3" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round"/></svg>`
  const spRed    = `<svg viewBox="0 0 80 24" width="80" height="24"><path d="M0,4 C15,6 30,11 45,14 S65,19 80,21" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round"/></svg>`
  const spBlue   = `<svg viewBox="0 0 80 24" width="80" height="24"><path d="M0,14 C15,12 30,11 45,10 S65,9 80,8" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round"/></svg>`

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(payslipId)}&bgcolor=FFFFFF&color=111827`

  const joiningDateFmt = member.created_at
    ? new Date(member.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

  const spDotRed    = `<svg viewBox="0 0 120 28" width="120" height="28"><path d="M0,22 Q10,20 20,18 T40,14 T60,12 T80,10 T100,8 T120,6" fill="none" stroke="#FCA5A5" stroke-width="1.5" stroke-dasharray="3 3" stroke-linecap="round"/></svg>`
  const spDotGreen  = `<svg viewBox="0 0 120 28" width="120" height="28"><path d="M0,22 Q10,20 20,18 T40,14 T60,10 T80,8 T100,6 T120,4" fill="none" stroke="#86EFAC" stroke-width="1.5" stroke-dasharray="3 3" stroke-linecap="round"/></svg>`
  const spDotOrange = `<svg viewBox="0 0 120 28" width="120" height="28"><path d="M0,14 Q10,13 20,14 T40,12 T60,11 T80,12 T100,10 T120,9" fill="none" stroke="#FED7AA" stroke-width="1.5" stroke-dasharray="3 3" stroke-linecap="round"/></svg>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${payslipId} — ${member.name} — ${monthName}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Dancing+Script:wght@600;700&display=swap" rel="stylesheet"/>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:#F3F4F6;color:#111827;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:13px}
.topbar{background:#111;padding:10px 24px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:100}
.topbar-dot{width:7px;height:7px;border-radius:50%;background:#DC2626;flex-shrink:0}
.topbar-text{font-size:12px;color:#9CA3AF;font-weight:500;flex:1}
.topbar-id{font-size:11px;color:#6B7280;background:#1F2937;padding:3px 10px;border-radius:6px;font-weight:600}
.dl-btn{background:#DC2626;color:#fff;border:none;padding:7px 18px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;box-shadow:0 3px 10px rgba(220,38,38,0.4)}
.page{max-width:860px;margin:20px auto 40px;background:#fff;border-radius:16px;border:1px solid #E5E7EB;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden}
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:24px 28px 20px;gap:16px}
.co-logo{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#DC2626,#991B1B);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:900;color:#fff;flex-shrink:0;box-shadow:0 4px 12px rgba(220,38,38,0.3)}
.co-name{font-size:20px;font-weight:900;color:#111;letter-spacing:0.01em;line-height:1.1}
.co-sub{font-size:11px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:0.06em;margin-top:2px}
.co-addr{font-size:10.5px;color:#9CA3AF;margin-top:6px;line-height:1.7;display:flex;align-items:flex-start;gap:5px}
.contact-row{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px}
.contact-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#6B7280;font-weight:500}
.slip-badge{background:linear-gradient(135deg,#DC2626,#991B1B);border-radius:14px;padding:16px 22px;min-width:190px;box-shadow:0 4px 16px rgba(220,38,38,0.35);position:relative;overflow:hidden;flex-shrink:0}
.slip-badge::before{content:'';position:absolute;top:-20px;right:-20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.08)}
.slip-month{font-size:11px;font-weight:600;color:rgba(255,255,255,0.75);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:4px}
.slip-title{font-size:28px;font-weight:900;color:#fff;letter-spacing:0.1em;line-height:1}
.slip-doc{position:absolute;right:16px;top:50%;transform:translateY(-50%);opacity:0.25}
.slip-id-row{margin-top:8px;padding:0 28px}
.hdivider{height:1px;background:#F3F4F6;margin:0 28px}
.emp-card{margin:20px 28px;background:#F8F9FC;border:1.5px solid #E5E7EB;border-radius:14px;padding:22px 24px;display:flex;gap:22px;align-items:flex-start;position:relative;overflow:hidden}
.emp-watermark{position:absolute;right:-10px;bottom:-20px;font-size:120px;font-weight:900;color:rgba(0,0,0,0.04);letter-spacing:-0.06em;line-height:1;pointer-events:none}
.emp-photo{width:90px;height:90px;border-radius:50%;overflow:hidden;flex-shrink:0;border:3px solid #E5E7EB;background:#F3F4F6;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(0,0,0,0.1)}
.emp-photo img{width:100%;height:100%;object-fit:cover;object-position:top center}
.emp-photo-init{width:100%;height:100%;background:linear-gradient(135deg,#DC2626,#991B1B);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:900;color:#fff}
.emp-info{flex:1;display:flex;gap:32px}
.emp-left{flex:1}
.emp-name{font-size:20px;font-weight:800;color:#111;margin-bottom:6px}
.emp-badge{display:inline-block;background:#DCFCE7;color:#15803D;font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px;letter-spacing:0.04em;margin-bottom:14px}
.emp-field{margin-bottom:10px}
.emp-lbl{display:flex;align-items:center;gap:5px;font-size:10px;color:#9CA3AF;font-weight:500;margin-bottom:2px}
.emp-val{font-size:13px;font-weight:700;color:#111}
.emp-right{min-width:200px}
.net-banner{margin:0 28px 20px;background:#F0FDF4;border:1.5px solid #DCFCE7;border-radius:14px;padding:20px 26px;display:flex;align-items:center}
.net-left{flex:1}
.net-label{font-size:10px;font-weight:800;color:#16A34A;text-transform:uppercase;letter-spacing:0.14em;display:flex;align-items:center;gap:6px;margin-bottom:6px}
.net-label::before{content:'';width:7px;height:7px;border-radius:50%;background:#16A34A;flex-shrink:0}
.net-amount{font-size:38px;font-weight:900;color:#111;letter-spacing:-0.03em;line-height:1;margin-bottom:6px}
.net-words{font-size:11.5px;color:#6B7280;line-height:1.5;max-width:260px}
.net-divider{width:1px;background:#D1FAE5;align-self:stretch;margin:0 24px;flex-shrink:0}
.net-right{display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0}
.net-cal-icon{width:44px;height:44px;border-radius:50%;background:#DCFCE7;border:2px solid #A7F3D0;display:flex;align-items:center;justify-content:center}
.net-paid-lbl{font-size:10px;color:#6B7280;font-weight:500;text-align:center}
.net-paid-date{font-size:14px;font-weight:800;color:#111;text-align:center}
.net-method{display:inline-flex;align-items:center;gap:5px;background:#DCFCE7;color:#15803D;font-size:11px;font-weight:700;padding:4px 12px;border-radius:99px;border:1px solid #A7F3D0}
.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 28px 20px}
.kpi-card{border:1.5px solid #E5E7EB;border-radius:12px;padding:14px 16px 10px;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.04);overflow:hidden}
.kpi-top{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.kpi-icon{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.kpi-lbl{font-size:9.5px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.08em;line-height:1.3}
.kpi-val{font-size:19px;font-weight:900;margin-bottom:8px;letter-spacing:-0.02em}
.kpi-red{color:#DC2626}.kpi-green{color:#16A34A}.kpi-dark{color:#111}.kpi-orange{color:#F97316}
.kpi-ico-red{background:#FEF2F2}.kpi-ico-green{background:#F0FDF4}.kpi-ico-orange{background:#FFF7ED}
.tri-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:0 28px 20px}
.ed-card{border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04);display:flex;flex-direction:column}
.ed-hdr{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid #E5E7EB}
.ed-hdr-green{background:#F0FDF4}.ed-hdr-red{background:#FFF5F5}
.ed-ico{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center}
.ed-ico-green{background:#DCFCE7}.ed-ico-red{background:#FEE2E2}
.ed-title{font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase}
.ed-title-green{color:#15803D}.ed-title-red{color:#991B1B}
.ed-row{display:flex;justify-content:space-between;align-items:center;padding:8px 14px;border-bottom:1px solid #F9FAFB;font-size:12px}
.ed-row:last-of-type{border-bottom:none}
.ed-row-name{color:#374151}.ed-row-amt{font-weight:600;color:#111}
.ed-total{display:flex;justify-content:space-between;padding:10px 14px;font-size:12px;font-weight:800;border-top:2px solid #E5E7EB;margin-top:auto}
.ed-total-green{background:#F0FDF4;color:#15803D}.ed-total-red{background:#FFF5F5;color:#991B1B}
.breakdown-card{border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.breakdown-hdr{padding:11px 14px;border-bottom:1px solid #E5E7EB;font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#374151;background:#FAFAFA}
.breakdown-body{padding:14px;display:flex;flex-direction:column;align-items:center;gap:10px}
.pie-legend{width:100%;display:flex;flex-direction:column;gap:5px}
.pie-row{display:flex;align-items:center;justify-content:space-between;gap:6px}
.pie-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.pie-name{font-size:10.5px;color:#374151;flex:1}
.pie-pct{font-size:10.5px;font-weight:700;color:#111}
.bot-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin:0 28px 20px}
.bot-card{border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.04)}
.bot-hdr{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid #E5E7EB;background:#EFF6FF}
.bot-hdr-ico{width:24px;height:24px;border-radius:7px;background:#DBEAFE;display:flex;align-items:center;justify-content:center}
.bot-hdr-title{font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#1D4ED8}
.bot-row{display:flex;justify-content:space-between;align-items:center;padding:9px 14px;border-bottom:1px solid #F9FAFB}
.bot-row:last-child{border-bottom:none}
.bot-lbl-wrap{display:flex;align-items:center;gap:8px}
.bot-ico{width:22px;height:22px;border-radius:6px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.bot-lbl{font-size:11.5px;color:#374151}
.bot-val{font-size:11.5px;font-weight:700;color:#111}
.secure-card{border:1.5px solid #E5E7EB;border-radius:12px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,0.04);display:flex;flex-direction:column;align-items:center;gap:12px;background:#fff}
.secure-icon{width:42px;height:42px;border-radius:50%;background:#EFF6FF;display:flex;align-items:center;justify-content:center}
.secure-title{font-size:12px;font-weight:800;color:#111;text-align:center}
.secure-desc{font-size:10.5px;color:#6B7280;text-align:center;line-height:1.6}
.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:5px}
.qr-label{font-size:10px;color:#9CA3AF;text-align:center;line-height:1.5}
.footer{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:20px;padding:18px 28px;border-top:1px solid #F3F4F6;align-items:center}
.footer-disc{display:flex;align-items:flex-start;gap:10px}
.footer-shield{width:32px;height:32px;border-radius:50%;background:#FEF2F2;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.footer-disc-text{font-size:10px;color:#9CA3AF;line-height:1.8}
.sig{text-align:center}
.sig-name{font-family:'Dancing Script',cursive;font-size:22px;color:#374151;margin-bottom:5px;line-height:1}
.sig-line{height:1px;background:#D1D5DB;margin-bottom:6px}
.sig-role{font-size:11px;font-weight:700;color:#374151}
.sig-co{font-size:10px;color:#9CA3AF;margin-top:2px}
.sig-check{display:inline-flex;align-items:center;gap:4px;margin-top:5px;background:#F0FDF4;color:#16A34A;font-size:10px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #DCFCE7}
@media print{body{background:#fff}.topbar{display:none}.page{margin:0;max-width:100%;box-shadow:none;border-radius:0;border:none}}
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

  <!-- HEADER -->
  <div class="hdr">
    <div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
        <div class="co-logo">GF</div>
        <div>
          <div class="co-name">GROFAST</div>
          <div class="co-sub">Group Of Companies</div>
        </div>
      </div>
      <div class="co-addr">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-linecap="round" style="margin-top:1px;flex-shrink:0"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>4-188D, Poomalai Nagar, Kaveripattinam,<br/>Chowttahalli, Tamil Nadu 635112</span>
      </div>
      <div class="contact-row">
        <span class="contact-item">${R.phone} 9159124541 | 6382905922</span>
        <span class="contact-item">${R.mail} grofastdigital@gmail.com</span>
        <span class="contact-item">${R.globe} www.grofastdigital.com</span>
      </div>
    </div>
    <div>
      <div class="slip-badge">
        <div class="slip-month">${monthName}</div>
        <div class="slip-title">PAYSLIP</div>
        <div class="slip-doc"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div>
      </div>
      <div class="slip-id-row"><span style="font-size:11px;color:#6B7280">Payslip ID: </span><span style="font-size:11px;font-weight:700;color:#374151">${payslipId}</span></div>
    </div>
  </div>

  <div class="hdivider"></div>

  <!-- EMPLOYEE CARD -->
  <div class="emp-card">
    <div class="emp-watermark">GF</div>
    <div class="emp-photo">
      ${member.passport_photo_url
        ? `<img src="${member.passport_photo_url}" alt="${member.name}"/>`
        : `<div class="emp-photo-init">${initials}</div>`}
    </div>
    <div class="emp-info">
      <div class="emp-left">
        <div class="emp-name">${member.name}</div>
        <div class="emp-badge">Team Member</div>
        <div class="emp-field"><div class="emp-lbl">${R.person} Employee ID</div><div class="emp-val">${member.employee_id}</div></div>
        <div class="emp-field"><div class="emp-lbl">${R.building} Department</div><div class="emp-val">${member.team ?? '—'}</div></div>
        <div class="emp-field"><div class="emp-lbl">${R.person} Designation</div><div class="emp-val">${member.team ? 'Team Member' : 'Employee'}</div></div>
      </div>
      <div class="emp-right">
        <div class="emp-field"><div class="emp-lbl">${R.calendar} Joining Date</div><div class="emp-val">${joiningDateFmt}</div></div>
        <div class="emp-field"><div class="emp-lbl">${R.bank} Bank Name</div><div class="emp-val">${kyc?.bank_name ?? '—'}</div></div>
        <div class="emp-field"><div class="emp-lbl">${R.card} Account Number</div><div class="emp-val">${kyc?.bank_account ? `XXXX XXXX ${kyc.bank_account.slice(-4)}` : '—'}</div></div>
        <div class="emp-field"><div class="emp-lbl">${R.hash} IFSC Code</div><div class="emp-val">${kyc?.bank_ifsc ?? '—'}</div></div>
      </div>
    </div>
  </div>

  <!-- NET SALARY -->
  <div class="net-banner">
    <div class="net-left">
      <div class="net-label">Net Salary</div>
      <div class="net-amount">${fmt(finalNetPay)}</div>
      <div class="net-words">Rupees ${inWords(Math.round(finalNetPay))} Only</div>
    </div>
    <div class="net-divider"></div>
    <div class="net-right">
      <div class="net-cal-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div>
      <div class="net-paid-lbl">Salary Paid On</div>
      <div class="net-paid-date">${payDateStr}</div>
      <div class="net-method"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> via Bank Transfer</div>
    </div>
  </div>

  <!-- KPI CARDS -->
  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-top"><div class="kpi-icon kpi-ico-red"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg></div><div class="kpi-lbl">Gross Salary</div></div>
      <div class="kpi-val kpi-red">${fmt(totalEarnings)}</div>${spDotRed}
    </div>
    <div class="kpi-card">
      <div class="kpi-top"><div class="kpi-icon kpi-ico-red"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg></div><div class="kpi-lbl">Leave Deduction</div></div>
      <div class="kpi-val kpi-red">${deduction > 0 ? fmt(deduction) : '₹ 0'}</div>${spDotRed}
    </div>
    <div class="kpi-card">
      <div class="kpi-top"><div class="kpi-icon kpi-ico-green"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="9 15 11 17 15 13"/></svg></div><div class="kpi-lbl">Paid Days</div></div>
      <div class="kpi-val kpi-dark">${presentDays} / ${workDays}</div>${spDotGreen}
    </div>
    <div class="kpi-card">
      <div class="kpi-top"><div class="kpi-icon kpi-ico-orange"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><div class="kpi-lbl">Overtime Hours</div></div>
      <div class="kpi-val kpi-orange">${otHours} hrs</div>${spDotOrange}
    </div>
  </div>

  <!-- EARNINGS / DEDUCTIONS / BREAKDOWN -->
  <div class="tri-grid">
    <div class="ed-card">
      <div class="ed-hdr ed-hdr-green"><div class="ed-ico ed-ico-green"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div><span class="ed-title ed-title-green">Earnings</span><span style="margin-left:auto;font-size:9px;color:#9CA3AF;font-weight:600">Amount (₹)</span></div>
      ${empType === 'regular' && member.monthly_salary ? `
      <div class="ed-row"><span class="ed-row-name">Basic Salary</span><span class="ed-row-amt">${Math.round(basic).toLocaleString('en-IN')}</span></div>
      <div class="ed-row"><span class="ed-row-name">HRA</span><span class="ed-row-amt">${Math.round(hra).toLocaleString('en-IN')}</span></div>
      <div class="ed-row"><span class="ed-row-name">Travel Allowance</span><span class="ed-row-amt">${Math.round(travelAllowance).toLocaleString('en-IN')}</span></div>
      <div class="ed-row"><span class="ed-row-name">Medical Allowance</span><span class="ed-row-amt">${Math.round(medicalAllowance).toLocaleString('en-IN')}</span></div>
      ${otherAllowance > 0 ? `<div class="ed-row"><span class="ed-row-name">Other Allowance</span><span class="ed-row-amt">${Math.round(otherAllowance).toLocaleString('en-IN')}</span></div>` : ''}
      ${otPay > 0 ? `<div class="ed-row"><span class="ed-row-name">Overtime Pay (${otHours}h)</span><span class="ed-row-amt">${Math.round(otPay).toLocaleString('en-IN')}</span></div>` : ''}
      ${bonus > 0 ? `<div class="ed-row"><span class="ed-row-name">Bonus</span><span class="ed-row-amt">${Math.round(bonus).toLocaleString('en-IN')}</span></div>` : ''}
      ${incentive > 0 ? `<div class="ed-row"><span class="ed-row-name">Incentive</span><span class="ed-row-amt">${Math.round(incentive).toLocaleString('en-IN')}</span></div>` : ''}
      ` : `<div class="ed-row"><span class="ed-row-name">Hours Worked (${totalHours}h)</span><span class="ed-row-amt">${Math.round(basic).toLocaleString('en-IN')}</span></div>`}
      <div class="ed-total ed-total-green"><span>Total Earnings</span><span>${fmt(totalEarnings)}</span></div>
    </div>
    <div class="ed-card">
      <div class="ed-hdr ed-hdr-red"><div class="ed-ico ed-ico-red"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#991B1B" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div><span class="ed-title ed-title-red">Deductions</span><span style="margin-left:auto;font-size:9px;color:#9CA3AF;font-weight:600">Amount (₹)</span></div>
      ${deduction > 0 ? `<div class="ed-row"><span class="ed-row-name">Leave Deduction (${leaveDays} day${leaveDays !== 1 ? 's' : ''})</span><span class="ed-row-amt">${Math.round(deduction).toLocaleString('en-IN')}</span></div>` : `<div class="ed-row"><span class="ed-row-name" style="color:#9CA3AF">No deductions this month</span><span class="ed-row-amt" style="color:#9CA3AF">—</span></div>`}
      ${advance > 0 ? `<div class="ed-row"><span class="ed-row-name">Advance Recovery</span><span class="ed-row-amt">${Math.round(advance).toLocaleString('en-IN')}</span></div>` : ''}
      <div class="ed-total ed-total-red"><span>Total Deductions</span><span>${fmt(totalDeductions)}</span></div>
    </div>
    <div class="breakdown-card">
      <div class="breakdown-hdr">Salary Breakdown</div>
      <div class="breakdown-body">
        ${donutSvg}
        <div class="pie-legend">
          ${pieItems.map((it, idx) => `<div class="pie-row"><div class="pie-dot" style="background:${pieColors[idx]}"></div><span class="pie-name">${it.label}</span><span class="pie-pct">${grossBase > 0 ? ((it.val/grossBase)*100).toFixed(1) : '0'}%</span></div>`).join('')}
        </div>
      </div>
    </div>
  </div>

  <!-- ATTENDANCE / PAYMENT / SECURE -->
  <div class="bot-grid">
    <div class="bot-card">
      <div class="bot-hdr"><div class="bot-hdr-ico"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><span class="bot-hdr-title">Attendance Summary</span></div>
      <div class="bot-row"><div class="bot-lbl-wrap"><div class="bot-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><span class="bot-lbl">Total Working Days</span></div><span class="bot-val">${workDays}</span></div>
      <div class="bot-row"><div class="bot-lbl-wrap"><div class="bot-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></div><span class="bot-lbl">Present Days</span></div><span class="bot-val">${presentDays}</span></div>
      <div class="bot-row"><div class="bot-lbl-wrap"><div class="bot-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div><span class="bot-lbl">Leave Days</span></div><span class="bot-val">${leaveDays}</span></div>
      <div class="bot-row"><div class="bot-lbl-wrap"><div class="bot-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg></div><span class="bot-lbl">Absent Days</span></div><span class="bot-val">${Math.max(0,leaveDays)}</span></div>
      <div class="bot-row"><div class="bot-lbl-wrap"><div class="bot-ico"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F97316" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><span class="bot-lbl">Overtime Hours</span></div><span class="bot-val">${otHours} hrs</span></div>
    </div>
    <div class="bot-card">
      <div class="bot-hdr"><div class="bot-hdr-ico"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" stroke-width="2"><line x1="3" y1="22" x2="21" y2="22"/><path d="M12 2L3 8h18L12 2z"/><line x1="5" y1="8" x2="5" y2="22"/><line x1="10" y1="8" x2="10" y2="22"/><line x1="14" y1="8" x2="14" y2="22"/><line x1="19" y1="8" x2="19" y2="22"/></svg></div><span class="bot-hdr-title">Payment Details</span></div>
      <div class="bot-row"><div class="bot-lbl-wrap"><span class="bot-lbl">Payment Date</span></div><span class="bot-val">${payDateStr}</span></div>
      <div class="bot-row"><div class="bot-lbl-wrap"><span class="bot-lbl">Payment Method</span></div><span class="bot-val" style="color:#16A34A">Bank Transfer</span></div>
      <div class="bot-row"><div class="bot-lbl-wrap"><span class="bot-lbl">Bank Name</span></div><span class="bot-val">${kyc?.bank_name ?? '—'}</span></div>
      <div class="bot-row"><div class="bot-lbl-wrap"><span class="bot-lbl">Account Number</span></div><span class="bot-val">${kyc?.bank_account ? `XXXX XXXX ${kyc.bank_account.slice(-4)}` : '—'}</span></div>
      <div class="bot-row"><div class="bot-lbl-wrap"><span class="bot-lbl">Transaction ID</span></div><span class="bot-val" style="font-size:10px">${payslipId.replace(/\//g,'')}TXN</span></div>
    </div>
    <div class="secure-card">
      <div class="secure-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
      <div class="secure-title">100% Secure Payslip</div>
      <div class="secure-desc">This payslip is system generated and digitally verified.</div>
      <div class="qr-wrap">
        <img src="${qrUrl}" width="90" height="90" style="border-radius:8px;border:1px solid #E5E7EB" alt="QR"/>
        <div class="qr-label">Scan to verify<br/>this payslip</div>
      </div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <div class="footer-disc">
      <div class="footer-shield"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2" stroke-linecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
      <div class="footer-disc-text">This is a computer-generated payslip.<br/>No physical signature is required.<br/><span style="color:#D1D5DB">Generated on ${generatedTs}</span></div>
    </div>
    <div class="sig">
      <div class="sig-name">GroFast</div>
      <div class="sig-line"></div>
      <div class="sig-role">Authorised Signatory</div>
      <div class="sig-co">Grofast Group Of Companies</div>
      <div class="sig-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Verified</div>
    </div>
    <div class="sig">
      <div class="sig-name">${member.name.split(' ')[0]}</div>
      <div class="sig-line"></div>
      <div class="sig-role">Employee Signature</div>
      <div class="sig-co">${member.employee_id}</div>
      <div class="sig-check"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${member.name}</div>
    </div>
  </div>

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
