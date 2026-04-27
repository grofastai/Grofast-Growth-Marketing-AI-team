import {
  Users,
  FolderOpen,
  Target,
  CalendarCheck,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react"
import {
  GoalsPieChart,
  AttendanceRadial,
  WeeklyActivityChart,
} from "@/components/admin/dashboard-charts"

const metrics = [
  {
    label: "Present Today",
    value: "24",
    sub: "of 30 employees",
    icon: Users,
    trend: "+2 vs yesterday",
    up: true,
    accent: false,
  },
  {
    label: "Goals Completed",
    value: "12",
    sub: "of 25 this quarter",
    icon: Target,
    trend: "+3 this week",
    up: true,
    accent: false,
  },
  {
    label: "Active Projects",
    value: "8",
    sub: "2 due this week",
    icon: FolderOpen,
    trend: "-1 closed",
    up: false,
    accent: false,
  },
  {
    label: "Pending Leaves",
    value: "3",
    sub: "Awaiting your approval",
    icon: CalendarCheck,
    trend: "Action needed",
    up: null,
    accent: true,
  },
]

const recentActivities = [
  {
    name: "Priya Sharma",
    action: "submitted daily update",
    project: "Client Portal",
    time: "12 min ago",
    status: "completed",
    initials: "PS",
  },
  {
    name: "Rahul Mehta",
    action: "marked task as done",
    project: "Website Redesign",
    time: "35 min ago",
    status: "completed",
    initials: "RM",
  },
  {
    name: "Anita Roy",
    action: "requested leave",
    project: "3 days — May 5–7",
    time: "1 hr ago",
    status: "pending",
    initials: "AR",
  },
  {
    name: "Dev Kapoor",
    action: "started new task",
    project: "Mobile App v2",
    time: "2 hrs ago",
    status: "ongoing",
    initials: "DK",
  },
]

const statusConfig = {
  completed: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
  pending: { icon: Clock, color: "text-warning", bg: "bg-warning-bg" },
  ongoing: { icon: AlertCircle, color: "text-brand", bg: "bg-brand-soft" },
}

export default function DashboardPage() {
  const now = new Date()
  const hour = now.getHours()
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-[38px] leading-tight text-ink"
            style={{ fontFamily: "var(--font-syne)", fontWeight: 800 }}
          >
            {greeting},{" "}
            <span className="text-brand">Admin</span>
          </h1>
          <p className="text-ink-muted font-sans text-sm mt-1.5 tracking-wide">{dateStr}</p>
        </div>
        <div className="text-right mt-1">
          <p className="text-[10px] text-ink-muted font-sans uppercase tracking-widest mb-1">Company</p>
          <p
            className="text-ink"
            style={{ fontFamily: "var(--font-syne)", fontWeight: 600, fontSize: "15px" }}
          >
            GroFast Digital
          </p>
        </div>
      </div>

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <div
              key={m.label}
              className={`relative rounded-2xl p-5 border overflow-hidden transition-shadow hover:shadow-md ${
                m.accent
                  ? "bg-brand border-brand"
                  : "bg-card border-border"
              }`}
            >
              {m.accent && (
                <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
                  style={{
                    backgroundImage: "radial-gradient(circle at 80% 20%, #fff 0%, transparent 60%)"
                  }}
                />
              )}

              <div className="flex items-start justify-between mb-5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    m.accent ? "bg-white/15" : "bg-brand-soft"
                  }`}
                >
                  <Icon
                    size={18}
                    className={m.accent ? "text-white" : "text-brand"}
                  />
                </div>

                <div
                  className={`flex items-center gap-1 text-[11px] font-medium font-sans px-2.5 py-1 rounded-full ${
                    m.up === true
                      ? "bg-success-bg text-success"
                      : m.up === false
                      ? "bg-brand-soft text-brand"
                      : m.accent
                      ? "bg-white/20 text-white"
                      : "bg-brand-soft text-brand"
                  }`}
                >
                  {m.up === true && <TrendingUp size={10} />}
                  {m.up === false && <TrendingDown size={10} />}
                  <span>{m.trend}</span>
                </div>
              </div>

              <p
                className={`leading-none ${m.accent ? "text-white" : "text-brand"}`}
                style={{ fontFamily: "var(--font-syne)", fontWeight: 800, fontSize: "36px" }}
              >
                {m.value}
              </p>
              <p
                className={`text-[13px] font-semibold font-sans mt-1.5 ${
                  m.accent ? "text-white" : "text-ink"
                }`}
              >
                {m.label}
              </p>
              <p
                className={`text-[11px] font-sans mt-0.5 ${
                  m.accent ? "text-white/70" : "text-ink-muted"
                }`}
              >
                {m.sub}
              </p>
            </div>
          )
        })}
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-5 gap-4">
        {/* Goals Donut */}
        <div className="col-span-3 bg-card rounded-2xl p-6 border border-border">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3
                className="text-ink"
                style={{ fontFamily: "var(--font-syne)", fontWeight: 700, fontSize: "17px" }}
              >
                Goals Status
              </h3>
              <p className="text-[12px] text-ink-muted font-sans mt-0.5">
                25 total tasks · Q2 2026
              </p>
            </div>
            <button className="flex items-center gap-1 text-[11px] font-medium text-brand font-sans hover:underline">
              View all <ArrowRight size={11} />
            </button>
          </div>
          <GoalsPieChart />
        </div>

        {/* Attendance Radial */}
        <div className="col-span-2 bg-card rounded-2xl p-6 border border-border">
          <div className="mb-2">
            <h3
              className="text-ink"
              style={{ fontFamily: "var(--font-syne)", fontWeight: 700, fontSize: "17px" }}
            >
              Attendance
            </h3>
            <p className="text-[12px] text-ink-muted font-sans mt-0.5">
              Today · {now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          </div>
          <AttendanceRadial />
        </div>
      </div>

      {/* ── Weekly Activity + Recent ── */}
      <div className="grid grid-cols-5 gap-4">
        {/* Line Chart */}
        <div className="col-span-3 bg-card rounded-2xl p-6 border border-border">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3
                className="text-ink"
                style={{ fontFamily: "var(--font-syne)", fontWeight: 700, fontSize: "17px" }}
              >
                Weekly Activity
              </h3>
              <p className="text-[12px] text-ink-muted font-sans mt-0.5">
                Tasks completed vs updates submitted
              </p>
            </div>
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2">
                <div className="w-4 h-[2.5px] bg-brand rounded-full" />
                <span className="text-[11px] text-ink-muted font-sans">Tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-4 h-[2px] rounded-full bg-ink-2"
                  style={{ opacity: 0.5 }}
                />
                <span className="text-[11px] text-ink-muted font-sans">Updates</span>
              </div>
            </div>
          </div>
          <WeeklyActivityChart />
        </div>

        {/* Recent Activity Feed */}
        <div className="col-span-2 bg-card rounded-2xl p-6 border border-border">
          <div className="flex items-center justify-between mb-5">
            <h3
              className="text-ink"
              style={{ fontFamily: "var(--font-syne)", fontWeight: 700, fontSize: "17px" }}
            >
              Recent Activity
            </h3>
            <button className="flex items-center gap-1 text-[11px] font-medium text-brand font-sans hover:underline">
              All <ArrowRight size={11} />
            </button>
          </div>

          <div className="space-y-4">
            {recentActivities.map((item, i) => {
              const s = statusConfig[item.status as keyof typeof statusConfig]
              const StatusIcon = s.icon
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-cream-dark flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span
                      className="text-[10px] text-ink-2"
                      style={{ fontFamily: "var(--font-syne)", fontWeight: 700 }}
                    >
                      {item.initials}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-ink font-sans leading-tight">
                      <span
                        style={{ fontFamily: "var(--font-syne)", fontWeight: 600 }}
                      >
                        {item.name}
                      </span>{" "}
                      {item.action}
                    </p>
                    <p className="text-[11px] text-ink-muted font-sans mt-0.5 truncate">
                      {item.project}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${s.bg}`}>
                      <StatusIcon size={9} className={s.color} />
                      <span className={`text-[9px] font-medium font-sans capitalize ${s.color}`}>
                        {item.status}
                      </span>
                    </div>
                    <span className="text-[10px] text-ink-muted font-sans">{item.time}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
