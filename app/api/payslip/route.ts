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
  if (!requester || requester.role !== 'ADMIN') return new NextResponse('Forbidden', { status: 403 })

  const [year, mon] = month.split('-').map(Number)
  const monthStart  = `${month}-01`
  const monthEnd    = `${month}-${new Date(year, mon, 0).getDate()}`
  const workDays    = workingDaysInMonth(year, mon)

  const [{ data: memberRaw }, { data: updatesRaw }, { data: logsRaw }, { data: companyRaw }, { data: runRaw }] = await Promise.all([
    admin.from('users')
      .select('id, name, employee_id, team, employment_type, monthly_salary, hourly_rate, designation, joining_date, bank_account, phone, passport_photo_url')
      .eq('id', userId).eq('company_id', requester.company_id).single(),
    admin.from('daily_updates').select('working_hours')
      .eq('user_id', userId).gte('date', monthStart).lte('date', monthEnd),
    admin.from('attendance_logs').select('date, clock_in, clock_out')
      .eq('user_id', userId).gte('date', monthStart).lte('date', monthEnd),
    admin.from('companies').select('name, slug').eq('id', requester.company_id).single(),
    admin.from('payroll_runs').select('bonus, advance, is_paid, paid_at')
      .eq('user_id', userId).eq('month', month).maybeSingle(),
  ])

  if (!memberRaw) return new NextResponse('Member not found', { status: 404 })

  type UpdateRow = { working_hours: number | null }
  type LogRow    = { date: string; clock_in: string | null; clock_out: string | null }

  const updates     = (updatesRaw ?? []) as UpdateRow[]
  const logs        = (logsRaw   ?? []) as LogRow[]
  const presentDays = logs.filter(l => l.clock_in !== null).length || updates.filter(u => (u.working_hours ?? 0) > 0).length
  const absentDays  = Math.max(workDays - presentDays, 0)
  const leaveDays   = absentDays
  const totalHours  = Math.round(updates.reduce((s, u) => s + (u.working_hours ?? 0), 0) * 10) / 10
  const otHours     = Math.round(updates.reduce((s, u) => {
    const h = u.working_hours ?? 0; return h > 9 ? s + (h - 9) : s
  }, 0) * 10) / 10

  type MemberRow = {
    id: string; name: string; employee_id: string; team: string | null
    employment_type: string | null; monthly_salary: number | null; hourly_rate: number | null
    designation: string | null; joining_date: string | null; bank_account: string | null; phone: string | null
    passport_photo_url: string | null
  }
  const member  = memberRaw as MemberRow
  const company = companyRaw as { name: string; slug: string } | null

  const bonus   = (runRaw as any)?.bonus   ?? 0
  const advance = (runRaw as any)?.advance ?? 0

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
    otPay     = Math.round(otHours * (dailyRate / 9) * 100) / 100
  } else if (member.hourly_rate) {
    basic = Math.round(totalHours * member.hourly_rate * 100) / 100
  }

  const totalEarnings   = Math.round((basic + hra + travelAllowance + medicalAllowance + otherAllowance + otPay + bonus) * 100) / 100
  const totalDeductions = Math.round((deduction + advance) * 100) / 100
  const finalNetPay     = Math.round((totalEarnings - totalDeductions) * 100) / 100
  const attendPct      = workDays > 0 ? Math.round((presentDays / workDays) * 100) : 0

  const payDate     = new Date(year, mon, 3)
  const payDateStr  = payDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const monthName   = new Date(year, mon - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const generatedOn = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const payslipId   = `GSPL/${year}/${String(mon).padStart(2,'0')}/${member.employee_id}`

  const fmt = (n: number) => `₹ ${Math.round(n).toLocaleString('en-IN')}`
  const initials = member.name.split(' ').map((n: string) => n[0] ?? '').join('').slice(0, 2).toUpperCase()
  const companyName = company?.name ?? 'GroFast'

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

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(payslipId)}&bgcolor=FFFFFF&color=111827`

  const joiningDateFmt = member.joining_date
    ? new Date(member.joining_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—'

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

.topbar{background:#111;padding:11px 28px;display:flex;align-items:center;gap:14px;position:sticky;top:0;z-index:100}
.topbar-info{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.topbar-dot{width:8px;height:8px;border-radius:50%;background:#DC2626;flex-shrink:0}
.topbar-text{font-size:12px;color:#9CA3AF;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topbar-id{font-size:11px;color:#4B5563;background:#1F2937;padding:3px 10px;border-radius:6px;font-weight:600;flex-shrink:0}
.print-btn{background:#DC2626;color:#fff;border:none;padding:8px 22px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:7px;flex-shrink:0;box-shadow:0 4px 12px rgba(220,38,38,0.4)}

.page{max-width:860px;margin:24px auto 40px;background:#fff;border:1.5px solid #E5E7EB;border-radius:16px;overflow:hidden;box-shadow:0 4px 28px rgba(0,0,0,0.09)}

/* HEADER */
.hdr{display:flex;justify-content:space-between;align-items:flex-start;padding:26px 32px 22px;gap:16px}
.co-logo-row{display:flex;align-items:center;gap:14px;margin-bottom:10px}
.logo-box{width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#DC2626,#7F1D1D);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;flex-shrink:0;letter-spacing:-0.03em;box-shadow:0 4px 14px rgba(220,38,38,0.35)}
.co-name{font-size:17px;font-weight:900;color:#111;letter-spacing:0.01em}
.co-addr{font-size:10.5px;color:#9CA3AF;margin-top:3px;line-height:1.6}
.contact-row{display:flex;gap:20px;flex-wrap:wrap;margin-top:10px}
.contact-item{display:flex;align-items:center;gap:5px;font-size:11px;color:#374151;font-weight:500}
.slip-right{text-align:right;flex-shrink:0}
.slip-heading{font-size:28px;font-weight:900;color:#111;letter-spacing:0.12em}
.month-badge{display:inline-block;background:#FEE2E2;color:#DC2626;border-radius:20px;padding:5px 18px;font-size:13px;font-weight:700;margin:10px 0 8px}
.payslip-id-text{font-size:11.5px;color:#6B7280}
.hdivider{height:1px;background:#E5E7EB;margin:0 32px}

/* EMPLOYEE CARD */
.emp-card{margin:20px 32px;background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:14px;padding:22px;display:flex;gap:24px;align-items:flex-start}
.emp-photo{width:120px;height:148px;border-radius:12px;overflow:hidden;flex-shrink:0;border:2px solid #E5E7EB;background:#F3F4F6;display:flex;align-items:center;justify-content:center}
.emp-photo img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block}
.emp-photo-init{width:100%;height:100%;background:linear-gradient(135deg,#DC2626,#7F1D1D);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:900;color:#fff;letter-spacing:-0.04em}
.emp-details{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:18px 36px}
.emp-lbl{display:flex;align-items:center;gap:5px;font-size:10px;color:#9CA3AF;font-weight:500;margin-bottom:4px}
.emp-val{font-size:14px;font-weight:700;color:#111}

/* SUMMARY CARDS */
.summary-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 32px 20px}
.sum-card{border:1.5px solid #E5E7EB;border-radius:12px;padding:14px 16px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.04)}
.sum-top{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.sum-icon{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.sum-label{font-size:10px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.07em;line-height:1.3}
.sum-amount{font-size:20px;font-weight:900;margin-bottom:6px;letter-spacing:-0.02em}
.green-amt{color:#16A34A}.red-amt{color:#DC2626}.blue-amt{color:#2563EB}.dark-amt{color:#111}
.green-ico{background:#F0FDF4}.red-ico{background:#FEF2F2}.blue-ico{background:#EFF6FF}.purple-ico{background:#F5F3FF}

/* EARN / DEDUCT */
.earn-deduct{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 32px 20px}
.ed-card{border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 2px 6px rgba(0,0,0,0.04)}
.ed-hdr{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid #E5E7EB}
.ed-hdr-green{background:#F0FDF4}.ed-hdr-red{background:#FEF2F2}
.ed-ico{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center}
.ed-ico-green{background:#DCFCE7}.ed-ico-red{background:#FECDD3}
.ed-title{font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase}
.ed-title-green{color:#15803D}.ed-title-red{color:#991B1B}
.ed-col-hdr{display:flex;justify-content:space-between;padding:8px 16px;font-size:10px;color:#9CA3AF;font-weight:600;letter-spacing:0.07em;border-bottom:1px solid #F3F4F6}
.ed-row{display:flex;justify-content:space-between;align-items:center;padding:9px 16px;border-bottom:1px solid #F9FAFB;font-size:12.5px}
.ed-row:last-of-type{border-bottom:none}
.ed-row-name{color:#374151}
.ed-row-amt{font-weight:600;color:#111}
.ed-total{display:flex;justify-content:space-between;padding:12px 16px;font-size:12.5px;font-weight:800;margin-top:auto;border-top:2px solid #E5E7EB}
.ed-total-green{background:#F0FDF4;color:#15803D}.ed-total-red{background:#FEF2F2;color:#991B1B}

/* NET PAY */
.net-banner{margin:0 32px 20px;background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:14px;padding:20px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px;box-shadow:0 2px 8px rgba(0,0,0,0.04)}
.net-left{display:flex;align-items:center;gap:16px}
.net-bag{width:48px;height:48px;border-radius:50%;background:#DC2626;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 4px 14px rgba(220,38,38,0.35)}
.net-label{font-size:14px;font-weight:800;color:#111}
.net-inwords{font-size:11px;font-weight:500;color:#6B7280;margin-top:3px}
.net-amount{font-size:40px;font-weight:900;color:#DC2626;letter-spacing:-0.04em;white-space:nowrap}

/* BOTTOM GRID */
.bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 32px 20px}
.bot-card{border:1.5px solid #E5E7EB;border-radius:12px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.04)}
.bot-hdr{display:flex;align-items:center;gap:8px;padding:11px 16px;border-bottom:1px solid #E5E7EB;background:#F9FAFB}
.bot-hdr-ico{width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;background:#EFF6FF}
.bot-hdr-title{font-size:11px;font-weight:800;letter-spacing:0.14em;text-transform:uppercase;color:#1D4ED8}
.bot-row{display:flex;justify-content:space-between;align-items:center;padding:9px 16px;border-bottom:1px solid #F9FAFB}
.bot-row:last-child{border-bottom:none}
.bot-lbl{display:flex;align-items:center;gap:8px;font-size:12px;color:#374151}
.bot-ico{width:22px;height:22px;border-radius:6px;background:#EFF6FF;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.bot-val{font-size:12px;font-weight:600;color:#111}

/* FOOTER */
.footer{display:flex;align-items:flex-end;justify-content:space-between;padding:20px 32px;border-top:1px solid #E5E7EB;gap:16px}
.footer-qr{display:flex;gap:12px;align-items:flex-start}
.footer-disc{font-size:10px;color:#9CA3AF;line-height:1.8;max-width:190px}
.footer-logo{display:flex;align-items:center;justify-content:center;padding-bottom:4px}
.footer-logo-box{width:44px;height:44px;border-radius:11px;background:rgba(220,38,38,0.06);border:1.5px solid rgba(220,38,38,0.12);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:rgba(220,38,38,0.2)}
.sigs{display:flex;gap:36px;align-items:flex-end}
.sig{text-align:center;min-width:110px}
.sig-name{font-family:'Dancing Script',cursive;font-size:22px;color:#374151;margin-bottom:6px;line-height:1}
.sig-line{height:1px;background:#374151;margin-bottom:6px}
.sig-label{font-size:10.5px;font-weight:700;color:#374151}
.sig-sub{font-size:9px;color:#9CA3AF;margin-top:2px}

@media print{
  body{background:#fff}
  .topbar{display:none}
  .page{margin:0;max-width:100%;box-shadow:none;border-radius:0;border:none}
}
</style>
</head>
<body>

<!-- TOPBAR -->
<div class="topbar">
  <div class="topbar-info">
    <div class="topbar-dot"></div>
    <span class="topbar-text">${member.name} &nbsp;·&nbsp; ${monthName} &nbsp;·&nbsp; Salary Slip</span>
    <span class="topbar-id">${payslipId}</span>
  </div>
  <button class="print-btn" onclick="window.print()">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Download PDF
  </button>
</div>

<div class="page">

  <!-- ═══ HEADER ═══ -->
  <div class="hdr">
    <div>
      <div class="co-logo-row">
        <div class="logo-box">GF</div>
        <div>
          <div class="co-name">${companyName.toUpperCase()} SOLUTIONS PVT. LTD.</div>
          <div class="co-addr">123, Tech Park, Whitefield Main Road,<br/>Bengaluru, Karnataka 560066</div>
        </div>
      </div>
      <div class="contact-row">
        <span class="contact-item">${R.phone} +91 98765 43210</span>
        <span class="contact-item">${R.mail} hr@grofast.com</span>
        <span class="contact-item">${R.globe} www.grofast.com</span>
      </div>
    </div>
    <div class="slip-right">
      <div class="slip-heading">SALARY SLIP</div>
      <div class="month-badge">${monthName}</div>
      <div class="payslip-id-text">Payslip ID: ${payslipId}</div>
    </div>
  </div>

  <div class="hdivider"></div>

  <!-- ═══ EMPLOYEE INFO ═══ -->
  <div class="emp-card">
    <div class="emp-photo">
      ${member.passport_photo_url
        ? `<img src="${member.passport_photo_url}" alt="${member.name}" />`
        : `<div class="emp-photo-init">${initials}</div>`
      }
    </div>
    <div class="emp-details">
      <div>
        <div class="emp-lbl">${R.person} Employee Name</div>
        <div class="emp-val">${member.name}</div>
      </div>
      <div>
        <div class="emp-lbl">${R.calendar} Joining Date</div>
        <div class="emp-val">${joiningDateFmt}</div>
      </div>
      <div>
        <div class="emp-lbl">${R.person} Employee ID</div>
        <div class="emp-val">${member.employee_id}</div>
      </div>
      <div>
        <div class="emp-lbl">${R.card} Bank Account</div>
        <div class="emp-val">${member.bank_account ? member.bank_account : '—'}</div>
      </div>
      <div>
        <div class="emp-lbl">${R.building} Department</div>
        <div class="emp-val">${member.team ?? '—'}</div>
      </div>
      <div>
        <div class="emp-lbl">${R.bank} Bank Name</div>
        <div class="emp-val">—</div>
      </div>
      <div>
        <div class="emp-lbl">${R.person} Designation</div>
        <div class="emp-val">${member.designation ?? (member.team ? 'Team Member' : 'Employee')}</div>
      </div>
      <div>
        <div class="emp-lbl">${R.hash} IFSC Code</div>
        <div class="emp-val">—</div>
      </div>
    </div>
  </div>

  <!-- ═══ SUMMARY CARDS ═══ -->
  <div class="summary-row">
    <div class="sum-card">
      <div class="sum-top">
        <div class="sum-icon green-ico">${G.wallet}</div>
        <div class="sum-label">Gross Salary</div>
      </div>
      <div class="sum-amount green-amt">${fmt(totalEarnings)}</div>
      ${spGreen}
    </div>
    <div class="sum-card">
      <div class="sum-top">
        <div class="sum-icon red-ico">${R.calX}</div>
        <div class="sum-label">Leave Deduction</div>
      </div>
      <div class="sum-amount red-amt">${deduction > 0 ? fmt(deduction) : '₹ 0'}</div>
      ${spRed}
    </div>
    <div class="sum-card">
      <div class="sum-top">
        <div class="sum-icon green-ico">${G.wallet}</div>
        <div class="sum-label">Net Salary</div>
      </div>
      <div class="sum-amount green-amt">${fmt(finalNetPay)}</div>
      ${spGreen}
    </div>
    <div class="sum-card">
      <div class="sum-top">
        <div class="sum-icon blue-ico">${B.calendar}</div>
        <div class="sum-label">Paid Days</div>
      </div>
      <div class="sum-amount dark-amt">${presentDays} / ${workDays}</div>
      ${spBlue}
    </div>
  </div>

  <!-- ═══ EARNINGS + DEDUCTIONS ═══ -->
  <div class="earn-deduct">
    <!-- Earnings -->
    <div class="ed-card">
      <div class="ed-hdr ed-hdr-green">
        <div class="ed-ico ed-ico-green">${G.earn}</div>
        <span class="ed-title ed-title-green">Earnings</span>
      </div>
      <div class="ed-col-hdr"><span>Particulars</span><span>Amount (₹)</span></div>
      ${empType === 'regular' && member.monthly_salary ? `
      <div class="ed-row"><span class="ed-row-name">Basic Salary</span><span class="ed-row-amt">${Math.round(basic).toLocaleString('en-IN')}</span></div>
      <div class="ed-row"><span class="ed-row-name">HRA</span><span class="ed-row-amt">${Math.round(hra).toLocaleString('en-IN')}</span></div>
      <div class="ed-row"><span class="ed-row-name">Travel Allowance</span><span class="ed-row-amt">${Math.round(travelAllowance).toLocaleString('en-IN')}</span></div>
      <div class="ed-row"><span class="ed-row-name">Medical Allowance</span><span class="ed-row-amt">${Math.round(medicalAllowance).toLocaleString('en-IN')}</span></div>
      ${otherAllowance > 0 ? `<div class="ed-row"><span class="ed-row-name">Other Allowance</span><span class="ed-row-amt">${Math.round(otherAllowance).toLocaleString('en-IN')}</span></div>` : ''}
      ${otPay > 0 ? `<div class="ed-row"><span class="ed-row-name">Overtime Pay (${otHours}h)</span><span class="ed-row-amt">${Math.round(otPay).toLocaleString('en-IN')}</span></div>` : ''}
      ${bonus > 0  ? `<div class="ed-row"><span class="ed-row-name">Bonus / Incentive</span><span class="ed-row-amt">${Math.round(bonus).toLocaleString('en-IN')}</span></div>` : ''}
      ` : `
      <div class="ed-row"><span class="ed-row-name">Hours Worked (${totalHours}h)</span><span class="ed-row-amt">${Math.round(basic).toLocaleString('en-IN')}</span></div>
      `}
      <div class="ed-total ed-total-green"><span>Total Earnings</span><span>${fmt(totalEarnings)}</span></div>
    </div>

    <!-- Deductions -->
    <div class="ed-card">
      <div class="ed-hdr ed-hdr-red">
        <div class="ed-ico ed-ico-red">${R.deduct}</div>
        <span class="ed-title ed-title-red">Deductions</span>
      </div>
      <div class="ed-col-hdr"><span>Particulars</span><span>Amount (₹)</span></div>
      ${deduction > 0 ? `<div class="ed-row"><span class="ed-row-name">Leave Deduction (${leaveDays} day${leaveDays !== 1 ? 's' : ''})</span><span class="ed-row-amt">${Math.round(deduction).toLocaleString('en-IN')}</span></div>` : `<div class="ed-row"><span class="ed-row-name" style="color:#9CA3AF">No deductions this month</span><span class="ed-row-amt" style="color:#9CA3AF">—</span></div>`}
      ${advance > 0 ? `<div class="ed-row"><span class="ed-row-name">Advance Recovery</span><span class="ed-row-amt">${Math.round(advance).toLocaleString('en-IN')}</span></div>` : ''}
      <div class="ed-total ed-total-red"><span>Total Deductions</span><span>${fmt(totalDeductions)}</span></div>
    </div>
  </div>

  <!-- ═══ NET PAY ═══ -->
  <div class="net-banner">
    <div class="net-left">
      <div class="net-bag">
        ${ic('#fff').money}
      </div>
      <div>
        <div class="net-label">NET PAY <span style="font-size:11px;font-weight:500;color:#6B7280">(In Words)</span></div>
        <div class="net-inwords">Rupees ${inWords(Math.round(finalNetPay))} Only</div>
      </div>
    </div>
    <div class="net-amount">${fmt(finalNetPay)}</div>
  </div>

  <!-- ═══ ATTENDANCE + PAYMENT ═══ -->
  <div class="bottom-grid">
    <!-- Attendance -->
    <div class="bot-card">
      <div class="bot-hdr">
        <div class="bot-hdr-ico">${B.calendar}</div>
        <span class="bot-hdr-title">Attendance Summary</span>
      </div>
      <div class="bot-row">
        <div class="bot-lbl"><div class="bot-ico">${B.calendar}</div>Total Working Days</div>
        <div class="bot-val">${workDays}</div>
      </div>
      <div class="bot-row">
        <div class="bot-lbl"><div class="bot-ico">${B.check}</div>Present Days</div>
        <div class="bot-val">${presentDays}</div>
      </div>
      <div class="bot-row">
        <div class="bot-lbl"><div class="bot-ico">${B.calendar}</div>Leave Days</div>
        <div class="bot-val">${leaveDays}</div>
      </div>
      <div class="bot-row">
        <div class="bot-lbl"><div class="bot-ico">${B.absent}</div>Absent Days</div>
        <div class="bot-val">${Math.max(0, leaveDays)}</div>
      </div>
      <div class="bot-row">
        <div class="bot-lbl"><div class="bot-ico">${B.clock}</div>Overtime Hours</div>
        <div class="bot-val">${otHours}h</div>
      </div>
    </div>

    <!-- Payment -->
    <div class="bot-card">
      <div class="bot-hdr">
        <div class="bot-hdr-ico">${B.card}</div>
        <span class="bot-hdr-title">Payment Details</span>
      </div>
      <div class="bot-row">
        <div class="bot-lbl"><div class="bot-ico">${B.calendar}</div>Payment Date</div>
        <div class="bot-val">${payDateStr}</div>
      </div>
      <div class="bot-row">
        <div class="bot-lbl"><div class="bot-ico">${B.transfer}</div>Payment Method</div>
        <div class="bot-val">Bank Transfer</div>
      </div>
      <div class="bot-row">
        <div class="bot-lbl"><div class="bot-ico">${B.bank}</div>Bank Name</div>
        <div class="bot-val">—</div>
      </div>
      <div class="bot-row">
        <div class="bot-lbl"><div class="bot-ico">${B.card}</div>Account Number</div>
        <div class="bot-val">${member.bank_account ? `••••${member.bank_account.slice(-4)}` : '—'}</div>
      </div>
      <div class="bot-row">
        <div class="bot-lbl"><div class="bot-ico">${B.id}</div>Transaction ID</div>
        <div class="bot-val" style="font-size:10px;letter-spacing:0.04em">${payslipId.replace(/\//g,'')}TXN</div>
      </div>
    </div>
  </div>

  <!-- ═══ FOOTER ═══ -->
  <div class="footer">
    <div class="footer-qr">
      <img src="${qrUrl}" width="80" height="80" style="border-radius:8px;border:1px solid #E5E7EB" alt="QR" />
      <div class="footer-disc">
        This is a computer-generated salary slip and does not require any physical signature.<br/>
        <span style="color:#9CA3AF;font-size:9px">Generated on ${generatedOn} · ${payslipId}</span>
      </div>
    </div>
    <div class="footer-logo">
      <div class="footer-logo-box">GF</div>
    </div>
    <div class="sigs">
      <div class="sig">
        <div class="sig-name">Anjali Verma</div>
        <div class="sig-line"></div>
        <div class="sig-label">HR Manager</div>
        <div class="sig-sub">${companyName}</div>
      </div>
      <div class="sig">
        <div class="sig-name">${member.name.split(' ')[0]}</div>
        <div class="sig-line"></div>
        <div class="sig-label">Employee Signature</div>
        <div class="sig-sub">${member.name}</div>
      </div>
    </div>
  </div>

</div>
<script>if(!window.opener&&!document.referrer){setTimeout(()=>window.print(),800)}</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
