"use client"

import { useState, useTransition } from "react"
import { Target, Calendar, CheckCircle2, Circle, Clock, Loader2 } from "lucide-react"
import { updateTaskStatus } from "@/lib/actions/tasks"

interface Task {
  id: string
  title: string
  description: string | null
  status: "todo" | "in_progress" | "completed"
  priority: "low" | "medium" | "high"
  due_date: string | null
  projects: { business_name: string } | null
}

const PRIORITY = {
  low:    { color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.05)", label: "Low" },
  medium: { color: "#F59E0B",               bg: "rgba(245,158,11,0.1)",   label: "Medium" },
  high:   { color: "#FF6B57",               bg: "rgba(255,107,87,0.1)",   label: "High" },
}

const STATUS_DISPLAY = {
  todo:        { icon: Circle,       color: "rgba(255,255,255,0.35)", label: "To Do" },
  in_progress: { icon: Clock,        color: "#F59E0B",               label: "In Progress" },
  completed:   { icon: CheckCircle2, color: "#A3E635",               label: "Done" },
}

const NEXT_STATUS: Record<string, "todo" | "in_progress" | "completed"> = {
  todo: "in_progress",
  in_progress: "completed",
  completed: "todo",
}

const STATUS_TABS = [
  { key: "all",        label: "All" },
  { key: "todo",       label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed",  label: "Completed" },
]

export default function MemberTasksClient({ tasks: initialTasks }: { tasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState("all")
  const [movingId, setMovingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const displayed = filter === "all" ? tasks : tasks.filter((t) => t.status === filter)

  function advance(task: Task) {
    const next = NEXT_STATUS[task.status]
    setMovingId(task.id)
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: next } : t))
    startTransition(async () => {
      await updateTaskStatus(task.id, next)
      setMovingId(null)
    })
  }

  const counts = {
    todo:        tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    completed:   tasks.filter(t => t.status === "completed").length,
  }

  return (
    <div className="p-8 max-w-[800px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>My Tasks</h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>Tasks assigned to you. Click the icon to advance status.</p>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 mb-6">
        <div className="px-3 py-1.5 rounded-lg" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>To Do </span>
          <span className="text-[13px] font-black" style={{ color: "#FFFFFF" }}>{counts.todo}</span>
        </div>
        <div className="px-3 py-1.5 rounded-lg" style={{ background: "#262626", border: "1px solid rgba(245,158,11,0.2)" }}>
          <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>In Progress </span>
          <span className="text-[13px] font-black" style={{ color: "#F59E0B" }}>{counts.in_progress}</span>
        </div>
        <div className="px-3 py-1.5 rounded-lg" style={{ background: "#262626", border: "1px solid rgba(163,230,53,0.2)" }}>
          <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>Done </span>
          <span className="text-[13px] font-black" style={{ color: "#A3E635" }}>{counts.completed}</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {STATUS_TABS.map((tab) => {
          const isActive = filter === tab.key
          return (
            <button key={tab.key} onClick={() => setFilter(tab.key)}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
              style={isActive
                ? { background: "rgba(163,230,53,0.1)", color: "#A3E635", border: "1px solid rgba(163,230,53,0.2)" }
                : { background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.06)" }
              }>
              {tab.label}
              {tab.key !== "all" && tab.key in counts && (
                <span className="ml-1.5 text-[11px]">({counts[tab.key as keyof typeof counts]})</span>
              )}
            </button>
          )
        })}
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl"
          style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <Target size={36} style={{ color: "rgba(255,255,255,0.08)" }} className="mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>No tasks found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map((task) => {
            const pr = PRIORITY[task.priority]
            const st = STATUS_DISPLAY[task.status]
            const StatusIcon = st.icon
            const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
            const isMoving = movingId === task.id
            const isDone = task.status === "completed"

            return (
              <div key={task.id}
                className="rounded-xl p-4 flex items-center gap-4 transition-all"
                style={{
                  background: isDone ? "rgba(163,230,53,0.03)" : "#262626",
                  border: isDone ? "1px solid rgba(163,230,53,0.12)" : "1px solid #2A2A2A",
                }}>
                {/* Status toggle */}
                <button onClick={() => advance(task)} disabled={isMoving}
                  className="flex-shrink-0 transition-all hover:scale-110 active:scale-95">
                  {isMoving
                    ? <Loader2 size={20} className="animate-spin" style={{ color: st.color }} />
                    : <StatusIcon size={20} style={{ color: st.color }} />
                  }
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-semibold ${isDone ? "line-through" : ""}`}
                    style={{ color: isDone ? "rgba(255,255,255,0.3)" : "#FFFFFF" }}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-[12px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.3)" }}>{task.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {project && (
                      <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.28)" }}>{project.business_name}</span>
                    )}
                    {task.due_date && (
                      <span className="flex items-center gap-1 text-[11px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                        <Calendar size={10} />{task.due_date}
                      </span>
                    )}
                  </div>
                </div>

                {/* Priority + status badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: pr.bg, color: pr.color }}>
                    {pr.label.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(255,255,255,0.04)", color: st.color }}>
                    {st.label}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
