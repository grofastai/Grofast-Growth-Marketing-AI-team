import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Runs at 18:30 UTC = ~midnight IST
// Marks any active MEMBER or FOUNDER/CEO who has no daily_update for today as absent.

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  // Verify this is called from Vercel Cron (not a random request)
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = adminClient()
  const today = new Date().toISOString().split("T")[0]

  // Get all companies
  const { data: companies } = await admin.from("companies").select("id")
  if (!companies) return NextResponse.json({ ok: true, marked: 0 })

  let totalMarked = 0

  for (const company of companies) {
    const cid = company.id

    // Get all active members (MEMBER, FOUNDER, CEO — not ADMIN who manages, not FREELANCER_MGR)
    const { data: members } = await admin
      .from("users")
      .select("id")
      .eq("company_id", cid)
      .eq("status", "active")
      .in("role", ["MEMBER", "FOUNDER", "CEO"])

    if (!members || members.length === 0) continue

    // Find who already submitted today
    const { data: submitted } = await admin
      .from("daily_updates")
      .select("user_id")
      .eq("company_id", cid)
      .eq("date", today)

    const submittedSet = new Set((submitted ?? []).map((s: { user_id: string }) => s.user_id))

    // Find who has an approved leave today
    const { data: onLeave } = await admin
      .from("leaves")
      .select("user_id")
      .eq("company_id", cid)
      .eq("status", "approved")
      .lte("from_date", today)
      .gte("to_date", today)

    const leaveSet = new Set((onLeave ?? []).map((l: { user_id: string }) => l.user_id))

    // Members who haven't submitted and aren't on approved leave → mark absent
    const toMarkAbsent = members
      .map((m: { id: string }) => m.id)
      .filter((id: string) => !submittedSet.has(id) && !leaveSet.has(id))

    if (toMarkAbsent.length === 0) continue

    // Upsert absent records
    const rows = toMarkAbsent.map((userId: string) => ({
      company_id: cid,
      user_id: userId,
      date: today,
      attendance_status: "absent",
      working_hours: 0,
    }))

    const { error } = await admin
      .from("daily_updates")
      .upsert(rows, { onConflict: "user_id,date", ignoreDuplicates: true })

    if (!error) totalMarked += toMarkAbsent.length
  }

  return NextResponse.json({ ok: true, date: today, marked: totalMarked })
}
