import { createServerClient } from "@/lib/supabase/server"
import { Briefcase, MapPin, FolderOpen } from "lucide-react"
import Link from "next/link"

export default async function ClientsPage() {
  const supabase = await createServerClient()

  const { data: projects } = await supabase
    .from("projects")
    .select("id, client_name, business_name, location, status, service_type, deadline, progress_pct")
    .order("created_at", { ascending: false })

  const active = projects?.filter((p) => p.status === "active").length ?? 0
  const locations = new Set(projects?.map((p) => p.location).filter(Boolean)).size

  return (
    <div className="p-8 max-w-[1400px]">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>
            Clients
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>All your client projects and engagements.</p>
        </div>
        <Link href="/admin/projects"
          className="px-4 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white"
          style={{ background: "linear-gradient(135deg, #FF6B57, #E85A45)", boxShadow: "0 4px 16px rgba(255,107,87,0.25)" }}>
          + New Project
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Clients", value: projects?.length ?? 0, icon: Briefcase, color: "#6D5DF6", bg: "rgba(109,93,246,0.08)" },
          { label: "Active Projects", value: active, icon: FolderOpen, color: "#10B981", bg: "rgba(16,185,129,0.08)" },
          { label: "Locations", value: locations, icon: MapPin, color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-2xl p-5 flex items-center gap-4" style={{ background: s.bg, border: `1px solid ${s.color}20` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                <Icon size={18} style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-[28px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#E6EDF3" }}>{s.value}</p>
                <p className="text-[12px] font-sans mt-0.5" style={{ color: "#6B7280" }}>{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Client list */}
      {!projects || projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Briefcase size={40} style={{ color: "rgba(255,255,255,0.1)" }} className="mb-3" />
          <p className="text-[14px] font-semibold font-sans" style={{ color: "#6B7280" }}>No clients yet</p>
          <p className="text-[12px] font-sans mt-1 mb-4" style={{ color: "#4B5563" }}>Create projects to manage your clients.</p>
          <Link href="/admin/projects"
            className="px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white"
            style={{ background: "linear-gradient(135deg, #FF6B57, #E85A45)" }}>
            Create First Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {projects.map((p) => {
            const statusColors: Record<string, { color: string; bg: string }> = {
              active: { color: "#10B981", bg: "rgba(16,185,129,0.12)" },
              completed: { color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
              on_hold: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)" },
            }
            const sc = statusColors[p.status] ?? statusColors.active
            return (
              <div key={p.id} className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(109,93,246,0.1)" }}>
                    <Briefcase size={16} style={{ color: "#6D5DF6" }} />
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.color }}>
                    {p.status}
                  </span>
                </div>
                <h3 className="text-[14px] font-bold font-sans mb-0.5" style={{ color: "#E6EDF3" }}>{p.client_name || p.business_name}</h3>
                <p className="text-[12px] font-sans mb-2" style={{ color: "#6B7280" }}>{p.business_name}</p>
                {p.service_type && (
                  <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2"
                    style={{ background: "rgba(109,93,246,0.1)", color: "#6D5DF6" }}>
                    {p.service_type}
                  </span>
                )}
                {p.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} style={{ color: "#6B7280" }} />
                    <span className="text-[12px] font-sans" style={{ color: "#6B7280" }}>{p.location}</span>
                  </div>
                )}
                {p.progress_pct != null && (
                  <div className="mt-3">
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px] font-sans" style={{ color: "#6B7280" }}>Progress</span>
                      <span className="text-[11px] font-semibold font-sans" style={{ color: "#E6EDF3" }}>{p.progress_pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full" style={{ width: `${p.progress_pct}%`, background: "linear-gradient(90deg, #6D5DF6, #FF6B57)" }} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
