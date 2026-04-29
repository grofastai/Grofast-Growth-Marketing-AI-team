"use client"

import { useState, useTransition, useActionState } from "react"
import { Plus, X, Trash2, Loader2, Target, Calendar } from "lucide-react"
import { createTask, updateTaskStatus, deleteTask } from "@/lib/actions/tasks"

interface Task {
  id: string
  title: string
  description: string | null
  status: "todo" | "in_progress" | "completed"
  priority: "low" | "medium" | "high"
  due_date: string | null
  users: { id: string; name: string; employee_id: string } | null
  projects: { business_name: string } | null
}

interface Member { id: string; name: string; employee_id: string }
interface Project { id: string; business_name: string }

const COLUMNS = [
  { key: "todo",        label: "To Do",       color: "rgba(255,255,255,0.4)",  bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.06)", dot: "rgba(255,255,255,0.25)" },
  { key: "in_progress", label: "In Progress", color: "#F59E0B",                bg: "rgba(245,158,11,0.04)",  border: "rgba(245,158,11,0.12)",  dot: "#F59E0B" },
  { key: "completed",   label: "Completed",   color: "#A3E635",                bg: "rgba(163,230,53,0.03)",  border: "rgba(163,230,53,0.12)",  dot: "#A3E635" },
] as const

const PRIORITY_COLORS = {
  low:    { color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.05)" },
  medium: { color: "#F59E0B",               bg: "rgba(245,158,11,0.1)" },
  high:   { color: "#FF6B57",               bg: "rgba(255,107,87,0.1)" },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" })
}

const inputStyle = {
  background: "#1A1A1A",
  border: "1px solid #2E2E2E",
  color: "#FFFFFF",
  borderRadius: "10px",
  padding: "10px 14px",
  fontSize: "13px",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
  colorScheme: "dark" as const,
}

export default function GoalsClient({ tasks: initialTasks, members, projects }: { tasks: Task[]; members: Member[]; projects: Project[] }) {
  const [tasks, setTasks] = useState(initialTasks)
  const [showForm, setShowForm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  type TaskActionState = { error: string } | { success: true } | null
  const [state, action, formPending] = useActionState<TaskActionState, FormData>(createTask, null)

  const columns = COLUMNS.map((col) => ({
    ...col,
    tasks: tasks.filter((t) => t.status === col.key),
  }))

  function moveTask(taskId: string, newStatus: "todo" | "in_progress" | "completed") {
    setMovingId(taskId)
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t))
    startTransition(async () => {
      await updateTaskStatus(taskId, newStatus)
      setMovingId(null)
    })
  }

  function removeTask(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      await deleteTask(id)
      setTasks((prev) => prev.filter((t) => t.id !== id))
      setDeletingId(null)
    })
  }

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>Tasks</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>Assign and track team tasks across all projects.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold transition-all"
          style={{ background: "#A3E635", color: "#0D0D0D" }}
        >
          <Plus size={15} /> Create Task
        </button>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-6">
        {columns.map((col) => (
          <div key={col.key} className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg"
            style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
            <span className="w-2 h-2 rounded-full" style={{ background: col.dot }} />
            <span className="text-[13px] font-semibold" style={{ color: col.color }}>{col.label}</span>
            <span className="text-[13px] font-black" style={{ color: "#FFFFFF" }}>{col.tasks.length}</span>
          </div>
        ))}
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg ml-auto"
          style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <Target size={13} style={{ color: "rgba(255,255,255,0.3)" }} />
          <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>Total</span>
          <span className="text-[13px] font-black" style={{ color: "#A3E635" }}>{tasks.length}</span>
        </div>
      </div>

      {/* Create Task Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: "#0D0D0D", border: "1px solid #2A2A2A" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>Create Task</h2>
              <button onClick={() => setShowForm(false)} style={{ color: "rgba(255,255,255,0.4)" }}><X size={18} /></button>
            </div>

            <style>{`.task-input::placeholder { color: rgba(255,255,255,0.2); } .task-input:focus { border-color: rgba(163,230,53,0.4) !important; }`}</style>

            <form action={(fd) => {
              startTransition(() => {
                action(fd)
                setShowForm(false)
              })
            }} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Title *</label>
                <input name="title" required placeholder="Task title..." className="task-input" style={inputStyle} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Description</label>
                <textarea name="description" rows={2} placeholder="Optional details..." className="task-input resize-none"
                  style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Assign To</label>
                  <select name="assigned_to" className="task-input" style={inputStyle}>
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Priority</label>
                  <select name="priority" defaultValue="medium" className="task-input" style={inputStyle}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Project</label>
                  <select name="project_id" className="task-input" style={inputStyle}>
                    <option value="">No project</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.business_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>Due Date</label>
                  <input name="due_date" type="date" className="task-input" style={inputStyle} />
                </div>
              </div>

              {state && 'error' in state && (
                <p className="text-[12px]" style={{ color: "#FF6B57" }}>{state.error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold"
                  style={{ background: "#1A1A1A", border: "1px solid #2E2E2E", color: "rgba(255,255,255,0.5)" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formPending}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-bold flex items-center justify-center gap-2"
                  style={{ background: "#A3E635", color: "#0D0D0D", opacity: formPending ? 0.65 : 1 }}>
                  {formPending && <Loader2 size={14} className="animate-spin" />}
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-3 gap-4">
        {columns.map((col) => (
          <div key={col.key} className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: col.bg, border: `1px solid ${col.border}`, minHeight: 420 }}>
            {/* Column header */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: col.dot }} />
                <span className="text-[13px] font-bold" style={{ color: col.color }}>{col.label}</span>
              </div>
              <span className="text-[12px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}>
                {col.tasks.length}
              </span>
            </div>

            {col.tasks.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.15)" }}>No tasks</p>
              </div>
            ) : (
              col.tasks.map((task) => {
                const pr = PRIORITY_COLORS[task.priority]
                const user = Array.isArray(task.users) ? task.users[0] : task.users
                const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
                const nextStatus = col.key === "todo" ? "in_progress" : col.key === "in_progress" ? "completed" : null
                const prevStatus = col.key === "completed" ? "in_progress" : col.key === "in_progress" ? "todo" : null
                const isMoving = movingId === task.id

                return (
                  <div key={task.id} className="rounded-xl p-3.5 group"
                    style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-[13px] font-semibold leading-snug flex-1" style={{ color: "#FFFFFF" }}>{task.title}</p>
                      <button onClick={() => removeTask(task.id)} disabled={deletingId === task.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
                        {deletingId === task.id
                          ? <Loader2 size={12} className="animate-spin" style={{ color: "#FF6B57" }} />
                          : <Trash2 size={12} style={{ color: "rgba(255,107,87,0.6)" }} />}
                      </button>
                    </div>

                    {task.description && (
                      <p className="text-[11px] mb-2 leading-snug" style={{ color: "rgba(255,255,255,0.3)" }}>{task.description}</p>
                    )}

                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: pr.bg, color: pr.color }}>
                        {task.priority.toUpperCase()}
                      </span>
                      {project && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)" }}>
                          {project.business_name}
                        </span>
                      )}
                      {task.due_date && (
                        <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)" }}>
                          <Calendar size={9} />{formatDate(task.due_date)}
                        </span>
                      )}
                    </div>

                    {user && (
                      <p className="text-[11px] mb-2" style={{ color: "rgba(255,255,255,0.3)" }}>
                        → {user.name} <span style={{ color: "rgba(255,255,255,0.18)" }}>#{user.employee_id}</span>
                      </p>
                    )}

                    {/* Move buttons */}
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {prevStatus && (
                        <button onClick={() => moveTask(task.id, prevStatus as "todo" | "in_progress" | "completed")}
                          disabled={isMoving}
                          className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-all"
                          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)" }}>
                          ← Back
                        </button>
                      )}
                      {nextStatus && (
                        <button onClick={() => moveTask(task.id, nextStatus as "todo" | "in_progress" | "completed")}
                          disabled={isMoving}
                          className="flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-all"
                          style={{ background: "rgba(163,230,53,0.1)", color: "#A3E635" }}>
                          {isMoving ? <Loader2 size={11} className="animate-spin mx-auto" /> : "Forward →"}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
