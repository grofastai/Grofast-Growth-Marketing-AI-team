import { Users, FolderOpen, Target, CalendarCheck, Clock } from "lucide-react"

export default function DashboardPage() {
  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  const metrics = [
    { label: "Present Today",   value: "—", sub: "No data yet",        icon: Users,         accent: false },
    { label: "Active Tasks",    value: "—", sub: "No tasks yet",        icon: Target,        accent: false },
    { label: "Active Projects", value: "—", sub: "No projects yet",     icon: FolderOpen,    accent: true  },
    { label: "Pending Leaves",  value: "—", sub: "No pending requests", icon: CalendarCheck, accent: false },
  ]

  return (
    <div className="p-8 max-w-[1400px]">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>
            {greeting} 👋
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>{dateStr}</p>
        </div>
        <div className="text-right mt-1">
          <p className="text-[10px] uppercase tracking-widest font-sans mb-1" style={{ color: "#6B7280" }}>Company</p>
          <p className="text-[15px]" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 700, color: "#E6EDF3" }}>
            GroFast Digital
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <div
              key={m.label}
              className="rounded-2xl p-5 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 cursor-default"
              style={{
                background: m.accent
                  ? "linear-gradient(135deg, #0E3B3B, #123F3F)"
                  : "rgba(255,255,255,0.03)",
                border: m.accent
                  ? "1px solid rgba(14,59,59,0.6)"
                  : "1px solid rgba(255,255,255,0.06)",
                boxShadow: m.accent
                  ? "0 0 30px rgba(14,59,59,0.4)"
                  : "0 0 20px rgba(109,93,246,0.04)",
                backdropFilter: "blur(10px)",
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{
                    background: m.accent ? "rgba(255,255,255,0.1)" : "rgba(109,93,246,0.12)",
                  }}
                >
                  <Icon size={18} style={{ color: m.accent ? "#fff" : "#6D5DF6" }} />
                </div>
              </div>
              <p className="text-[32px] leading-none font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#E6EDF3" }}>
                {m.value}
              </p>
              <p className="text-[13px] font-semibold font-sans mt-1.5" style={{ color: m.accent ? "rgba(255,255,255,0.9)" : "#E6EDF3" }}>
                {m.label}
              </p>
              <p className="text-[11px] font-sans mt-0.5" style={{ color: m.accent ? "rgba(255,255,255,0.5)" : "#6B7280" }}>
                {m.sub}
              </p>
            </div>
          )
        })}
      </div>

      {/* Getting started */}
      <div
        className="rounded-2xl p-16 flex flex-col items-center justify-center text-center"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(109,93,246,0.12)" }}>
          <Clock size={24} style={{ color: "#6D5DF6" }} />
        </div>
        <h3 className="text-[16px] font-bold mb-2" style={{ fontFamily: "var(--font-jakarta)", color: "#E6EDF3" }}>
          Getting started
        </h3>
        <p className="text-[13px] max-w-xs font-sans" style={{ color: "#6B7280" }}>
          Add your team members, create projects, and assign tasks to see live activity here.
        </p>
        <div className="flex gap-3 mt-6">
          <a
            href="/admin/team"
            className="px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white"
            style={{
              background: "linear-gradient(135deg, #FF6B57, #E85A45)",
              boxShadow: "0 4px 16px rgba(255,107,87,0.35)",
            }}
          >
            Add Team Members
          </a>
          <a
            href="/admin/projects"
            className="px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans"
            style={{
              background: "#141D2B",
              border: "1px solid #1F2937",
              color: "#C9D1D9",
            }}
          >
            Create Project
          </a>
        </div>
      </div>

    </div>
  )
}
