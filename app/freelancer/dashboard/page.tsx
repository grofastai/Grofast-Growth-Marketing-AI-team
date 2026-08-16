import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import Link from "next/link"
import { Users, ClipboardList, Camera, Scissors, Mic } from "lucide-react"
import { todayIST } from "@/lib/utils/ist-date"

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: React.ElementType; color: string }) {
  return (
    <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "20px 22px", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={22} color={color} />
      </div>
      <div>
        <p style={{ fontSize: 26, fontWeight: 800, color: "#1A202C", margin: 0, lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 12, color: "#718096", margin: "4px 0 0", fontWeight: 600 }}>{label}</p>
      </div>
    </div>
  )
}

export default async function FreelancerDashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const admin = adminSupabase()
  const { data: profile } = await admin
    .from("users")
    .select("company_id, name")
    .eq("id", user.id)
    .single()

  if (!profile?.company_id) redirect("/login")

  const today = todayIST()

  const [
    { count: totalFreelancers },
    { count: todayUpdates },
    { data: recentUpdates },
    { data: workTypeCounts },
  ] = await Promise.all([
    admin.from("users").select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id).eq("role", "FREELANCER").eq("status", "active"),
    admin.from("freelancer_updates").select("*", { count: "exact", head: true })
      .eq("company_id", profile.company_id).eq("date", today),
    admin.from("freelancer_updates")
      .select("id, date, work_type, client_name, shoot_title, video_name, script_name, freelancer:users!freelancer_id(name)")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(8),
    admin.from("freelancer_updates")
      .select("work_type")
      .eq("company_id", profile.company_id)
      .gte("date", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
  ])

  const shooting = workTypeCounts?.filter(r => r.work_type === "shooting").length ?? 0
  const editing  = workTypeCounts?.filter(r => r.work_type === "editing").length ?? 0
  const voiceOver = workTypeCounts?.filter(r => r.work_type === "voice_over").length ?? 0

  const workTypeIcon: Record<string, React.ElementType> = { shooting: Camera, editing: Scissors, voice_over: Mic }
  const workTypeColor: Record<string, string> = { shooting: "#3B82F6", editing: "#8B5CF6", voice_over: "#F59E0B" }
  const workTypeLabel: Record<string, string> = { shooting: "Shooting", editing: "Editing", voice_over: "Voice Over" }

  function getTitle(r: Record<string, unknown>) {
    return (r.shoot_title || r.video_name || r.script_name || "—") as string
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#1A202C", margin: 0 }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: "#718096", marginTop: 4 }}>Welcome back, {profile.name}</p>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatCard label="Active Freelancers" value={totalFreelancers ?? 0}   icon={Users}        color="#2D6A4F" />
        <StatCard label="Updates Today"       value={todayUpdates ?? 0}      icon={ClipboardList} color="#3B82F6" />
        <StatCard label="Shoots (30d)"        value={shooting}               icon={Camera}        color="#8B5CF6" />
        <StatCard label="Edits (30d)"         value={editing}                icon={Scissors}      color="#F59E0B" />
      </div>

      {/* Recent activity */}
      <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #F0F4F8", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A202C", margin: 0 }}>Recent Updates</h2>
          <Link href="/freelancer/activities" style={{ fontSize: 13, fontWeight: 600, color: "#2D6A4F", textDecoration: "none" }}>View all →</Link>
        </div>
        {!recentUpdates || recentUpdates.length === 0 ? (
          <div style={{ padding: "40px 22px", textAlign: "center", color: "#A0AEC0", fontSize: 14 }}>No updates yet. Log the first one!</div>
        ) : (
          <div>
            {recentUpdates.map((r, i) => {
              const Icon = workTypeIcon[r.work_type] ?? ClipboardList
              const color = workTypeColor[r.work_type] ?? "#718096"
              const label = workTypeLabel[r.work_type] ?? r.work_type
              const freelancer = r.freelancer as { name?: string } | null
              return (
                <div key={r.id} style={{ padding: "14px 22px", borderBottom: i < recentUpdates.length - 1 ? "1px solid #F7FAFC" : "none", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: color + "15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={16} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#2D3748", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {getTitle(r as Record<string, unknown>)}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#718096" }}>
                      {freelancer?.name ?? "—"} · {r.client_name}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: color + "15", color }}>{label}</span>
                    <p style={{ margin: "4px 0 0", fontSize: 11, color: "#A0AEC0" }}>{r.date}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick action */}
      <div style={{ marginTop: 20 }}>
        <Link href="/freelancer/update"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", background: "#2D6A4F", color: "#FFFFFF", borderRadius: 12, textDecoration: "none", fontSize: 14, fontWeight: 700 }}>
          <ClipboardList size={16} />
          Log New Update
        </Link>
      </div>
    </div>
  )
}
