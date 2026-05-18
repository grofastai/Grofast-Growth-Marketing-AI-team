import { redirect } from "next/navigation"
import { createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { Camera, Scissors, Mic, CheckCircle } from "lucide-react"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const WORK_TYPE_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  shooting:   { label: "Shooting",   color: "#3B82F6", icon: Camera },
  editing:    { label: "Editing",    color: "#8B5CF6", icon: Scissors },
  voice_over: { label: "Voice Over", color: "#F59E0B", icon: Mic },
}

function WorkTypeBadge({ type }: { type: string }) {
  const meta = WORK_TYPE_META[type] ?? { label: type, color: "#718096", icon: Mic }
  const Icon = meta.icon
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: meta.color + "15", color: meta.color, fontSize: 11, fontWeight: 700 }}>
      <Icon size={11} />
      {meta.label}
    </span>
  )
}

export default async function FreelancerActivitiesPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("company_id")
    .eq("id", user.id)
    .single()

  if (!profile?.company_id) redirect("/login")

  const { data: updates } = await admin
    .from("freelancer_updates")
    .select(`
      id, date, work_type, client_name,
      shoot_title, shoot_duration, video_uploaded,
      video_name, video_type, time_taken, revisions,
      script_name, vo_duration,
      freelancer:users!freelancer_id(name, employee_id),
      submitter:users!submitted_by(name),
      created_at
    `)
    .eq("company_id", profile.company_id)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200)

  function getWorkSummary(r: Record<string, unknown>) {
    if (r.work_type === "shooting") return `${r.shoot_title ?? "—"}  ·  ${r.shoot_duration ?? "?"}h`
    if (r.work_type === "editing")  return `${r.video_name ?? "—"}  ·  ${r.time_taken ?? "?"}h  ·  ${r.revisions ?? 0} rev`
    if (r.work_type === "voice_over") return `${r.script_name ?? "—"}  ·  ${r.vo_duration ?? "?"}`
    return "—"
  }

  // Group by date
  const byDate: Record<string, typeof updates> = {}
  for (const u of updates ?? []) {
    if (!byDate[u.date]) byDate[u.date] = []
    byDate[u.date]!.push(u)
  }
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1A202C", margin: 0 }}>Activities</h1>
        <p style={{ fontSize: 14, color: "#718096", marginTop: 4 }}>All freelancer work updates</p>
      </div>

      {dates.length === 0 ? (
        <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0", padding: "60px 22px", textAlign: "center" }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#4A5568", margin: 0 }}>No updates yet</p>
          <p style={{ fontSize: 13, color: "#A0AEC0", margin: "4px 0 0" }}>Log the first update from the &quot;Log Update&quot; page</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {dates.map(date => {
            const rows = byDate[date] ?? []
            return (
              <div key={date}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#718096", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
                  {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                <div style={{ background: "#FFFFFF", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
                  {rows.map((r, i) => {
                    const freelancer = r.freelancer as { name?: string; employee_id?: string } | null
                    return (
                      <div key={r.id} style={{ padding: "16px 20px", borderBottom: i < rows.length - 1 ? "1px solid #F7FAFC" : "none", display: "flex", alignItems: "flex-start", gap: 14 }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: (WORK_TYPE_META[r.work_type]?.color ?? "#718096") + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                          {(() => { const Icon = WORK_TYPE_META[r.work_type]?.icon ?? Mic; return <Icon size={16} color={WORK_TYPE_META[r.work_type]?.color ?? "#718096"} /> })()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#2D3748" }}>
                              {freelancer?.name ?? "—"}
                              <span style={{ fontSize: 11, color: "#A0AEC0", marginLeft: 6 }}>({freelancer?.employee_id ?? "—"})</span>
                            </span>
                            <WorkTypeBadge type={r.work_type} />
                            {r.work_type === "shooting" && r.video_uploaded && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#2D6A4F", fontWeight: 600 }}>
                                <CheckCircle size={11} /> Uploaded
                              </span>
                            )}
                          </div>
                          <p style={{ margin: "3px 0 0", fontSize: 13, color: "#4A5568" }}>
                            {getWorkSummary(r as Record<string, unknown>)}
                          </p>
                          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#A0AEC0" }}>
                            Client: {r.client_name} · Logged by {(r.submitter as { name?: string } | null)?.name ?? "—"}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
