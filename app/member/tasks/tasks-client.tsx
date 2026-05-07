"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Target, Calendar, CheckCircle2, Circle, Clock,
  Loader2, AlertTriangle, Play, FileEdit, ChevronDown, ChevronUp, User,
} from "lucide-react"
import { updateTaskStatus } from "@/lib/actions/tasks"

interface Task {
  id: string
  title: string
  description: string | null
  status: "todo" | "in_progress" | "completed"
  priority: "low" | "medium" | "high"
  due_date: string | null
  created_by: string | null
  projects: { id: string; business_name: string } | null
  assigner: { name: string } | null
}

const PRIORITY = {
  low:    { color: "#6B7280", bg: "rgba(0,0,0,0.04)", label: "Low"    },
  medium: { color: "#F59E0B",               bg: "rgba(245,158,11,0.1)",   label: "Medium" },
  high:   { color: "#de1a1a",               bg: "rgba(255,107,87,0.1)",   label: "High"   },
}

const STATUS_META = {
  todo:        { icon: Circle,       color: "#6B7280", label: "To Do",       next: "in_progress" as const },
  in_progress: { icon: Clock,        color: "#F59E0B",               label: "In Progress", next: "completed"   as const },
  completed:   { icon: CheckCircle2, color: "#de1a1a",               label: "Done",        next: "todo"        as const },
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
    return { text: days === 1 ? "Yesterday" : `${days}d overdue`, color: "#de1a1a" }
  }
  if (due === today) return { text: "Due Today",     color: "#F59E0B" }
  const days = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000)
  if (days === 1)  return { text: "Due Tomorrow",    color: "#de1a1a" }
  if (days <= 7)   return { text: `${days}d left`,   color: "#6B7280" }
  return { text: due, color: "#6B7280" }
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const blocks = 10
  const filled = Math.round((pct / 100) * blocks)
  return (
    <div className="rounded-xl p-4" style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "#D1D5DB" }}>Today&apos;s Progress</span>
        <span className="text-[12px] font-black"
          style={{ color: pct === 100 ? "#de1a1a" : "#FFFFFF" }}>{done}/{total} tasks</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: blocks }).map((_, i) => (
          <div key={i} className="flex-1 h-2 rounded-full"
            style={{ background: i < filled ? "#de1a1a" : "rgba(0,0,0,0.06)" }} />
        ))}
      </div>
      <p className="text-[11px] mt-1.5" style={{ color: "#6B7280" }}>
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
  const [moving, setMoving] = useState<{ id: string; to: "todo" | "in_progress" | "completed" } | null>(null)
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

  function setStatus(task: Task, next: "todo" | "in_progress" | "completed") {
    setMoving({ id: task.id, to: next })
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    startTransition(async () => {
      await updateTaskStatus(task.id, next)
      setMoving(null)
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
          <h1 className="gradient-heading text-[30px] font-black leading-tight"
            style={{ fontFamily: "var(--font-jakarta)" }}>My Tasks</h1>
          <p className="text-[13px] mt-1" style={{ color: "#6B7280" }}>
            {active.length > 0
              ? <>{active.length} active task{active.length !== 1 ? "s" : ""}{overdue.length > 0 && <span style={{ color: "#de1a1a" }}> · {overdue.length} overdue ⚠</span>}</>
              : "You're all caught up 🎉"
            }
          </p>
        </div>

        {/* Quick summary pill */}
        <div className="hidden md:flex items-center gap-4 px-4 py-3 rounded-xl"
          style={{ background: "#FFFFFF", border: "1px solid #2A2A2A" }}>
          <div className="text-center">
            <p className="text-[18px] font-black leading-none"
              style={{ fontFamily: "var(--font-jakarta)", color: todayHours > 0 ? "#de1a1a" : "#6B7280" }}>
              {todayHours > 0 ? `${todayHours}h` : "—"}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>Worked</p>
          </div>
          <div className="w-px h-8" style={{ background: "#E5E7EB" }} />
          <div className="text-center">
            <p className="text-[18px] font-black leading-none"
              style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>{active.length}</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>Active</p>
          </div>
          <div className="w-px h-8" style={{ background: "#E5E7EB" }} />
          <div className="text-center">
            <p className="text-[18px] font-black leading-none"
              style={{ fontFamily: "var(--font-jakarta)", color: overdue.length > 0 ? "#de1a1a" : "#6B7280" }}>
              {overdue.length}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>Overdue</p>
          </div>
        </div>
      </div>

      {/* ── Overdue pinned section ── */}
      {overdue.length > 0 && (
        <div className="mb-5 rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,107,87,0.25)" }}>
          <div className="flex items-center gap-2 px-4 py-2.5"
            style={{ background: "rgba(255,107,87,0.06)" }}>
            <AlertTriangle size={13} style={{ color: "#de1a1a" }} />
            <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#de1a1a" }}>
              {overdue.length} Overdue Task{overdue.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(255,107,87,0.1)" }}>
            {overdue.map(task => (
              <TaskCard key={task.id} task={task} today={today}
                movingTo={moving?.id === task.id ? moving.to : null}
              onSetStatus={(s) => setStatus(task, s)}
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
                ? { background: "rgba(222,26,26,0.1)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }
                : { background: "rgba(0,0,0,0.02)", color: "#6B7280", border: "1px solid #E5E7EB" }
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
          style={{ background: "#F4F5F7", border: "1px solid #2A2A2A" }}>
          <Target size={36} style={{ color: "rgba(0,0,0,0.06)" }} className="mb-3" />
          <p className="text-[15px] font-bold" style={{ color: "#6B7280" }}>
            {filter === "all" ? "No tasks assigned 🎉" : `No ${filter.replace("_", " ")} tasks`}
          </p>
          <p className="text-[12px] mt-1" style={{ color: "rgba(0,0,0,0.1)" }}>
            {filter === "all"
              ? "You're all caught up. Focus on learning or check back later."
              : "Switch to a different filter to see other tasks."}
          </p>
        </div>
      ) : (
        <div className="space-y-2 mb-5">
          {displayed.map(task => (
            <TaskCard key={task.id} task={task} today={today}
              movingTo={moving?.id === task.id ? moving.to : null}
              onSetStatus={(s) => setStatus(task, s)}
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

const STATUS_BUTTONS: { key: "todo" | "in_progress" | "completed"; label: string; active: React.CSSProperties; inactive: React.CSSProperties }[] = [
  {
    key: "todo",
    label: "To Do",
    active:   { background: "rgba(107,114,128,0.15)", color: "#D1D5DB",  border: "1px solid rgba(107,114,128,0.3)" },
    inactive: { background: "transparent",            color: "#6B7280",  border: "1px solid rgba(107,114,128,0.15)" },
  },
  {
    key: "in_progress",
    label: "In Progress",
    active:   { background: "rgba(245,158,11,0.15)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.3)" },
    inactive: { background: "transparent",           color: "#6B7280",  border: "1px solid rgba(107,114,128,0.15)" },
  },
  {
    key: "completed",
    label: "Done",
    active:   { background: "rgba(22,163,74,0.15)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.3)" },
    inactive: { background: "transparent",          color: "#6B7280",  border: "1px solid rgba(107,114,128,0.15)" },
  },
]

function TaskCard({
  task, today, movingTo, onSetStatus, onLogWork,
}: {
  task: Task
  today: string
  movingTo: "todo" | "in_progress" | "completed" | null
  onSetStatus: (s: "todo" | "in_progress" | "completed") => void
  onLogWork: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const pr      = PRIORITY[task.priority]
  const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
  const assigner = Array.isArray(task.assigner) ? task.assigner[0] : task.assigner
  const due     = dueDateLabel(task.due_date, today)
  const isOverdue = !!task.due_date && task.due_date < today && task.status !== "completed"
  const isDone    = task.status === "completed"

  return (
    <div className="rounded-xl overflow-hidden"
      style={{
        background: isOverdue ? "rgba(255,107,87,0.03)" : isDone ? "rgba(22,163,74,0.02)" : "#FFFFFF",
        border: isOverdue
          ? "1px solid rgba(255,107,87,0.2)"
          : isDone
          ? "1px solid rgba(22,163,74,0.15)"
          : "1px solid #2A2A2A",
      }}>

      <div className="p-4">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <p className={`text-[14px] font-semibold leading-snug flex-1 ${isDone ? "line-through" : ""}`}
            style={{ color: isDone ? "#6B7280" : "#FFFFFF" }}>
            {task.title}
          </p>
          <button onClick={() => setExpanded(v => !v)}
            className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.05)" }}>
            {expanded
              ? <ChevronUp size={13} style={{ color: "#6B7280" }} />
              : <ChevronDown size={13} style={{ color: "#6B7280" }} />
            }
          </button>
        </div>

        {/* Meta badges */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {project && (
            <span className="text-[11px] px-2 py-0.5 rounded font-medium"
              style={{ background: "rgba(222,26,26,0.1)", color: "#B91C1C" }}>
              {project.business_name}
            </span>
          )}
          <span className="text-[10px] font-bold px-2 py-0.5 rounded"
            style={{ background: pr.bg, color: pr.color }}>
            {pr.label.toUpperCase()}
          </span>
          {due && (
            <span className="flex items-center gap-1 text-[11px] font-medium"
              style={{ color: due.color }}>
              <Calendar size={10} />{due.text}
            </span>
          )}
          {isOverdue && (
            <span className="flex items-center gap-1 text-[11px] font-bold ml-auto"
              style={{ color: "#de1a1a" }}>
              <AlertTriangle size={11} /> Overdue
            </span>
          )}
        </div>

        {/* Status selector — always visible */}
        <div className="flex items-center gap-1.5 mb-3">
          {STATUS_BUTTONS.map(btn => (
            <button key={btn.key}
              disabled={!!movingTo}
              onClick={() => task.status !== btn.key && onSetStatus(btn.key)}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1"
              style={task.status === btn.key ? btn.active : btn.inactive}>
              {movingTo === btn.key
                ? <Loader2 size={10} className="animate-spin" />
                : task.status === btn.key && <Play size={9} />
              }
              {btn.label}
            </button>
          ))}
        </div>

        {/* Log Work button */}
        <button onClick={onLogWork}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-bold transition-all"
          style={{ background: "rgba(222,26,26,0.06)", color: "#B91C1C", border: "1px solid rgba(222,26,26,0.15)" }}>
          <FileEdit size={11} /> Log Work
        </button>
      </div>

      {/* Expandable detail */}
      {expanded && (
        <div className="px-4 pb-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="rounded-xl p-4 mt-3 space-y-3"
            style={{ background: "rgba(0,0,0,0.06)" }}>

            {assigner?.name && (
              <div className="flex items-center gap-2">
                <User size={12} style={{ color: "#6B7280" }} />
                <span className="text-[11px]" style={{ color: "#6B7280" }}>Assigned by</span>
                <span className="text-[12px] font-bold" style={{ color: "#E5E7EB" }}>{assigner.name}</span>
              </div>
            )}

            {project && (
              <div className="flex items-center gap-2">
                <Target size={12} style={{ color: "#6B7280" }} />
                <span className="text-[11px]" style={{ color: "#6B7280" }}>Project</span>
                <span className="text-[12px] font-bold" style={{ color: "#E5E7EB" }}>{project.business_name}</span>
              </div>
            )}

            {task.due_date && (
              <div className="flex items-center gap-2">
                <Calendar size={12} style={{ color: "#6B7280" }} />
                <span className="text-[11px]" style={{ color: "#6B7280" }}>Due date</span>
                <span className="text-[12px] font-bold" style={{ color: "#E5E7EB" }}>
                  {new Date(task.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            )}

            {task.description && (
              <div>
                <p className="text-[11px] mb-1" style={{ color: "#6B7280" }}>Description</p>
                <p className="text-[13px] leading-relaxed" style={{ color: "#D1D5DB" }}>{task.description}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
