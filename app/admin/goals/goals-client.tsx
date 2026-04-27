"use client"

import { useState, useTransition, useActionState, useOptimistic } from "react"
import { Plus, X, Trash2, Loader2, Target, ChevronRight, Calendar, Flag } from "lucide-react"
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
  { key: "todo", label: "To Do", color: "#6B7280", bg: "rgba(107,114,128,0.1)", accent: "#6B7280" },
  { key: "in_progress", label: "In Progress", color: "#F59E0B", bg: "rgba(245,158,11,0.08)", accent: "#F59E0B" },
  { key: "completed", label: "Completed", color: "#10B981", bg: "rgba(16,185,129,0.08)", accent: "#10B981" },
] as const

const PRIORITY_COLORS = {
  low: { color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
  medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  high: { color: "#FF6B57", bg: "rgba(255,107,87,0.1)" },
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" })
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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[32px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#E6EDF3" }}>Tasks</h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#6B7280" }}>Track team goals and task board.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white"
          style={{ background: "linear-gradient(135deg, #6D5DF6, #5547D4)", boxShadow: "0 4px 16px rgba(109,93,246,0.3)" }}
        >
          <Plus size={15} /> Create Task
        </button>
      </div>

      {/* Create Task Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[18px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#E6EDF3" }}>Create Task</h2>
              <button onClick={() => setShowForm(false)}><X size={18} style={{ color: "#6B7280" }} /></button>
            </div>
            <form action={(fd) => {
              startTransition(() => {
                action(fd)
                setShowForm(false)
              })
            }} className="space-y-4">
              <div>
                <label className="text-[12px] font-semibold font-sans uppercase tracking-wider mb-1.5 block" style={{ color: "#6B7280" }}>Title *</label>
                <input name="title" required placeholder="Task title..."
                  className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#E6EDF3" }} />
              </div>
              <div>
                <label className="text-[12px] font-semibold font-sans uppercase tracking-wider mb-1.5 block" style={{ color: "#6B7280" }}>Description</label>
                <textarea name="description" rows={2} placeholder="Optional details..."
                  className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none resize-none"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#E6EDF3" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-semibold font-sans uppercase tracking-wider mb-1.5 block" style={{ color: "#6B7280" }}>Assign To</label>
                  <select name="assigned_to" className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#E6EDF3", colorScheme: "dark" }}>
                    <option value="">Unassigned</option>
                    {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-semibold font-sans uppercase tracking-wider mb-1.5 block" style={{ color: "#6B7280" }}>Priority</label>
                  <select name="priority" defaultValue="medium" className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#E6EDF3", colorScheme: "dark" }}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-semibold font-sans uppercase tracking-wider mb-1.5 block" style={{ color: "#6B7280" }}>Project</label>
                  <select name="project_id" className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#E6EDF3", colorScheme: "dark" }}>
                    <option value="">No project</option>
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.business_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-semibold font-sans uppercase tracking-wider mb-1.5 block" style={{ color: "#6B7280" }}>Due Date</label>
                  <input name="due_date" type="date"
                    className="w-full px-3 py-2.5 rounded-xl text-[13px] font-sans outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#E6EDF3", colorScheme: "dark" }} />
                </div>
              </div>

              {state && 'error' in state && <p className="text-[12px] font-sans" style={{ color: "#FF6B57" }}>{state.error}</p>}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold font-sans"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#9CA3AF" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #6D5DF6, #5547D4)" }}>
                  {formPending && <Loader2 size={14} className="animate-spin" />}
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Kanban Columns */}
      <div className="grid grid-cols-3 gap-4">
        {columns.map((col) => (
          <div key={col.key} className="rounded-2xl p-4 flex flex-col gap-3"
            style={{ background: col.bg, border: `1px solid ${col.accent}20`, minHeight: 400 }}>
            {/* Column header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: col.accent }} />
                <span className="text-[13px] font-bold font-sans" style={{ color: col.color }}>{col.label}</span>
              </div>
              <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "#6B7280" }}>
                {col.tasks.length}
              </span>
            </div>

            {/* Tasks */}
            {col.tasks.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-[12px] font-sans" style={{ color: "rgba(255,255,255,0.2)" }}>No tasks</p>
              </div>
            ) : (
              col.tasks.map((task) => {
                const pr = PRIORITY_COLORS[task.priority]
                const user = Array.isArray(task.users) ? task.users[0] : task.users
                const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
                const nextStatus = col.key === "todo" ? "in_progress" : col.key === "in_progress" ? "completed" : null
                const prevStatus = col.key === "completed" ? "in_progress" : col.key === "in_progress" ? "todo" : null

                return (
                  <div key={task.id} className="rounded-xl p-3.5 group"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-[13px] font-semibold font-sans leading-snug flex-1" style={{ color: "#E6EDF3" }}>{task.title}</p>
                      <button onClick={() => removeTask(task.id)} disabled={deletingId === task.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {deletingId === task.id ? <Loader2 size={12} className="animate-spin" style={{ color: "#FF6B57" }} /> : <Trash2 size={12} style={{ color: "#FF6B57" }} />}
                      </button>
                    </div>
                    {task.description && (
                      <p className="text-[11px] font-sans mb-2 leading-snug" style={{ color: "#6B7280" }}>{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: pr.bg, color: pr.color }}>
                        {task.priority.toUpperCase()}
                      </span>
                      {project && (
                        <span className="text-[10px] font-sans px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "#9CA3AF" }}>
                          {project.business_name}
                        </span>
                      )}
                      {task.due_date && (
                        <span className="flex items-center gap-0.5 text-[10px] font-sans px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", color: "#9CA3AF" }}>
                          <Calendar size={9} />{formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                    {user && (
                      <p className="text-[11px] font-sans mb-2" style={{ color: "#6B7280" }}>→ {user.name}</p>
                    )}
                    {/* Move buttons */}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {prevStatus && (
                        <button onClick={() => moveTask(task.id, prevStatus as "todo" | "in_progress" | "completed")}
                          className="flex-1 text-[10px] font-semibold font-sans py-1 rounded-lg transition-all"
                          style={{ background: "rgba(255,255,255,0.05)", color: "#9CA3AF" }}>
                          ← Back
                        </button>
                      )}
                      {nextStatus && (
                        <button onClick={() => moveTask(task.id, nextStatus as "todo" | "in_progress" | "completed")}
                          className="flex-1 text-[10px] font-semibold font-sans py-1 rounded-lg transition-all"
                          style={{ background: "rgba(109,93,246,0.15)", color: "#6D5DF6" }}>
                          Forward →
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
