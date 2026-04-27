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
  low: { color: "#6B7280", bg: "rgba(107,114,128,0.1)", label: "Low" },
  medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)", label: "Medium" },
  high: { color: "#FF6B57", bg: "rgba(255,107,87,0.1)", label: "High" },
}

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
]

const NEXT_STATUS: Record<string, "todo" | "in_progress" | "completed"> = {
  todo: "in_progress",
  in_progress: "completed",
  completed: "todo",
}

const STATUS_DISPLAY = {
  todo: { icon: Circle, color: "#6B7280", label: "To Do" },
  in_progress: { icon: Clock, color: "#F59E0B", label: "In Progress" },
  completed: { icon: CheckCircle2, color: "#10B981", label: "Done" },
}

export default function MemberTasksClient({ tasks: initialTasks }: { tasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [filter, setFilter] = useState("all")
  const [movingId, setMovingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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

  return (
    <div className="p-8 max-w-[800px]">
      <div className="mb-6">
        <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>My Tasks</h1>
        <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>Tasks assigned to you across all projects.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map((tab) => (
          <button key={tab.key} onClick={() => setFilter(tab.key)}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold font-sans transition-all"
            style={filter === tab.key
              ? { background: "rgba(109,93,246,0.12)", color: "#6D5DF6", border: "1px solid rgba(109,93,246,0.2)" }
              : { background: "rgba(255,255,255,0.03)", color: "#6B7280", border: "1px solid rgba(255,255,255,0.06)" }
            }>
            {tab.label}
            {tab.key !== "all" && (
              <span className="ml-1.5 text-[11px]">({tasks.filter((t) => tab.key === "all" || t.status === tab.key).length})</span>
            )}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <Target size={40} style={{ color: "rgba(255,255,255,0.1)" }} className="mb-3" />
          <p className="text-[14px] font-semibold font-sans" style={{ color: "#6B7280" }}>No tasks found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map((task) => {
            const pr = PRIORITY[task.priority]
            const st = STATUS_DISPLAY[task.status]
            const StatusIcon = st.icon
            const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
            const isMoving = movingId === task.id

            return (
              <div key={task.id} className="rounded-2xl p-4 flex items-center gap-4 group"
                style={{
                  background: task.status === "completed" ? "rgba(16,185,129,0.04)" : "rgba(255,255,255,0.02)",
                  border: task.status === "completed" ? "1px solid rgba(16,185,129,0.12)" : "1px solid rgba(255,255,255,0.06)",
                }}>
                {/* Status toggle */}
                <button onClick={() => advance(task)} disabled={isMoving}
                  className="flex-shrink-0 transition-all hover:scale-110">
                  {isMoving ? <Loader2 size={20} className="animate-spin" style={{ color: st.color }} /> : <StatusIcon size={20} style={{ color: st.color }} />}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-semibold font-sans ${task.status === "completed" ? "line-through" : ""}`}
                    style={{ color: task.status === "completed" ? "#6B7280" : "#E6EDF3" }}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-[12px] font-sans mt-0.5 truncate" style={{ color: "#6B7280" }}>{task.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {project && (
                      <span className="text-[11px] font-sans" style={{ color: "#6B7280" }}>{project.business_name}</span>
                    )}
                    {task.due_date && (
                      <span className="flex items-center gap-1 text-[11px] font-sans" style={{ color: "#6B7280" }}>
                        <Calendar size={10} />{task.due_date}
                      </span>
                    )}
                  </div>
                </div>

                {/* Priority + Status */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: pr.bg, color: pr.color }}>
                    {pr.label}
                  </span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: st.color }}>
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
