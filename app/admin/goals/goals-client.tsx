"use client"

import { useState, useTransition, useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Plus, X, Trash2, Loader2, Calendar, Users, Columns, Target,
  TrendingUp, CheckSquare, Clock, BarChart3, Sparkles,
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

interface Member { id: string; name: string; employee_id: string; team?: string | null; gender?: string | null }
interface Project { id: string; business_name: string; client_name?: string | null }

const STATUS_CONFIG = {
  todo:        { label: "To Do",       color: "#6366F1", bg: "rgba(99,102,241,0.12)",  dot: "#6366F1" },
  in_progress: { label: "In Progress", color: "#F59E0B", bg: "rgba(245,158,11,0.12)",  dot: "#F59E0B" },
  completed:   { label: "Completed",   color: "#10B981", bg: "rgba(16,185,129,0.12)",  dot: "#10B981" },
} as const

const PRIORITY_COLORS = {
  low:    { color: "#6B7280", bg: "rgba(156,163,175,0.1)",  border: "#E5E7EB" },
  medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.1)",   border: "#FDE68A" },
  high:   { color: "#de1a1a", bg: "rgba(222,26,26,0.10)",   border: "#FECACA" },
}

const BOY_ILLUSTRATIONS = [
  "/brand/task-assign/boy1.png", "/brand/task-assign/boy2.png",
  "/brand/task-assign/boy3.png", "/brand/task-assign/boy4.png",
  "/brand/task-assign/boy5.png", "/brand/task-assign/boy6.png",
  "/brand/task-assign/boy7.png", "/brand/task-assign/boy8.png",
  "/brand/task-assign/boy9.png", "/brand/task-assign/boy10.png",
]
const GIRL_ILLUSTRATIONS = [
  "/brand/task-assign/girl1.png", "/brand/task-assign/girl2.png",
  "/brand/task-assign/girl3.png", "/brand/task-assign/girl4.png",
  "/brand/task-assign/750e4063-2c93-43d7-96f7-07ff6e6fae81.png",
  "/brand/task-assign/700acfaa-61d1-4f5e-b843-578053835b01.png",
  "/brand/task-assign/2680ef12-265d-46d1-9eb7-beef6574d23b.png",
]
function getMemberIllustration(gender: string | null | undefined, index: number) {
  const pool = gender === "female" ? GIRL_ILLUSTRATIONS : BOY_ILLUSTRATIONS
  return pool[index % pool.length]
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

// ── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onMove, onDelete, isMoving, isDeleting }: {
  task: Task
  onMove: (id: string, s: "todo" | "in_progress" | "completed") => void
  onDelete: (id: string) => void
  isMoving: boolean; isDeleting: boolean
}) {
  const pr = PRIORITY_COLORS[task.priority]
  const st = STATUS_CONFIG[task.status]
  const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
  const overdue = isOverdue(task.due_date, task.status)
  const next = NEXT[task.status]
  const prev = PREV[task.status]

  return (
    <div className="group" style={{
      background: "#FFFFFF", borderRadius: 14,
      border: "1px solid #F0F0F0",
      borderLeft: `3px solid ${pr.color}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      padding: "14px 14px 10px",
      transition: "box-shadow 0.2s, transform 0.2s",
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.12)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)" }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)" }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[13px] font-semibold leading-snug flex-1" style={{ color: "#111827" }}>{task.title}</p>
        <button onClick={() => onDelete(task.id)} disabled={isDeleting}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5">
          {isDeleting ? <Loader2 size={11} className="animate-spin" style={{ color: "#de1a1a" }} />
            : <Trash2 size={11} style={{ color: "rgba(222,26,26,0.45)" }} />}
        </button>
      </div>
      {task.description && (
        <p className="text-[11px] mb-2.5 leading-relaxed" style={{ color: "#9CA3AF" }}>{task.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: pr.bg, color: pr.color }}>{task.priority.toUpperCase()}</span>
        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: st.bg, color: st.color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
          {st.label}
        </span>
        {project && (
          <span className="text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: "rgba(222,26,26,0.07)", color: "#B91C1C" }}>{project.business_name}</span>
        )}
        {task.due_date && (
          <span className="flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: overdue ? "rgba(222,26,26,0.08)" : "#F3F4F6", color: overdue ? "#de1a1a" : "#9CA3AF" }}>
            <Calendar size={9} /> {fmt(task.due_date)}{overdue ? " ⚠" : ""}
          </span>
        )}
      </div>
      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pt-2"
        style={{ borderTop: "1px dashed #F0F0F0" }}>
        {prev && (
          <button onClick={() => onMove(task.id, prev)} disabled={isMoving}
            className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg"
            style={{ background: "#F9FAFB", color: "#9CA3AF", border: "1px solid #E5E7EB" }}>← Back</button>
        )}
        {next && (
          <button onClick={() => onMove(task.id, next)} disabled={isMoving}
            className="flex-1 text-[10px] font-bold py-1.5 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#de1a1a,#991B1B)", color: "#FFFFFF", border: "none" }}>
            {isMoving ? <Loader2 size={11} className="animate-spin" /> : "Move Forward →"}
          </button>
        )}
        {!prev && !next && (
          <p className="text-[10px] text-center w-full font-semibold" style={{ color: "#10B981" }}>✓ Done</p>
        )}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function GoalsClient({ tasks: initialTasks, members, projects }: {
  tasks: Task[]; members: Member[]; projects: Project[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState<"member" | "status">("member")
  const [mobileCol, setMobileCol] = useState<"todo" | "in_progress" | "completed">("todo")
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)

  function openForm(preselect?: string) {
    setSelectedMembers(preselect ? [preselect] : [])
    setShowForm(true)
  }
  type TaskActionState = { error: string } | { success: true } | null
  const [state, action, formPending] = useActionState<TaskActionState, FormData>(createTask, null)

  useEffect(() => { setTasks(initialTasks) }, [initialTasks])
  useEffect(() => {
    if (state && "success" in state) {
      setShowForm(false)
      setSelectedMembers([])
      startTransition(() => { router.refresh() })
    }
  }, [state]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMember(id: string) {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function moveTask(taskId: string, newStatus: "todo" | "in_progress" | "completed") {
    setMovingId(taskId)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
    startTransition(async () => { await updateTaskStatus(taskId, newStatus); setMovingId(null) })
  }
  function removeTask(id: string) {
    setDeletingId(id)
    startTransition(async () => { await deleteTask(id); setTasks(prev => prev.filter(t => t.id !== id)); setDeletingId(null) })
  }

  const memberColumns = [
    {
      id: "unassigned", label: "Unassigned", initials: "?", team: null as string | null,
      gender: null as string | null, illustration: "/brand/task-assign/4ed6bcdd-a758-45ae-aac4-e112cd84ae67.png",
      tasks: tasks.filter(t => !(Array.isArray(t.users) ? t.users[0] : t.users)),
    },
    ...members.map((m, idx) => ({
      id: m.id, label: m.name,
      initials: m.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(),
      team: m.team ?? null, gender: m.gender ?? null,
      tasks: tasks.filter(t => { const u = Array.isArray(t.users) ? t.users[0] : t.users; return u?.id === m.id }),
      illustration: getMemberIllustration(m.gender, idx),
    })),
  ]

  const statusColumns = (["todo", "in_progress", "completed"] as const).map(s => ({
    key: s, ...STATUS_CONFIG[s], tasks: tasks.filter(t => t.status === s),
  }))

  const todo = tasks.filter(t => t.status === "todo").length
  const inprog = tasks.filter(t => t.status === "in_progress").length
  const done = tasks.filter(t => t.status === "completed").length
  const total = tasks.length
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

  const STAT_CARDS = [
    { label: "To Do",       count: todo,   img: "/brand/task-assign/todo.png",       numColor: "#6366F1", accent: "#6366F1", accentBg: "rgba(99,102,241,0.08)",  pct: pct(todo)   },
    { label: "In Progress", count: inprog, img: "/brand/task-assign/inprogress.png", numColor: "#F59E0B", accent: "#F59E0B", accentBg: "rgba(245,158,11,0.08)",  pct: pct(inprog) },
    { label: "Completed",   count: done,   img: "/brand/task-assign/complete.png",   numColor: "#10B981", accent: "#10B981", accentBg: "rgba(16,185,129,0.08)",  pct: pct(done)   },
    { label: "Total Tasks", count: total,  img: "/brand/task-assign/total.png",      numColor: "#de1a1a", accent: "#de1a1a", accentBg: "rgba(222,26,26,0.06)",   pct: 100          },
  ]

  const TEAM_COLORS = [
    { from: "#6366F1", to: "#8B5CF6" },
    { from: "#de1a1a", to: "#F97316" },
    { from: "#10B981", to: "#06B6D4" },
    { from: "#F59E0B", to: "#EF4444" },
    { from: "#8B5CF6", to: "#EC4899" },
    { from: "#3B82F6", to: "#6366F1" },
  ]

  return (
    <div style={{ background: "linear-gradient(160deg,#F8F9FF 0%,#F5F6FA 100%)", minHeight: "100vh", padding: "24px 28px 56px" }}>

      {/* ── HERO HEADER ─────────────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 24, marginBottom: 22, overflow: "hidden",
        background: "linear-gradient(135deg, #de1a1a 0%, #991B1B 50%, #7F1D1D 100%)",
        boxShadow: "0 8px 32px rgba(222,26,26,0.35)",
        position: "relative",
      }}>
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "absolute", bottom: -30, right: 120, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "absolute", top: 10, right: 280, width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />

        <div style={{ padding: "28px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, position: "relative", zIndex: 1, flexWrap: "wrap" }}>
          {/* Left */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 8px", display: "flex", alignItems: "center" }}>
                <Sparkles size={16} style={{ color: "#FFD700" }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Admin Dashboard</span>
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 900, color: "#FFFFFF", margin: "0 0 6px", fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>
              Task Board
            </h1>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", margin: 0 }}>
              Assign, track & manage your team's work
            </p>
            {/* Mini stats row */}
            <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
              {[
                { icon: <CheckSquare size={12} />, label: `${done} Done` },
                { icon: <Clock size={12} />, label: `${inprog} Active` },
                { icon: <BarChart3 size={12} />, label: `${members.length} Members` },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 12px" }}>
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>{s.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF" }}>{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div style={{ display: "flex", background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 14, padding: 4, gap: 3 }}>
              {([["member", <Users size={13} key="u" />, "By Member"], ["status", <Columns size={13} key="c" />, "By Status"]] as const).map(([mode, icon, label]) => (
                <button key={mode} onClick={() => setViewMode(mode as "member" | "status")}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                    border: "none", cursor: "pointer", transition: "all 0.15s",
                    background: viewMode === mode ? "#FFFFFF" : "transparent",
                    color: viewMode === mode ? "#de1a1a" : "rgba(255,255,255,0.8)",
                    boxShadow: viewMode === mode ? "0 2px 8px rgba(0,0,0,0.15)" : "none",
                  }}>
                  {icon} {label}
                </button>
              ))}
            </div>
            <button onClick={() => openForm()} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "11px 22px", borderRadius: 14, fontSize: 13, fontWeight: 800,
              border: "none", cursor: "pointer",
              background: "#FFFFFF", color: "#de1a1a",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}>
              <Plus size={16} /> Create Task
            </button>
          </div>
        </div>
      </div>

      {/* ── STAT CARDS ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 22 }}>
        {STAT_CARDS.map(card => (
          <div key={card.label} style={{
            background: "#FFFFFF", borderRadius: 20,
            border: `1px solid ${card.accent}22`,
            padding: "20px 22px 16px",
            boxShadow: `0 4px 20px ${card.accent}18`,
            position: "relative", overflow: "hidden",
          }}>
            {/* Soft accent bg circle */}
            <div style={{ position: "absolute", top: -20, right: -20, width: 90, height: 90, borderRadius: "50%", background: card.accentBg }} />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", position: "relative" }}>
              <div>
                <p style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 600, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>{card.label}</p>
                <p style={{ fontSize: 52, fontWeight: 900, color: card.numColor, margin: 0, lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>
                  {card.count}
                </p>
              </div>
              <div style={{ position: "relative", width: 58, height: 58, flexShrink: 0 }}>
                <Image src={card.img} alt={card.label} fill style={{ objectFit: "contain" }} />
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ marginTop: 14, height: 4, background: "#F3F4F6", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${card.pct}%`, background: `linear-gradient(90deg, ${card.accent}, ${card.accent}99)`, borderRadius: 4, transition: "width 0.6s ease" }} />
            </div>
            <p style={{ fontSize: 10, color: card.numColor, fontWeight: 700, margin: "5px 0 0" }}>{card.pct}% of total</p>
          </div>
        ))}
      </div>

      {/* ── BY MEMBER VIEW ──────────────────────────────────────────────────── */}
      {viewMode === "member" && (
        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
          <div style={{ display: "flex", gap: 18, minWidth: `${memberColumns.length * 340}px` }}>
            {memberColumns.map((col, colIdx) => {
              const isUnassigned = col.id === "unassigned"
              const tc = TEAM_COLORS[colIdx % TEAM_COLORS.length]
              return (
                <div key={col.id} style={{
                  width: 320, flexShrink: 0, borderRadius: 22,
                  background: "#FFFFFF",
                  border: "1px solid #EBEDF2",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
                  display: "flex", flexDirection: "column", minHeight: 520,
                  overflow: "hidden",
                }}>
                  {/* Gradient top strip */}
                  <div style={{
                    height: 5, flexShrink: 0,
                    background: isUnassigned ? "#E5E7EB" : `linear-gradient(90deg, ${tc.from}, ${tc.to})`,
                  }} />

                  {/* Column header */}
                  <div style={{ padding: "16px 18px 14px", borderBottom: "1px solid #F5F5F5", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 900,
                      background: isUnassigned ? "#F3F4F6" : `linear-gradient(135deg, ${tc.from}, ${tc.to})`,
                      color: isUnassigned ? "#9CA3AF" : "#FFFFFF",
                      boxShadow: isUnassigned ? "none" : `0 4px 12px ${tc.from}40`,
                    }}>
                      {col.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1.3 }}>{col.label}</p>
                      {col.team && <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.team}</p>}
                    </div>
                    <div style={{
                      minWidth: 28, height: 28, borderRadius: 8, fontSize: 12, fontWeight: 800,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isUnassigned ? "#F3F4F6" : `${tc.from}18`,
                      color: isUnassigned ? "#9CA3AF" : tc.from,
                      padding: "0 6px",
                    }}>{col.tasks.length}</div>
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    {col.tasks.length === 0 ? (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "20px 16px 8px" }}>
                        <div style={{ position: "relative", width: 300, height: 270 }}>
                          <Image src={col.illustration} alt="" fill style={{ objectFit: "contain" }} />
                        </div>
                        <p style={{ fontSize: 12, color: "#D1D5DB", fontWeight: 600, margin: 0 }}>No tasks assigned yet</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 14px" }}>
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

                  {/* Footer add button */}
                  <div style={{ padding: "10px 14px 14px", display: "flex", justifyContent: "flex-end", borderTop: "1px solid #F9FAFB" }}>
                    <button onClick={() => openForm(isUnassigned ? undefined : col.id)} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "7px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700,
                      background: isUnassigned ? "#F3F4F6" : `${tc.from}12`,
                      color: isUnassigned ? "#9CA3AF" : tc.from,
                    }}>
                      <Plus size={13} /> Add Task
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── BY STATUS VIEW ──────────────────────────────────────────────────── */}
      {viewMode === "status" && (
        <>
          {/* Mobile tab view — shown only on small screens */}
          <div className="md:hidden">
            {/* Tab buttons */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {(["todo", "in_progress", "completed"] as const).map(col => (
                <button
                  key={col}
                  onClick={() => setMobileCol(col)}
                  className="flex-shrink-0 px-4 py-2 rounded-xl text-[13px] font-bold transition-all"
                  style={mobileCol === col
                    ? { background: "#DE1A1A", color: "#fff", border: "none" }
                    : { background: "#F3F4F6", color: "#6B7280", border: "none" }}
                >
                  {col === "todo" ? `To Do (${tasks.filter(t => t.status === "todo").length})` : col === "in_progress" ? `In Progress (${tasks.filter(t => t.status === "in_progress").length})` : `Completed (${tasks.filter(t => t.status === "completed").length})`}
                </button>
              ))}
            </div>
            {/* Single-column task list */}
            <div className="flex flex-col gap-3">
              {tasks.filter(t => t.status === mobileCol).length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#D1D5DB", fontSize: 13, fontWeight: 600 }}>
                  No tasks here
                </div>
              ) : (
                tasks.filter(t => t.status === mobileCol).map(task => (
                  <TaskCard key={task.id} task={task}
                    onMove={moveTask} onDelete={removeTask}
                    isMoving={movingId === task.id && isPending}
                    isDeleting={deletingId === task.id && isPending}
                  />
                ))
              )}
            </div>
          </div>

          {/* Desktop 3-column grid — hidden on mobile */}
          <div className="hidden md:grid md:grid-cols-3 gap-[18px]">
            {statusColumns.map(col => (
              <div key={col.key} style={{
                borderRadius: 22, background: "#FFFFFF", border: "1px solid #EBEDF2",
                boxShadow: "0 4px 20px rgba(0,0,0,0.06)", minHeight: 480,
                display: "flex", flexDirection: "column", overflow: "hidden",
              }}>
                <div style={{ height: 4, background: col.dot }} />
                <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #F5F5F5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: col.bg }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: col.dot, display: "inline-block" }} />
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{col.label}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, padding: "4px 12px", borderRadius: 20, background: col.bg, color: col.color }}>{col.tasks.length} tasks</span>
                </div>
                {col.tasks.length === 0 ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 16, background: col.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ width: 16, height: 16, borderRadius: "50%", background: col.dot, display: "inline-block", opacity: 0.4 }} />
                    </div>
                    <p style={{ fontSize: 12, color: "#D1D5DB", fontWeight: 600 }}>No tasks here</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "14px 14px" }}>
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
        </>
      )}

      {/* ── BOTTOM BANNER ───────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 24, borderRadius: 24, overflow: "hidden",
        background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 40%, #4C1D95 100%)",
        boxShadow: "0 8px 32px rgba(49,46,129,0.35)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        minHeight: 180, position: "relative",
      }}>
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -30, left: 260, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "absolute", bottom: -20, left: 380, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />

        {/* Left — team image */}
        <div style={{ position: "relative", width: 320, height: 180, flexShrink: 0 }}>
          <Image src="/brand/task-assign/teamfordown.png" alt="" fill style={{ objectFit: "cover", objectPosition: "center top" }} />
        </div>

        {/* Text */}
        <div style={{ flex: 1, padding: "28px 36px", position: "relative", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <TrendingUp size={16} style={{ color: "#A78BFA" }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#A78BFA", textTransform: "uppercase", letterSpacing: "0.12em" }}>Team Productivity</span>
          </div>
          <p style={{ fontSize: 22, fontWeight: 900, color: "#FFFFFF", margin: "0 0 8px", fontFamily: "var(--font-jakarta)", lineHeight: 1.2 }}>
            Stay Organized,<br />Stay Ahead!
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: 0, lineHeight: 1.6 }}>
            Create tasks, assign to your team,<br />and track progress seamlessly.
          </p>
        </div>

        {/* Right — lamp illustration */}
        <div style={{ position: "relative", width: 170, height: 170, flexShrink: 0, marginRight: 16 }}>
          <Image src="/brand/task-assign/studyfortitle.png" alt="" fill style={{ objectFit: "contain", objectPosition: "right center" }} />
        </div>
      </div>

      {/* ── CREATE TASK MODAL ────────────────────────────────────────────────── */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
          <div style={{ width: "100%", maxWidth: 520, borderRadius: 24, padding: "28px 28px 24px", margin: "0 16px", background: "#FFFFFF", boxShadow: "0 24px 80px rgba(0,0,0,0.22)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 14, background: "linear-gradient(135deg,#de1a1a,#991B1B)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(222,26,26,0.3)" }}>
                  <Target size={20} style={{ color: "#FFFFFF" }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111827", fontFamily: "var(--font-jakarta)", margin: 0 }}>Create Task</h2>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Assign work to your team</p>
                </div>
              </div>
              <button onClick={() => { setShowForm(false); setSelectedMembers([]); }}
                style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={15} style={{ color: "#6B7280" }} />
              </button>
            </div>

            <style>{`.ti{outline:none;width:100%;border-radius:12px;padding:11px 14px;font-size:13px;background:#F9FAFB;border:1.5px solid #E5E7EB;color:#111827;font-family:inherit;transition:border-color 0.15s}.ti:focus{border-color:rgba(222,26,26,0.5)!important;background:#FFF!important}`}</style>

            <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>Title *</label>
                <input name="title" required placeholder="Task title…" className="ti" />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>Description</label>
                <textarea name="description" rows={2} placeholder="Optional details…" className="ti" style={{ resize: "none" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>
                  Assign To {selectedMembers.length > 0 && <span style={{ color: "#de1a1a" }}>({selectedMembers.length} selected)</span>}
                </label>
                {selectedMembers.map(id => <input key={id} type="hidden" name="assigned_to" value={id} />)}
                {members.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#9CA3AF" }}>No team members yet</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {members.map(m => {
                      const sel = selectedMembers.includes(m.id)
                      return (
                        <button key={m.id} type="button" onClick={() => toggleMember(m.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20,
                            fontSize: 12, fontWeight: 600, border: "1.5px solid", cursor: "pointer", transition: "all 0.15s",
                            background: sel ? "rgba(222,26,26,0.07)" : "#F9FAFB",
                            borderColor: sel ? "#de1a1a" : "#E5E7EB",
                            color: sel ? "#de1a1a" : "#6B7280",
                          }}>
                          <span style={{ width: 22, height: 22, borderRadius: "50%", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", background: sel ? "rgba(222,26,26,0.15)" : "#E5E7EB", color: sel ? "#de1a1a" : "#9CA3AF" }}>
                            {m.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                          </span>
                          {m.name.split(" ")[0]}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>Priority</label>
                  <select name="priority" defaultValue="medium" className="ti">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>Project</label>
                  <select name="project_id" className="ti">
                    <option value="">No project</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.business_name}{p.client_name ? ` — ${p.client_name}` : ""}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>Due Date</label>
                <input name="due_date" type="date" className="ti" style={{ colorScheme: "light" }} />
              </div>

              {state && "error" in state && (
                <p style={{ fontSize: 12, color: "#de1a1a", fontWeight: 600, margin: 0, padding: "8px 12px", background: "rgba(222,26,26,0.06)", borderRadius: 8 }}>{state.error}</p>
              )}

              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button type="button" onClick={() => { setShowForm(false); setSelectedMembers([]); }}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 12, fontSize: 13, fontWeight: 600, border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formPending}
                  style={{ flex: 1, padding: "12px 0", borderRadius: 12, fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(135deg,#de1a1a,#991B1B)", color: "#FFFFFF", opacity: formPending ? 0.7 : 1, boxShadow: "0 4px 16px rgba(222,26,26,0.35)" }}>
                  {formPending && <Loader2 size={13} className="animate-spin" />}
                  {selectedMembers.length > 1 ? `Create ${selectedMembers.length} Tasks` : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
