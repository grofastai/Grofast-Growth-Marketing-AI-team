import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Mail, Phone, Briefcase, Calendar, Shield } from "lucide-react"

type ProfileRow = {
  name: string
  employee_id: string
  role: string
  email: string | null
  phone: string | null
  status: string
  created_at: string
}

export default async function ProfilePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const [
    { data: profileRaw },
    { count: totalUpdates },
    { count: totalLeaves },
  ] = await Promise.all([
    supabase.from("users").select("name, employee_id, role, email, phone, status, created_at").eq("id", user.id).single(),
    supabase.from("daily_updates").select("*", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("leaves").select("*", { count: "exact", head: true }).eq("user_id", user.id),
  ])

  const profile = profileRaw as unknown as ProfileRow | null

  const joined = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
    : "—"

  return (
    <div className="p-8 max-w-[700px]">
      <div className="mb-6">
        <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>
          My Profile
        </h1>
        <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>Your account details and activity summary.</p>
      </div>

      {/* Avatar + Name */}
      <div className="rounded-2xl p-6 mb-4 flex items-center gap-5"
        style={{ background: "rgba(255,107,87,0.06)", border: "1px solid rgba(255,107,87,0.15)" }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(255,107,87,0.15)", border: "2px solid rgba(255,107,87,0.3)" }}>
          <span className="text-2xl font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#FF6B57" }}>
            {profile?.name?.charAt(0)?.toUpperCase() ?? "?"}
          </span>
        </div>
        <div>
          <h2 className="text-[22px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#E6EDF3" }}>{profile?.name ?? "—"}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[12px] font-semibold font-sans px-2.5 py-0.5 rounded-full"
              style={{ background: "rgba(109,93,246,0.15)", color: "#6D5DF6" }}>
              #{profile?.employee_id}
            </span>
            <span className="text-[12px] font-semibold font-sans px-2.5 py-0.5 rounded-full"
              style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}>
              {profile?.role ?? "MEMBER"}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Daily Updates", value: totalUpdates ?? 0, color: "#6D5DF6", bg: "rgba(109,93,246,0.08)" },
          { label: "Leave Requests", value: totalLeaves ?? 0, color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
          { label: "Status", value: profile?.status ?? "active", color: "#10B981", bg: "rgba(16,185,129,0.08)" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl p-4 text-center" style={{ background: stat.bg }}>
            <p className="text-[24px] font-black capitalize" style={{ fontFamily: "var(--font-jakarta)", color: stat.color }}>{stat.value}</p>
            <p className="text-[11px] font-sans mt-0.5" style={{ color: "#6B7280" }}>{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Details card */}
      <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <h3 className="text-[13px] font-bold font-sans uppercase tracking-wider mb-4" style={{ color: "#6B7280" }}>Account Details</h3>
        <div className="space-y-3">
          {[
            { icon: Mail, label: "Email", value: profile?.email ?? user?.email ?? "—" },
            { icon: Phone, label: "Phone", value: profile?.phone ?? "—" },
            { icon: Briefcase, label: "Employee ID", value: `#${profile?.employee_id ?? "—"}` },
            { icon: Shield, label: "Role", value: profile?.role ?? "MEMBER" },
            { icon: Calendar, label: "Joined", value: joined },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.05)" }}>
                <Icon size={14} style={{ color: "#6B7280" }} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] uppercase tracking-wider font-sans" style={{ color: "#4B5563" }}>{label}</p>
                <p className="text-[13px] font-semibold font-sans capitalize" style={{ color: "#E6EDF3" }}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
