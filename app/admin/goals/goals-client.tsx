"use client"

import { useState, useTransition, useActionState } from "react"
import {
  Plus, X, Trash2, Loader2, Target, Calendar, Users,
  LayoutGrid, Columns, CheckCircle2, Clock, Circle,
} from "lucide-react"
import { createTask, updateTaskStatus, deleteTask } from "@/lib/actions/tasks"

interface Task {
  id: string
  title: string
  description: string | null
  status: "todo" | "in_progress" | "completed"
  priority: "low" | "medium" | "high"
  due_date: string | null
  users: { id: string; name: string; employee_id: string; team?: string | null } | null
  projects: { id: string; business_name: string } | null
}

interface Member { id: string; name: string; employee_id: string; team?: string | null }
interface Project { id: string; business_name: string; client_name?: string | null }

const STATUS_CONFIG = {
  todo:        { label: "To Do",       color: "#6B7280", bg: "rgba(156,163,175,0.12)", dot: "#6B7280" },
  in_progress: { label: "In Progress", color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  dot: "#F59E0B" },
  completed:   { label: "Completed",   color: "#16A34A", bg: "rgba(22,163,74,0.12)",   dot: "#16A34A" },
} as const

const PRIORITY_COLORS = {
  low:    { color: "#6B7280", bg: "rgba(156,163,175,0.1)" },
  medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
  high:   { color: "#de1a1a", bg: "rgba(222,26,26,0.12)" },
}

function fmt(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" })
}

function isOverdue(due: string | null, status: string) {
  if (!due || status === "completed") return false
  return new Date(due + "T23:59:59") < new Date()
}

const NEXT: Record<string, "todo" | "in_progress" | "completed" | null> = {
  todo: "in_progress", in_progress: "completed", completed: null,
}
const PREV: Record<string, "todo" | "in_progress" | "completed" | null> = {
  todo: null, in_progress: "todo", completed: "in_progress",
}

// ── Task Card ─────────────────────────────────────────────────────────
function TaskCard({
  task, onMove, onDelete, isMoving, isDeleting,
}: {
  task: Task
  onMove: (id: string, s: "todo" | "in_progress" | "completed") => void
  onDelete: (id: string) => void
  isMoving: boolean
  isDeleting: boolean
}) {
  const pr = PRIORITY_COLORS[task.priority]
  const st = STATUS_CONFIG[task.status]
  const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
  const overdue = isOverdue(task.due_date, task.status)
  const next = NEXT[task.status]
  const prev = PREV[task.status]

  return (
    <div className="rounded-xl p-3.5 group"
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

      {/* Title + delete */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[13px] font-semibold leading-snug flex-1" style={{ color: "#111827" }}>
          {task.title}
        </p>
        <button onClick={() => onDelete(task.id)} disabled={isDeleting}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5 p-0.5 rounded">
          {isDeleting
            ? <Loader2 size={11} className="animate-spin" style={{ color: "#de1a1a" }} />
            : <Trash2 size={11} style={{ color: "rgba(222,26,26,0.5)" }} />}
        </button>
      </div>

      {task.description && (
        <p className="text-[11px] mb-2.5 leading-relaxed" style={{ color: "#6B7280" }}>
          {task.description}
        </p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {/* Status */}
        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: st.bg, color: st.color }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: st.dot }} />
          {st.label}
        </span>
        {/* Priority */}
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: pr.bg, color: pr.color }}>
          {task.priority.toUpperCase()}
        </span>
        {/* Project */}
        {project && (
          <span className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(222,26,26,0.07)", color: "#B91C1C" }}>
            {project.business_name}
          </span>
        )}
        {/* Due date */}
        {task.due_date && (
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded"
            style={{
              background: overdue ? "rgba(222,26,26,0.08)" : "rgba(0,0,0,0.04)",
              color: overdue ? "#de1a1a" : "#6B7280",
            }}>
            <Calendar size={9} /> {fmt(task.due_date)}{overdue ? " ⚠" : ""}
          </span>
        )}
      </div>

      {/* Move buttons */}
      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pt-1"
        style={{ borderTop: "1px solid #F3F4F6" }}>
        {prev && (
          <button onClick={() => onMove(task.id, prev)} disabled={isMoving}
            className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg transition-all"
            style={{ background: "rgba(0,0,0,0.04)", color: "#6B7280" }}>
            ← Back
          </button>
        )}
        {next && (
          <button onClick={() => onMove(task.id, next)} disabled={isMoving}
            className="flex-1 text-[10px] font-bold py-1.5 rounded-lg transition-all"
            style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
            {isMoving ? <Loader2 size={11} className="animate-spin mx-auto" /> : "Forward →"}
          </button>
        )}
        {!prev && !next && (
          <p className="text-[10px] text-center w-full" style={{ color: "#6B7280" }}>Completed ✓</p>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────
export default function GoalsClient({
  tasks: initialTasks, members, projects,
}: {
  tasks: Task[]
  members: Member[]
  projects: Project[]
}) {
  const [tasks, setTasks] = useState(initialTasks)
  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState<"member" | "status">("member")
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  type TaskActionState = { error: string } | { success: true } | null
  const [state, action, formPending] = useActionState<TaskActionState, FormData>(createTask, null)

  function toggleMember(id: string) {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function moveTask(taskId: string, newStatus: "todo" | "in_progress" | "completed") {
    setMovingId(taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    startTransition(async () => {
      await updateTaskStatus(taskId, newStatus)
      setMovingId(null)
    })
  }

  function removeTask(id: string) {
    setDeletingId(id)
    startTransition(async () => {
      await deleteTask(id)
      setTasks(prev => prev.filter(t => t.id !== id))
      setDeletingId(null)
    })
  }

  // ── Member-wise columns ──────────────────────────────────────────────
  const memberColumns = [
    {
      id: "unassigned",
      label: "Unassigned",
      initials: "?",
      team: null as string | null,
      tasks: tasks.filter(t => !(Array.isArray(t.users) ? t.users[0] : t.users)),
    },
    ...members.map(m => ({
      id: m.id,
      label: m.name,
      initials: m.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(),
      team: m.team ?? null,
      tasks: tasks.filter(t => {
        const u = Array.isArray(t.users) ? t.users[0] : t.users
        return u?.id === m.id
      }),
    })),
  ]

  // ── Status columns ───────────────────────────────────────────────────
  const statusColumns = (["todo", "in_progress", "completed"] as const).map(s => ({
    key: s,
    ...STATUS_CONFIG[s],
    tasks: tasks.filter(t => t.status === s),
  }))

  const totalByStatus = {
    todo: tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    completed: tasks.filter(t => t.status === "completed").length,
  }

  return (
    <div className="p-4 md:p-6 xl:p-8 max-w-none">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
        <div>
          <h1 className="gradient-heading text-[28px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>
            Task Board
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(17,24,39,0.4)" }}>
            Assign and track team tasks — {tasks.length} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl"
            style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}>
            <button onClick={() => setViewMode("member")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
              style={viewMode === "member"
                ? { background: "#FFFFFF", color: "#de1a1a", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
                : { color: "#6B7280" }}>
              <Users size={12} /> By Member
            </button>
            <button onClick={() => setViewMode("status")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
              style={viewMode === "status"
                ? { background: "#FFFFFF", color: "#de1a1a", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
                : { color: "#6B7280" }}>
              <Columns size={12} /> By Status
            </button>
          </div>

          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #de1a1a 0%, #991B1B 100%)", color: "#FFFFFF" }}>
            <Plus size={14} /> Create Task
          </button>
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────── */}
      <div className="flex gap-3 mb-5">
        {[
          { label: "To Do",       count: totalByStatus.todo,        icon: Circle,      color: "#6B7280", bg: "rgba(107,114,128,0.1)" },
          { label: "In Progress", count: totalByStatus.in_progress, icon: Clock,       color: "#F59E0B", bg: "rgba(245,158,11,0.1)" },
          { label: "Completed",   count: totalByStatus.completed,   icon: CheckCircle2,color: "#16A34A", bg: "rgba(22,163,74,0.1)" },
          { label: "Total",       count: tasks.length,              icon: Target,      color: "#de1a1a", bg: "rgba(222,26,26,0.1)" },
        ].map(({ label, count, icon: Icon, color, bg }) => (
          <div key={label} className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
            style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)" }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: bg }}>
              <Icon size={13} style={{ color }} />
            </div>
            <span className="text-[13px] font-medium" style={{ color: "#6B7280" }}>{label}</span>
            <span className="text-[16px] font-black" style={{ color: "#111827" }}>{count}</span>
          </div>
        ))}
      </div>

      {/* ── Create Task Modal ─────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}>
          <div className="w-full max-w-lg rounded-2xl p-6 mx-4"
            style={{ background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)" }}>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(222,26,26,0.1)" }}>
                  <Target size={16} style={{ color: "#de1a1a" }} />
                </div>
                <h2 className="text-[18px] font-black" style={{ color: "#111827", fontFamily: "var(--font-jakarta)" }}>
                  Create Task
                </h2>
              </div>
              <button onClick={() => { setShowForm(false); setSelectedMembers([]) }}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100"
                style={{ color: "#6B7280" }}>
                <X size={16} />
              </button>
            </div>

            <style>{`
              .task-input { outline: none; transition: border-color 0.15s, box-shadow 0.15s; }
              .task-input::placeholder { color: #6B7280; }
              .task-input:focus { border-color: rgba(222,26,26,0.5) !important; box-shadow: 0 0 0 3px rgba(222,26,26,0.06) !important; }
            `}</style>

            <form action={(fd) => {
              startTransition(() => {
                action(fd)
                setShowForm(false)
                setSelectedMembers([])
              })
            }} className="space-y-4">

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5"
                  style={{ color: "#374151" }}>Title *</label>
                <input name="title" required placeholder="Task title…"
                  className="task-input w-full rounded-xl px-3.5 py-2.5 text-[13px]"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111827", fontFamily: "inherit" }} />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5"
                  style={{ color: "#374151" }}>Description</label>
                <textarea name="description" rows={2} placeholder="Optional details…"
                  className="task-input w-full rounded-xl px-3.5 py-2.5 text-[13px] resize-none"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111827", fontFamily: "inherit" }} />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5"
                  style={{ color: "#374151" }}>
                  Assign To
                  {selectedMembers.length > 0 && (
                    <span className="ml-2 normal-case text-[10px]" style={{ color: "#de1a1a" }}>
                      ({selectedMembers.length} selected)
                    </span>
                  )}
                </label>
                {selectedMembers.map(id => (
                  <input key={id} type="hidden" name="assigned_to" value={id} />
                ))}
                {members.length === 0 ? (
                  <p className="text-[12px] py-2" style={{ color: "#6B7280" }}>
                    No team members yet — add members in Team settings
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {members.map(m => {
                      const selected = selectedMembers.includes(m.id)
                      return (
                        <button key={m.id} type="button" onClick={() => toggleMember(m.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all"
                          style={selected
                            ? { background: "rgba(222,26,26,0.1)", border: "1px solid rgba(222,26,26,0.35)", color: "#de1a1a" }
                            : { background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }
                          }>
                          <span className="w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center flex-shrink-0"
                            style={selected
                              ? { background: "rgba(222,26,26,0.15)", color: "#de1a1a" }
                              : { background: "#E5E7EB", color: "#6B7280" }}>
                            {m.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </span>
                          {m.name.split(" ")[0]}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5"
                    style={{ color: "#374151" }}>Priority</label>
                  <select name="priority" defaultValue="medium"
                    className="task-input w-full rounded-xl px-3.5 py-2.5 text-[13px]"
                    style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111827", fontFamily: "inherit" }}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5"
                    style={{ color: "#374151" }}>Client / Project</label>
                  <select name="project_id"
                    className="task-input w-full rounded-xl px-3.5 py-2.5 text-[13px]"
                    style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111827", fontFamily: "inherit" }}>
                    <option value="">No project</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.business_name}{p.client_name ? ` — ${p.client_name}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.16em] mb-1.5"
                  style={{ color: "#374151" }}>Due Date</label>
                <input name="due_date" type="date"
                  className="task-input w-full rounded-xl px-3.5 py-2.5 text-[13px]"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111827", fontFamily: "inherit" }} />
              </div>

              {state && 'error' in state && (
                <p className="text-[12px] font-medium" style={{ color: "#de1a1a" }}>{state.error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setShowForm(false); setSelectedMembers([]) }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-colors hover:bg-gray-50"
                  style={{ background: "#F3F4F6", border: "1px solid #E5E7EB", color: "#6B7280" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
                  style={{ background: "linear-gradient(135deg, #de1a1a 0%, #991B1B 100%)", color: "#FFFFFF", opacity: formPending ? 0.65 : 1 }}>
                  {formPending && <Loader2 size={13} className="animate-spin" />}
                  {selectedMembers.length > 1
                    ? `Create ${selectedMembers.length} Tasks`
                    : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── By Member View ────────────────────────────────────── */}
      {viewMode === "member" && (
        <div className="overflow-x-auto -mx-2 px-2 pb-4">
          <div className="flex gap-4" style={{ minWidth: `${memberColumns.length * 296}px` }}>
            {memberColumns.map((col) => (
              <div key={col.id} className="flex-shrink-0 rounded-2xl p-4 flex flex-col"
                style={{
                  width: 280,
                  background: "#FFFFFF",
                  border: "1px solid #E5E7EB",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)",
                  minHeight: 480,
                }}>

                {/* Column header */}
                <div className="flex items-center gap-2.5 mb-4 pb-3"
                  style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                    style={col.id === "unassigned"
                      ? { background: "#F3F4F6", color: "#6B7280" }
                      : { background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                    {col.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold truncate" style={{ color: "#111827" }}>{col.label}</p>
                    {col.team && (
                      <p className="text-[10px] truncate" style={{ color: "#6B7280" }}>{col.team}</p>
                    )}
                  </div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: col.tasks.length > 0 ? "rgba(222,26,26,0.1)" : "#F3F4F6",
                      color: col.tasks.length > 0 ? "#de1a1a" : "#6B7280",
                    }}>
                    {col.tasks.length}
                  </span>
                </div>

                {/* Tasks */}
                {col.tasks.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 py-10">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: "#F9FAFB" }}>
                      <Target size={18} style={{ color: "#D1D5DB" }} />
                    </div>
                    <p className="text-[12px]" style={{ color: "#6B7280" }}>No tasks assigned</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {col.tasks.map(task => (
                      <TaskCard key={task.id} task={task}
                        onMove={moveTask} onDelete={removeTask}
                        isMoving={movingId === task.id && isPending}
                        isDeleting={deletingId === task.id && isPending}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── By Status View ────────────────────────────────────── */}
      {viewMode === "status" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statusColumns.map((col) => (
            <div key={col.key} className="rounded-2xl p-4 flex flex-col"
              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)", minHeight: 480 }}>

              {/* Column header */}
              <div className="flex items-center justify-between mb-4 pb-3"
                style={{ borderBottom: "1px solid #F3F4F6" }}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.dot }} />
                  <span className="text-[13px] font-bold" style={{ color: "#111827" }}>{col.label}</span>
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: col.bg, color: col.color }}>
                  {col.tasks.length}
                </span>
              </div>

              {col.tasks.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-[12px]" style={{ color: "#D1D5DB" }}>No tasks</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {col.tasks.map(task => (
                    <TaskCard key={task.id} task={task}
                      onMove={moveTask} onDelete={removeTask}
                      isMoving={movingId === task.id && isPending}
                      isDeleting={deletingId === task.id && isPending}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
