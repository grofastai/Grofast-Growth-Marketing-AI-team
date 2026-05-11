"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Search, SlidersHorizontal, Plus, MoreHorizontal,
  Calendar, MessageSquare, Paperclip, Clock,
  Sparkles, Target, TrendingUp, CheckCircle2,
  Loader2, ChevronDown, FileEdit, Zap, Flame,
} from "lucide-react"
import { updateTaskStatus } from "@/lib/actions/tasks"

interface Task {
  id: string
  title: string
  description: string | null
  status: "todo" | "in_progress" | "completed"
  priority: "low" | "medium" | "high"
  due_date: string | null
  projects: { id: string; business_name: string } | null
}

// ── Design tokens ─────────────────────────────────────────────────────────────
const PRIORITY_STYLE = {
  high:   { bg: "rgba(222,26,26,0.1)",   color: "#de1a1a", label: "High"   },
  medium: { bg: "rgba(245,158,11,0.1)",  color: "#D97706", label: "Medium" },
  low:    { bg: "rgba(59,130,246,0.1)",  color: "#3B82F6", label: "Low"    },
}

const KANBAN_COLS = [
  { key: "todo"        as const, label: "To Do",       accent: "#6B7280", headerBg: "#F9FAFB" },
  { key: "in_progress" as const, label: "In Progress", accent: "#F59E0B", headerBg: "#FFFBEB" },
  { key: "completed"   as const, label: "Completed",   accent: "#22C55E", headerBg: "#F0FDF4" },
]

// Fixed sparkline trend data (deterministic)
const SPARK = {
  hours:  [1.5, 2.1, 3.0, 2.5, 3.2, 2.8, 3.6],
  active: [12,  10,  11,  9,   10,  8,   8  ],
  done:   [6,   7,   8,   9,   10,  11,  12 ],
  prod:   [75,  78,  80,  79,  84,  85,  87 ],
}

// Deterministic progress from task id
function taskPct(id: string) {
  const n = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return 30 + (n % 41) // 30–70
}

// ── Mini Sparkline ────────────────────────────────────────────────────────────
function MiniSparkline({ data, color, id }: { data: number[]; color: string; id: string }) {
  const w = 80, h = 28, px = 1, py = 3
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1
  const xs = data.map((_, i) => px + (i / (data.length - 1)) * (w - px * 2))
  const ys = data.map(v => h - py - ((v - min) / range) * (h - py * 2))
  const gid = `sg${id}`

  let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`
  for (let i = 0; i < xs.length - 1; i++) {
    const cpx = (xs[i] + xs[i + 1]) / 2
    d += ` C${cpx.toFixed(1)},${ys[i].toFixed(1)} ${cpx.toFixed(1)},${ys[i + 1].toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`
  }
  const area = `${d} L${xs[xs.length - 1].toFixed(1)},${h} L${xs[0].toFixed(1)},${h} Z`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: 80, height: 28, flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function DonutChart({ completed, inProgress, todo }: { completed: number; inProgress: number; todo: number }) {
  const total = completed + inProgress + todo || 1
  const pct = Math.round((completed / total) * 100)
  const r = 36, cx = 44, cy = 44, sw = 10
  const circ = 2 * Math.PI * r
  const c1 = (completed / total) * circ
  const c2 = (inProgress / total) * circ

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 88 88" style={{ width: 80, height: 80, transform: "rotate(-90deg)", flexShrink: 0 }}>
        {/* bg ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={sw} />
        {/* todo arc */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E5E7EB" strokeWidth={sw}
          strokeDasharray={`${circ - c1 - c2} ${circ}`} strokeDashoffset={-(c1 + c2)} />
        {/* in_progress arc */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F59E0B" strokeWidth={sw}
          strokeDasharray={`${c2} ${circ}`} strokeDashoffset={-c1} />
        {/* completed arc */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22C55E" strokeWidth={sw}
          strokeDasharray={`${c1} ${circ}`} />
      </svg>
      <div>
        <p className="text-[22px] font-black leading-none" style={{ color: "#111111" }}>{pct}%</p>
        <p className="text-[10px] mt-0.5 mb-2" style={{ color: "#9CA3AF" }}>This Week</p>
        {[
          { dot: "#22C55E", label: "Completed", val: completed },
          { dot: "#F59E0B", label: "In Progress", val: inProgress },
          { dot: "#E5E7EB", label: "To Do", val: todo },
        ].map(r => (
          <div key={r.label} className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.dot }} />
            <span className="text-[10px]" style={{ color: "#6B7280" }}>{r.label}</span>
            <span className="text-[10px] font-bold ml-auto pl-2" style={{ color: "#111111" }}>{r.val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Heatmap ───────────────────────────────────────────────────────────────────
function HeatMap() {
  const rows = [
    { day: "Mon", vals: [0.2, 0.5, 0.9, 0.6, 1.0, 0.3, 0.7] },
    { day: "Wed", vals: [0.6, 0.8, 0.4, 0.9, 0.5, 0.7, 0.2] },
    { day: "Sun", vals: [0.9, 0.3, 0.7, 0.4, 0.8, 1.0, 0.5] },
  ]
  return (
    <div className="space-y-1.5">
      {rows.map(row => (
        <div key={row.day} className="flex items-center gap-1.5">
          <span className="text-[9px] w-5 flex-shrink-0" style={{ color: "#9CA3AF" }}>{row.day}</span>
          {row.vals.map((v, i) => (
            <div key={i} className="flex-1 h-4 rounded-sm" style={{ background: `rgba(222,26,26,${v})` }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// ── Avatar Stack ─────────────────────────────────────────────────────────────
function AvatarStack() {
  const colors = ["#de1a1a", "#6366F1", "#0EA5E9"]
  return (
    <div className="flex -space-x-1.5">
      {colors.slice(0, 2).map((c, i) => (
        <div key={i} className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-[7px] font-black text-white flex-shrink-0"
          style={{ background: c }}>
          {String.fromCharCode(65 + i)}
        </div>
      ))}
    </div>
  )
}

// ── Kanban Task Card ─────────────────────────────────────────────────────────
function KanbanCard({
  task, today, onMove,
}: {
  task: Task
  today: string
  onMove: (id: string, status: "todo" | "in_progress" | "completed") => void
}) {
  const pr = PRIORITY_STYLE[task.priority]
  const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
  const isOverdue = !!task.due_date && task.due_date < today && task.status !== "completed"
  const pct = task.status === "completed" ? 100 : task.status === "in_progress" ? taskPct(task.id) : 0
  const progressColor = pct === 100 ? "#22C55E" : pct > 50 ? "#F59E0B" : "#6366F1"
  const dueLabel = task.due_date
    ? new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null

  return (
    <div className="rounded-2xl p-3.5 mb-2.5 group transition-all"
      style={{
        background: "#FFFFFF",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        border: isOverdue ? "1px solid rgba(222,26,26,0.2)" : "1px solid transparent",
      }}>

      {/* Title row */}
      <div className="flex items-start gap-2 mb-2">
        <p className="text-[12px] font-semibold leading-snug flex-1 line-clamp-2" style={{ color: "#111111" }}>
          {task.title}
        </p>
        <button className="flex-shrink-0 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-gray-100">
          <MoreHorizontal size={11} style={{ color: "#9CA3AF" }} />
        </button>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1 mb-2.5">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: pr.bg, color: pr.color }}>
          {pr.label}
        </span>
        {project && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full truncate max-w-[80px]"
            style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}>
            {project.business_name}
          </span>
        )}
        {task.status === "in_progress" && (
          <Sparkles size={10} className="ml-auto" style={{ color: "#F59E0B" }} />
        )}
      </div>

      {/* Progress bar */}
      {pct > 0 && (
        <div className="mb-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px]" style={{ color: "#9CA3AF" }}>Progress</span>
            <span className="text-[8px] font-bold" style={{ color: "#374151" }}>{pct}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: progressColor, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <AvatarStack />
        <div className="flex items-center gap-2">
          {dueLabel && (
            <span className="flex items-center gap-0.5 text-[9px]" style={{ color: isOverdue ? "#de1a1a" : "#9CA3AF" }}>
              <Calendar size={8} />{dueLabel}
            </span>
          )}
          <span className="flex items-center gap-0.5 text-[9px]" style={{ color: "#9CA3AF" }}>
            <MessageSquare size={8} />2
          </span>
          <span className="flex items-center gap-0.5 text-[9px]" style={{ color: "#9CA3AF" }}>
            <Paperclip size={8} />1
          </span>
        </div>
      </div>

      {/* Move button */}
      {task.status !== "completed" && (
        <button
          onClick={() => onMove(task.id, task.status === "todo" ? "in_progress" : "completed")}
          className="w-full mt-2.5 py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80"
          style={{
            background: task.status === "todo" ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)",
            color: task.status === "todo" ? "#D97706" : "#16A34A",
          }}>
          {task.status === "todo" ? "→ Move to In Progress" : "→ Mark Completed"}
        </button>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MemberTasksClient({
  tasks: initialTasks,
  todayHours,
}: {
  tasks: Task[]
  todayHours: number
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [activeMobileCol, setActiveMobileCol] = useState<"todo" | "in_progress" | "completed">("todo")
  const [, startTransition] = useTransition()

  function handleFilterChange(key: string) {
    setFilter(key)
    if (key === "todo" || key === "in_progress" || key === "completed") {
      setActiveMobileCol(key)
    }
  }

  const today = new Date().toISOString().split("T")[0]

  const total     = tasks.length
  const doneTasks = tasks.filter(t => t.status === "completed")
  const wip       = tasks.filter(t => t.status === "in_progress")
  const todos     = tasks.filter(t => t.status === "todo")
  const activeCount = wip.length + todos.length
  const productivity = total > 0 ? Math.round((doneTasks.length / total) * 100) : 0

  function moveTask(id: string, status: "todo" | "in_progress" | "completed") {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    startTransition(async () => { await updateTaskStatus(id, status) })
  }

  function colTasks(key: "todo" | "in_progress" | "completed") {
    let list = tasks.filter(t => t.status === key)
    if (search.trim()) list = list.filter(t => t.title.toLowerCase().includes(search.toLowerCase()))
    return list
  }

  const STAT_CARDS = [
    { id: "h",  label: "Worked Hours", value: todayHours > 0 ? `${todayHours}h` : "—",  sub: "↑ 12% from yesterday",  color: "#de1a1a", data: SPARK.hours  },
    { id: "a",  label: "Active Tasks",  value: String(activeCount),                       sub: `${wip.length} in progress`,color: "#22C55E", data: SPARK.active },
    { id: "c",  label: "Completed",     value: String(doneTasks.length),                  sub: "↑ 20% this week",       color: "#6366F1", data: SPARK.done   },
    { id: "p",  label: "Productivity",  value: `${productivity}%`,                        sub: "↑ 8% improvement",      color: "#F59E0B", data: SPARK.prod   },
  ]

  const FILTER_TABS = [
    { key: "all",         label: "All",         count: total },
    { key: "todo",        label: "To Do",        count: todos.length },
    { key: "in_progress", label: "In Progress",  count: wip.length },
    { key: "completed",   label: "Completed",    count: doneTasks.length },
  ]

  return (
    <div className="flex" style={{ background: "#F8F9FB", minHeight: "100vh" }}>

      {/* ═══ MAIN ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 overflow-auto p-4 md:p-5 xl:p-6">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-start gap-3 mb-6">
          <div className="flex-1 min-w-[160px]">
            <h1 className="text-[28px] md:text-[32px] font-black leading-tight"
              style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>My Tasks</h1>
            <p className="text-[13px] mt-0.5" style={{ color: "#6B7280" }}>
              {activeCount > 0 ? `${activeCount} active tasks · Let's crush them!` : "You're all caught up 🎉"}
            </p>
          </div>

          {/* Search + sort + new */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
              <Search size={13} style={{ color: "#9CA3AF" }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search tasks..."
                className="bg-transparent outline-none text-[12px] flex-1 sm:w-[150px]"
                style={{ color: "#111111" }}
              />
            </div>
            <div className="flex items-center gap-2">
              <button className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold flex-1 sm:flex-none"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#374151" }}>
                <SlidersHorizontal size={12} /> Sort
              </button>
              <button className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold flex-1 sm:flex-none"
                style={{ background: "#de1a1a", color: "#FFFFFF", boxShadow: "0 3px 12px rgba(222,26,26,0.3)" }}>
                <Plus size={13} /> New Task
              </button>
            </div>
          </div>

          {/* Mini stat pills */}
          <div className="hidden lg:flex items-center rounded-2xl overflow-hidden"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
            {[
              { icon: Clock,        color: "#de1a1a", val: todayHours > 0 ? `${todayHours}h` : "—", lbl: "Worked"     },
              { icon: Zap,          color: "#22C55E", val: String(activeCount),                       lbl: "Active"     },
              { icon: CheckCircle2, color: "#6366F1", val: String(doneTasks.length),                  lbl: "Completed"  },
              { icon: TrendingUp,   color: "#F59E0B", val: `${productivity}%`,                        lbl: "Productivity"},
            ].map((s, i, arr) => (
              <div key={s.lbl} className="flex items-center gap-2 px-4 py-2.5"
                style={{ borderRight: i < arr.length - 1 ? "1px solid #F3F4F6" : "none" }}>
                <s.icon size={13} style={{ color: s.color }} />
                <div>
                  <p className="text-[14px] font-black leading-none" style={{ color: s.color, fontFamily: "var(--font-jakarta)" }}>{s.val}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: "#9CA3AF" }}>{s.lbl}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {STAT_CARDS.map(card => (
            <div key={card.id} className="rounded-2xl p-4 flex flex-col"
              style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>{card.label}</p>
              <p className="text-[28px] font-black leading-tight mb-3"
                style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>{card.value}</p>
              <div className="flex items-end justify-between mt-auto">
                <p className="text-[11px] font-semibold" style={{ color: card.color }}>{card.sub}</p>
                <MiniSparkline data={card.data} color={card.color} id={card.id} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ── */}
        <div className="flex items-center justify-between mb-5 gap-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1 flex-1 min-w-0" style={{ scrollbarWidth: "none" }}>
            {FILTER_TABS.map(tab => {
              const active = filter === tab.key
              return (
                <button key={tab.key} onClick={() => handleFilterChange(tab.key)}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
                  style={active
                    ? { background: "#de1a1a", color: "#FFFFFF", boxShadow: "0 3px 10px rgba(222,26,26,0.25)" }
                    : { background: "#FFFFFF", color: "#6B7280", border: "1px solid #E5E7EB" }
                  }>
                  {tab.label} ({tab.count})
                </button>
              )
            })}
          </div>
          <button className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#374151" }}>
            <span className="hidden sm:inline">Sort by: Priority</span>
            <span className="sm:hidden">Sort</span>
            <ChevronDown size={11} />
          </button>
        </div>

        {/* ── Kanban board ── */}

        {/* Mobile: column tab switcher */}
        <div className="md:hidden flex gap-1.5 overflow-x-auto mb-3 pb-1" style={{ scrollbarWidth: "none" }}>
          {KANBAN_COLS.map(col => (
            <button key={col.key}
              onClick={() => setActiveMobileCol(col.key)}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold transition-all"
              style={activeMobileCol === col.key
                ? { background: col.accent, color: "#FFFFFF", boxShadow: `0 3px 10px ${col.accent}40` }
                : { background: "#FFFFFF", color: "#6B7280", border: "1px solid #E5E7EB" }
              }>
              {col.label}
              <span className="w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center"
                style={{
                  background: activeMobileCol === col.key ? "rgba(255,255,255,0.25)" : `${col.accent}20`,
                  color: activeMobileCol === col.key ? "#FFFFFF" : col.accent,
                }}>
                {colTasks(col.key).length}
              </span>
            </button>
          ))}
        </div>

        {/* Mobile: single active column */}
        <div className="md:hidden mb-6">
          {KANBAN_COLS.filter(col => col.key === activeMobileCol).map(col => {
            const list = colTasks(col.key)
            return (
              <div key={col.key} className="rounded-2xl"
                style={{ border: "1px solid #E8E9EF", background: "#F9FAFB" }}>
                <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl"
                  style={{ background: "#FFFFFF", borderBottom: "1px solid #E8E9EF" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-black" style={{ color: "#111111" }}>{col.label}</span>
                    <span className="w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center"
                      style={{ background: `${col.accent}20`, color: col.accent }}>
                      {list.length}
                    </span>
                  </div>
                  <button className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
                    <Plus size={12} style={{ color: "#9CA3AF" }} />
                  </button>
                </div>
                <div className="p-3">
                  {list.length === 0 ? (
                    <div className="flex items-center justify-center py-8 rounded-xl"
                      style={{ border: "2px dashed #E5E7EB" }}>
                      <p className="text-[11px]" style={{ color: "#D1D5DB" }}>No tasks</p>
                    </div>
                  ) : (
                    list.map(task => (
                      <KanbanCard key={task.id} task={task} today={today} onMove={moveTask} />
                    ))
                  )}
                  <button className="w-full flex items-center gap-1.5 justify-center py-2 rounded-xl text-[11px] font-semibold transition-colors hover:bg-gray-100"
                    style={{ color: "#9CA3AF" }}>
                    <Plus size={11} /> Add Task
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Desktop: 3-column grid */}
        <div className="hidden md:grid grid-cols-3 gap-4 mb-6">
          {KANBAN_COLS.map(col => {
            const list   = colTasks(col.key)
            const dimmed = filter !== "all" && filter !== col.key
            return (
              <div key={col.key} className="rounded-2xl transition-all"
                style={{ opacity: dimmed ? 0.35 : 1, border: "1px solid #E8E9EF", background: "#F9FAFB" }}>

                {/* Column header */}
                <div className="flex items-center justify-between px-4 py-3 rounded-t-2xl"
                  style={{ background: "#FFFFFF", borderBottom: "1px solid #E8E9EF" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-black" style={{ color: "#111111" }}>{col.label}</span>
                    <span className="w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center"
                      style={{ background: `${col.accent}20`, color: col.accent }}>
                      {list.length}
                    </span>
                  </div>
                  <button className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors">
                    <Plus size={12} style={{ color: "#9CA3AF" }} />
                  </button>
                </div>

                {/* Task list */}
                <div className="p-3">
                  {list.length === 0 ? (
                    <div className="flex items-center justify-center py-8 rounded-xl"
                      style={{ border: "2px dashed #E5E7EB" }}>
                      <p className="text-[11px]" style={{ color: "#D1D5DB" }}>No tasks</p>
                    </div>
                  ) : (
                    list.map(task => (
                      <KanbanCard key={task.id} task={task} today={today} onMove={moveTask} />
                    ))
                  )}
                  <button className="w-full flex items-center gap-1.5 justify-center py-2 rounded-xl text-[11px] font-semibold transition-colors hover:bg-gray-100"
                    style={{ color: "#9CA3AF" }}>
                    <Plus size={11} /> Add Task
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Bottom row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Smart Insights */}
          <div className="rounded-2xl p-5"
            style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(222,26,26,0.1)" }}>
                <Sparkles size={14} style={{ color: "#de1a1a" }} />
              </div>
              <h3 className="text-[14px] font-black" style={{ color: "#111111" }}>Smart Insights</h3>
            </div>
            <p className="text-[13px] font-semibold mb-1" style={{ color: "#374151" }}>
              You&apos;re most productive between{" "}
              <span style={{ color: "#de1a1a" }}>10AM – 1PM</span>
            </p>
            <p className="text-[12px] mb-4" style={{ color: "#9CA3AF" }}>
              You completed 20% more tasks this week. Keep the momentum!
            </p>
            <button className="px-5 py-2.5 rounded-xl text-[12px] font-bold transition-all hover:opacity-80"
              style={{ background: "rgba(222,26,26,0.07)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.15)" }}>
              View Insights
            </button>
          </div>

          {/* Workflow Timeline */}
          <div className="rounded-2xl p-5"
            style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <h3 className="text-[14px] font-black mb-5" style={{ color: "#111111" }}>Workflow Timeline</h3>
            <div className="flex items-center">
              {([
                { label: "Created",     date: "May 6", done: true  },
                { label: "In Progress", date: "May 7", done: true  },
                { label: "Review",      date: "May 8", done: false, active: true },
                { label: "Completed",   date: "May 9", done: false },
              ] as const).map((step, i, arr) => (
                <div key={step.label} className="flex-1 flex flex-col items-center">
                  <div className="flex items-center w-full">
                    {i > 0 && (
                      <div className="flex-1 h-0.5" style={{ background: arr[i - 1].done ? "#22C55E" : "#E5E7EB" }} />
                    )}
                    <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all"
                      style={{
                        background:   step.done ? "#22C55E" : "active" in step && step.active ? "#de1a1a" : "#FFFFFF",
                        borderColor:  step.done ? "#22C55E" : "active" in step && step.active ? "#de1a1a" : "#E5E7EB",
                      }}>
                      {step.done
                        ? <CheckCircle2 size={14} style={{ color: "#FFFFFF" }} />
                        : <div className="w-2 h-2 rounded-full"
                            style={{ background: "active" in step && step.active ? "#FFFFFF" : "#D1D5DB" }} />
                      }
                    </div>
                    {i < arr.length - 1 && (
                      <div className="flex-1 h-0.5" style={{ background: step.done ? "#22C55E" : "#E5E7EB" }} />
                    )}
                  </div>
                  <p className="text-[9px] font-semibold mt-1.5 text-center" style={{ color: "#374151" }}>{step.label}</p>
                  <p className="text-[8px]" style={{ color: "#9CA3AF" }}>{step.date}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ═══ RIGHT SIDEBAR ════════════════════════════════════════════════════ */}
      <div className="hidden xl:flex flex-col w-[260px] flex-shrink-0 gap-4 p-4 overflow-y-auto"
        style={{ borderLeft: "1px solid #E8E9EF", background: "#FAFAFA", position: "sticky", top: 0, maxHeight: "100vh" }}>

        {/* AI Task Assistant */}
        <div className="rounded-2xl p-4"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="flex items-start gap-3 mb-3">
            <div className="text-[34px] leading-none flex-shrink-0">🤖</div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-black" style={{ color: "#111111" }}>Task Assistant</p>
              <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "#6B7280" }}>
                I found{" "}
                <span className="font-bold" style={{ color: "#de1a1a" }}>
                  {Math.min(3, todos.length)}
                </span>{" "}
                tasks you can focus on today.
              </p>
            </div>
          </div>
          <button className="w-full py-2 rounded-xl text-[11px] font-bold transition-all hover:opacity-80"
            style={{ background: "rgba(222,26,26,0.06)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.15)" }}>
            View Suggestions
          </button>
        </div>

        {/* Daily Focus + Streak */}
        <div className="rounded-2xl p-4"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <p className="text-[13px] font-black mb-0.5" style={{ color: "#111111" }}>Daily Focus</p>
          <p className="text-[11px] mb-2.5" style={{ color: "#6B7280" }}>
            You&apos;re on a{" "}
            <span className="font-bold" style={{ color: "#F59E0B" }}>4 day</span>
            {" "}productivity streak!
          </p>
          <div className="flex items-center gap-0.5 mb-3">
            {[...Array(4)].map((_, i) => <Flame key={i} size={18} style={{ color: "#F59E0B" }} />)}
            {[...Array(3)].map((_, i) => <Flame key={i} size={18} style={{ color: "#E5E7EB" }} />)}
          </div>
          <div className="flex items-center gap-2 pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
            <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(222,26,26,0.1)" }}>
              <Target size={13} style={{ color: "#de1a1a" }} />
            </div>
            <div>
              <p className="text-[11px] font-bold" style={{ color: "#111111" }}>Today&apos;s Goal</p>
              <p className="text-[10px]" style={{ color: "#9CA3AF" }}>Complete {Math.min(3, todos.length)} tasks</p>
            </div>
          </div>
        </div>

        {/* Productivity Heatmap */}
        <div className="rounded-2xl p-4"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <p className="text-[13px] font-black mb-3" style={{ color: "#111111" }}>Productivity Heatmap</p>
          <HeatMap />
        </div>

        {/* Task Completion Donut */}
        <div className="rounded-2xl p-4"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <p className="text-[13px] font-black mb-3" style={{ color: "#111111" }}>Task Completion</p>
          <DonutChart
            completed={doneTasks.length}
            inProgress={wip.length}
            todo={todos.length}
          />
        </div>

      </div>
    </div>
  )
}
