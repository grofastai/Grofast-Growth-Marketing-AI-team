"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Target, Calendar, CheckCircle2, Circle, Clock,
  Loader2, AlertTriangle, Play, FileEdit, BookOpen,
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

const PRIORITY = {
  low:    { color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.05)", label: "Low"    },
  medium: { color: "#F59E0B",               bg: "rgba(245,158,11,0.1)",   label: "Medium" },
  high:   { color: "#FF6B57",               bg: "rgba(255,107,87,0.1)",   label: "High"   },
}

const STATUS_META = {
  todo:        { icon: Circle,       color: "rgba(255,255,255,0.55)", label: "To Do",       next: "in_progress" as const },
  in_progress: { icon: Clock,        color: "#F59E0B",               label: "In Progress", next: "completed"   as const },
  completed:   { icon: CheckCircle2, color: "#DC2626",               label: "Done",        next: "todo"        as const },
}

const FILTER_TABS = [
  { key: "all",         label: "All"         },
  { key: "todo",        label: "To Do"       },
  { key: "in_progress", label: "In Progress" },
  { key: "completed",   label: "Done"        },
]

function dueDateLabel(due: string | null, today: string): { text: string; color: string } | null {
  if (!due) return null
  if (due < today) {
    const days = Math.round((new Date(today).getTime() - new Date(due).getTime()) / 86400000)
    return { text: days === 1 ? "Yesterday" : `${days}d overdue`, color: "#FF6B57" }
  }
  if (due === today) return { text: "Due Today",     color: "#F59E0B" }
  const days = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000)
  if (days === 1)  return { text: "Due Tomorrow",    color: "#DC2626" }
  if (days <= 7)   return { text: `${days}d left`,   color: "rgba(255,255,255,0.45)" }
  return { text: due, color: "rgba(255,255,255,0.3)" }
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const blocks = 10
  const filled = Math.round((pct / 100) * blocks)
  return (
    <div className="rounded-xl p-4" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "rgba(255,255,255,0.25)" }}>Today&apos;s Progress</span>
        <span className="text-[12px] font-black"
          style={{ color: pct === 100 ? "#DC2626" : "#FFFFFF" }}>{done}/{total} tasks</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: blocks }).map((_, i) => (
          <div key={i} className="flex-1 h-2 rounded-full"
            style={{ background: i < filled ? "#DC2626" : "rgba(255,255,255,0.08)" }} />
        ))}
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
        {pct === 100 ? "All tasks done for today 🎉" : `${pct}% complete`}
      </p>
    </div>
  )
}

export default function MemberTasksClient({
  tasks: initialTasks,
  todayHours,
}: {
  tasks: Task[]
  todayHours: number
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter]   = useState("all")
  const [movingId, setMovingId] = useState<string | null>(null)
  const [, startTransition]   = useTransition()

  const today = new Date().toISOString().split("T")[0]

  const overdue   = tasks.filter(t => t.status !== "completed" && t.due_date && t.due_date < today)
  const active    = tasks.filter(t => t.status !== "completed")
  const completed = tasks.filter(t => t.status === "completed")

  const counts = {
    all:         tasks.length,
    todo:        tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    completed:   completed.length,
  }

  const displayed = filter === "all" ? tasks : tasks.filter(t => t.status === filter)

  function advance(task: Task) {
    const next = STATUS_META[task.status].next
    setMovingId(task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    startTransition(async () => {
      await updateTaskStatus(task.id, next)
      setMovingId(null)
    })
  }

  function logWork(task: Task) {
    const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
    const params = new URLSearchParams()
    if (project?.id)            params.set("client_id",    project.id)
    if (project?.business_name) params.set("client_name",  project.business_name)
    params.set("task_title", task.title)
    router.push(`/member/update?${params.toString()}`)
  }

  return (
    <div className="p-6 md:p-8 max-w-[1100px]">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[30px] font-black leading-tight"
            style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>My Tasks</h1>
          <p className="text-[13px] mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            {active.length > 0
              ? <>{active.length} active task{active.length !== 1 ? "s" : ""}{overdue.length > 0 && <span style={{ color: "#FF6B57" }}> · {overdue.length} overdue ⚠</span>}</>
              : "You're all caught up 🎉"
            }
          </p>
        </div>

        {/* Quick summary pill */}
        <div className="hidden md:flex items-center gap-4 px-4 py-3 rounded-xl"
          style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <div className="text-center">
            <p className="text-[18px] font-black leading-none"
              style={{ fontFamily: "var(--font-jakarta)", color: todayHours > 0 ? "#DC2626" : "rgba(255,255,255,0.3)" }}>
              {todayHours > 0 ? `${todayHours}h` : "—"}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Worked</p>
          </div>
          <div className="w-px h-8" style={{ background: "#333" }} />
          <div className="text-center">
            <p className="text-[18px] font-black leading-none"
              style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>{active.length}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Active</p>
          </div>
          <div className="w-px h-8" style={{ background: "#333" }} />
          <div className="text-center">
            <p className="text-[18px] font-black leading-none"
              style={{ fontFamily: "var(--font-jakarta)", color: overdue.length > 0 ? "#FF6B57" : "rgba(255,255,255,0.3)" }}>
              {overdue.length}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Overdue</p>
          </div>
        </div>
      </div>

      {/* ── Overdue pinned section ── */}
      {overdue.length > 0 && (
        <div className="mb-5 rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,107,87,0.25)" }}>
          <div className="flex items-center gap-2 px-4 py-2.5"
            style={{ background: "rgba(255,107,87,0.06)" }}>
            <AlertTriangle size={13} style={{ color: "#FF6B57" }} />
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#FF6B57" }}>
              {overdue.length} Overdue Task{overdue.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(255,107,87,0.1)" }}>
            {overdue.map(task => (
              <TaskCard key={task.id} task={task} today={today}
                isMoving={movingId === task.id}
                onAdvance={() => advance(task)}
                onLogWork={() => logWork(task)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {FILTER_TABS.map(tab => {
          const isActive = filter === tab.key
          const count = counts[tab.key as keyof typeof counts]
          return (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
              style={isActive
                ? { background: "rgba(220,38,38,0.1)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }
                : { background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }
              }>
              {tab.label}
              <span className="ml-1.5 text-[11px] opacity-70">({count})</span>
            </button>
          )
        })}
      </div>

      {/* ── Task list ── */}
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl"
          style={{ background: "#1A1A1A", border: "1px solid #2A2A2A" }}>
          <Target size={36} style={{ color: "rgba(255,255,255,0.08)" }} className="mb-3" />
          <p className="text-[15px] font-bold" style={{ color: "rgba(255,255,255,0.4)" }}>
            {filter === "all" ? "No tasks assigned 🎉" : `No ${filter.replace("_", " ")} tasks`}
          </p>
          <p className="text-[12px] mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
            {filter === "all"
              ? "You're all caught up. Focus on learning or check back later."
              : "Switch to a different filter to see other tasks."}
          </p>
        </div>
      ) : (
        <div className="space-y-2 mb-5">
          {displayed.map(task => (
            <TaskCard key={task.id} task={task} today={today}
              isMoving={movingId === task.id}
              onAdvance={() => advance(task)}
              onLogWork={() => logWork(task)} />
          ))}
        </div>
      )}

      {/* ── Progress bar ── */}
      {tasks.length > 0 && (
        <ProgressBar done={completed.length} total={tasks.length} />
      )}
    </div>
  )
}

// ── Individual task card ──────────────────────────────────────

function TaskCard({
  task, today, isMoving, onAdvance, onLogWork,
}: {
  task: Task
  today: string
  isMoving: boolean
  onAdvance: () => void
  onLogWork: () => void
}) {
  const pr   = PRIORITY[task.priority]
  const st   = STATUS_META[task.status]
  const StatusIcon = st.icon
  const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
  const due  = dueDateLabel(task.due_date, today)
  const isOverdue  = !!task.due_date && task.due_date < today && task.status !== "completed"
  const isDone     = task.status === "completed"

  return (
    <div className="rounded-xl p-4"
      style={{
        background: isOverdue ? "rgba(255,107,87,0.03)" : isDone ? "rgba(220,38,38,0.02)" : "#1E1E1E",
        border: isOverdue
          ? "1px solid rgba(255,107,87,0.15)"
          : isDone
          ? "1px solid rgba(220,38,38,0.1)"
          : "1px solid #2A2A2A",
      }}>

      {/* Top row: priority badge + title + status toggle */}
      <div className="flex items-start gap-3">
        {/* Status toggle button */}
        <button onClick={onAdvance} disabled={isMoving}
          className="mt-0.5 flex-shrink-0 transition-all hover:scale-110 active:scale-95">
          {isMoving
            ? <Loader2 size={20} className="animate-spin" style={{ color: st.color }} />
            : <StatusIcon size={20} style={{ color: st.color }} />
          }
        </button>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-semibold ${isDone ? "line-through" : ""}`}
            style={{ color: isDone ? "rgba(255,255,255,0.3)" : "#FFFFFF" }}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-[12px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.3)" }}>
              {task.description}
            </p>
          )}

          {/* Badges row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {project && (
              <span className="text-[11px] px-2 py-0.5 rounded font-medium"
                style={{ background: "rgba(109,93,246,0.1)", color: "#9D8DF4" }}>
                {project.business_name}
              </span>
            )}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: pr.bg, color: pr.color }}>
              {pr.label.toUpperCase()}
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.04)", color: st.color }}>
              {st.label}
            </span>
            {due && (
              <span className="flex items-center gap-1 text-[11px] font-medium"
                style={{ color: due.color }}>
                <Calendar size={10} />{due.text}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action buttons row */}
      {!isDone && (
        <div className="flex items-center gap-2 mt-3 pt-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>

          {/* Advance status */}
          <button onClick={onAdvance} disabled={isMoving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
            style={task.status === "todo"
              ? { background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.15)" }
              : { background: "rgba(245,158,11,0.08)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.15)" }
            }>
            {isMoving
              ? <Loader2 size={11} className="animate-spin" />
              : <Play size={11} />
            }
            {task.status === "todo" ? "Start Work" : "Mark Done"}
          </button>

          {/* Log Work → pre-fills daily update */}
          <button onClick={onLogWork}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
            style={{ background: "rgba(109,93,246,0.08)", color: "#9D8DF4", border: "1px solid rgba(109,93,246,0.15)" }}>
            <FileEdit size={11} /> Log Work
          </button>

          {/* If overdue: nudge to learn */}
          {isOverdue && (
            <span className="ml-auto flex items-center gap-1 text-[11px] font-medium"
              style={{ color: "#FF6B57" }}>
              <AlertTriangle size={11} /> Overdue
            </span>
          )}

          {/* Complete shortcut */}
          {task.status === "in_progress" && (
            <button onClick={() => {/* already handled by advance */}}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
              style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.12)" }}>
              <BookOpen size={11} /> Also Learning?
            </button>
          )}
        </div>
      )}
    </div>
  )
}
