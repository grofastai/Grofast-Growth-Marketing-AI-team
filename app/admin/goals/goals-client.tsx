"use client"

import { useState, useTransition, useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Plus, X, Trash2, Loader2, Calendar, Users, Columns,
  CheckCircle2, Clock, Circle, Target,
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

// member column empty-state illustrations — cycles through characters
const MEMBER_ILLUSTRATIONS = [
  "/brand/task-assign/403283b3-ae8c-4981-afea-ef677ea92427.png", // boy waving
  "/brand/task-assign/42f20ffc-9997-4648-b3d5-03de4fb78125.png", // boy coding
  "/brand/task-assign/856821dc-d180-43f4-a82d-98d4b12c7d61.png", // boy thumbs up headset
  "/brand/task-assign/8e422454-bc36-4a8b-95e0-6ce396fac88d.png", // boy dual screens
  "/brand/task-assign/cf102e0c-ce87-4562-af99-80abba865e18.png", // boy video editing
  "/brand/task-assign/ff982d0f-bd33-4085-ba95-bfedef2baf4d.png", // boy design tablet
  "/brand/task-assign/3a32530b-be9e-4ddd-9e33-47b947bc5b43.png", // boy analytics
]

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
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[13px] font-semibold leading-snug flex-1" style={{ color: "#111827" }}>{task.title}</p>
        <button onClick={() => onDelete(task.id)} disabled={isDeleting}
          className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5 p-0.5 rounded">
          {isDeleting
            ? <Loader2 size={11} className="animate-spin" style={{ color: "#de1a1a" }} />
            : <Trash2 size={11} style={{ color: "rgba(222,26,26,0.5)" }} />}
        </button>
      </div>
      {task.description && (
        <p className="text-[11px] mb-2.5 leading-relaxed" style={{ color: "#6B7280" }}>{task.description}</p>
      )}
      <div className="flex flex-wrap gap-1.5 mb-2.5">
        <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: st.bg, color: st.color }}>
          <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: st.dot }} />
          {st.label}
        </span>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: pr.bg, color: pr.color }}>{task.priority.toUpperCase()}</span>
        {project && (
          <span className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: "rgba(222,26,26,0.07)", color: "#B91C1C" }}>{project.business_name}</span>
        )}
        {task.due_date && (
          <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded"
            style={{ background: overdue ? "rgba(222,26,26,0.08)" : "rgba(0,0,0,0.04)", color: overdue ? "#de1a1a" : "#6B7280" }}>
            <Calendar size={9} /> {fmt(task.due_date)}{overdue ? " ⚠" : ""}
          </span>
        )}
      </div>
      <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity pt-1"
        style={{ borderTop: "1px solid #F3F4F6" }}>
        {prev && (
          <button onClick={() => onMove(task.id, prev)} disabled={isMoving}
            className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg"
            style={{ background: "rgba(0,0,0,0.04)", color: "#6B7280" }}>← Back</button>
        )}
        {next && (
          <button onClick={() => onMove(task.id, next)} disabled={isMoving}
            className="flex-1 text-[10px] font-bold py-1.5 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
            {isMoving ? <Loader2 size={11} className="animate-spin" /> : "Forward →"}
          </button>
        )}
        {!prev && !next && (
          <p className="text-[10px] text-center w-full" style={{ color: "#6B7280" }}>Completed ✓</p>
        )}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function GoalsClient({
  tasks: initialTasks, members, projects,
}: {
  tasks: Task[]
  members: Member[]
  projects: Project[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [showForm, setShowForm] = useState(false)
  const [viewMode, setViewMode] = useState<"member" | "status">("member")
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  type TaskActionState = { error: string } | { success: true } | null
  const [state, action, formPending] = useActionState<TaskActionState, FormData>(createTask, null)

  useEffect(() => { setTasks(initialTasks) }, [initialTasks])
  useEffect(() => {
    if (state && "success" in state) { router.refresh(); setShowForm(false); setSelectedMembers([]) }
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
      tasks: tasks.filter(t => !(Array.isArray(t.users) ? t.users[0] : t.users)),
    },
    ...members.map((m, idx) => ({
      id: m.id,
      label: m.name,
      initials: m.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase(),
      team: m.team ?? null,
      tasks: tasks.filter(t => { const u = Array.isArray(t.users) ? t.users[0] : t.users; return u?.id === m.id }),
      illustration: MEMBER_ILLUSTRATIONS[idx % MEMBER_ILLUSTRATIONS.length],
    })),
  ]

  const statusColumns = (["todo", "in_progress", "completed"] as const).map(s => ({
    key: s, ...STATUS_CONFIG[s], tasks: tasks.filter(t => t.status === s),
  }))

  const totalByStatus = {
    todo:        tasks.filter(t => t.status === "todo").length,
    in_progress: tasks.filter(t => t.status === "in_progress").length,
    completed:   tasks.filter(t => t.status === "completed").length,
  }

  // ── Stat cards config ────────────────────────────────────────────────────
  const STAT_CARDS = [
    {
      label: "To Do", count: totalByStatus.todo,
      img: "/brand/task-assign/8c60ba7f-9bf2-4050-b633-4016457dd4d5.png",
      numColor: "#111827", bg: "#FFFFFF",
    },
    {
      label: "In Progress", count: totalByStatus.in_progress,
      img: "/brand/task-assign/997e4695-b557-4b2e-b056-488d15e04059.png",
      numColor: "#F59E0B", bg: "#FFFFFF",
    },
    {
      label: "Completed", count: totalByStatus.completed,
      img: "/brand/task-assign/b142a2e3-2d19-48c0-8636-5d3e2f2810ce.png",
      numColor: "#16A34A", bg: "#FFFFFF",
    },
    {
      label: "Total", count: tasks.length,
      img: "/brand/task-assign/b69f32ac-2f75-47fc-b056-3775c7a6e09f.png",
      numColor: "#de1a1a", bg: "#FFFFFF",
    },
  ]

  return (
    <div style={{ background: "#F5F6FA", minHeight: "100vh", padding: "24px 28px 48px" }}>

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div style={{
        background: "#FFFFFF", borderRadius: 20, border: "1px solid #EBEDF2",
        padding: "20px 28px", marginBottom: 20,
        boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      }}>
        {/* Left: title */}
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#de1a1a", fontFamily: "var(--font-jakarta)", margin: 0, lineHeight: 1.1 }}>
            Task Board
          </h1>
          <p style={{ fontSize: 13, color: "#9CA3AF", margin: "4px 0 0", fontWeight: 500 }}>
            Assign and track team tasks — {tasks.length} total
          </p>
        </div>

        {/* Right: view toggle + create */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", background: "#F3F4F6", border: "1px solid #E5E7EB", borderRadius: 12, padding: 4, gap: 4 }}>
            <button onClick={() => setViewMode("member")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", cursor: "pointer", transition: "all 0.15s",
                background: viewMode === "member" ? "#FFFFFF" : "transparent",
                color: viewMode === "member" ? "#de1a1a" : "#6B7280",
                boxShadow: viewMode === "member" ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              }}>
              <Users size={13} /> By Member
            </button>
            <button onClick={() => setViewMode("status")}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                border: "none", cursor: "pointer", transition: "all 0.15s",
                background: viewMode === "status" ? "#FFFFFF" : "transparent",
                color: viewMode === "status" ? "#de1a1a" : "#6B7280",
                boxShadow: viewMode === "status" ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
              }}>
              <Columns size={13} /> By Status
            </button>
          </div>
          <button onClick={() => setShowForm(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 22px", borderRadius: 12, fontSize: 13, fontWeight: 700,
              border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #de1a1a 0%, #991B1B 100%)",
              color: "#FFFFFF", boxShadow: "0 4px 16px rgba(222,26,26,0.3)",
            }}>
            <Plus size={15} /> Create Task
          </button>
        </div>
      </div>

      {/* ── STAT CARDS ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
        {STAT_CARDS.map(card => (
          <div key={card.label} style={{
            background: card.bg, borderRadius: 18, border: "1px solid #EBEDF2",
            padding: "22px 20px 14px 24px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          }}>
            <div>
              <p style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 600, margin: "0 0 8px" }}>{card.label}</p>
              <p style={{ fontSize: 48, fontWeight: 900, color: card.numColor, margin: 0, lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>
                {card.count}
              </p>
            </div>
            <div style={{ position: "relative", width: 80, height: 80, flexShrink: 0 }}>
              <Image src={card.img} alt={card.label} fill style={{ objectFit: "contain" }} />
            </div>
          </div>
        ))}
      </div>

      {/* ── BY MEMBER VIEW ──────────────────────────────────────────────────── */}
      {viewMode === "member" && (
        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
          <div style={{ display: "flex", gap: 16, minWidth: `${memberColumns.length * 300}px` }}>
            {memberColumns.map((col, colIdx) => {
              const isUnassigned = col.id === "unassigned"
              const memberCol = col as typeof col & { illustration?: string }
              return (
                <div key={col.id} style={{
                  width: 280, flexShrink: 0, borderRadius: 20,
                  background: "#FFFFFF", border: "1px solid #EBEDF2",
                  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
                  display: "flex", flexDirection: "column", minHeight: 500,
                }}>
                  {/* Column header */}
                  <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 800,
                      background: isUnassigned ? "#F3F4F6" : "rgba(222,26,26,0.1)",
                      color: isUnassigned ? "#6B7280" : "#de1a1a",
                      border: isUnassigned ? "1px solid #E5E7EB" : "1px solid rgba(222,26,26,0.2)",
                    }}>
                      {col.initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: 0, lineHeight: 1.2 }}>{col.label}</p>
                      {col.team && <p style={{ fontSize: 10, color: "#9CA3AF", margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{col.team}</p>}
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 700, minWidth: 24, height: 24,
                      borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      background: "#F3F4F6", color: "#6B7280",
                    }}>{col.tasks.length}</span>
                  </div>

                  {/* Body */}
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    {col.tasks.length === 0 ? (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "24px 16px" }}>
                        {/* Character illustration */}
                        <div style={{ position: "relative", width: 180, height: 160 }}>
                          <Image
                            src={isUnassigned
                              ? "/brand/task-assign/4ed6bcdd-a758-45ae-aac4-e112cd84ae67.png"
                              : (memberCol.illustration ?? MEMBER_ILLUSTRATIONS[colIdx % MEMBER_ILLUSTRATIONS.length])
                            }
                            alt=""
                            fill
                            style={{ objectFit: "contain" }}
                          />
                        </div>
                        <p style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 500, margin: 0 }}>No tasks assigned</p>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px" }}>
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

                  {/* Bottom add button */}
                  <div style={{ padding: "10px 14px 14px", display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => setShowForm(true)}
                      style={{
                        width: 32, height: 32, borderRadius: "50%", border: "none", cursor: "pointer",
                        background: "rgba(222,26,26,0.1)", color: "#de1a1a",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 20, fontWeight: 300, lineHeight: 1,
                      }}>
                      <Plus size={15} />
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {statusColumns.map(col => (
            <div key={col.key} style={{
              borderRadius: 20, background: "#FFFFFF", border: "1px solid #EBEDF2",
              boxShadow: "0 2px 10px rgba(0,0,0,0.05)", minHeight: 480,
              display: "flex", flexDirection: "column",
            }}>
              <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: col.dot, display: "inline-block" }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#111827" }}>{col.label}</span>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: col.bg, color: col.color }}>{col.tasks.length}</span>
              </div>
              {col.tasks.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <p style={{ fontSize: 12, color: "#D1D5DB" }}>No tasks</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px" }}>
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

      {/* ── BOTTOM BANNER ───────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 24, borderRadius: 20, background: "#FFFFFF",
        border: "1px solid #EBEDF2", boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 32px 0 0", overflow: "hidden", minHeight: 140,
      }}>
        {/* Left characters */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 0, flexShrink: 0 }}>
          {[
            "/brand/task-assign/2893a780-1211-44ec-92ce-1ebfc1910eb3.png",
            "/brand/task-assign/3a32530b-be9e-4ddd-9e33-47b947bc5b43.png",
            "/brand/task-assign/2680ef12-265d-46d1-9eb7-beef6574d23b.png",
          ].map((src, i) => (
            <div key={i} style={{ position: "relative", width: 110, height: 130, flexShrink: 0, marginRight: i < 2 ? -16 : 0 }}>
              <Image src={src} alt="" fill style={{ objectFit: "contain", objectPosition: "bottom" }} />
            </div>
          ))}
        </div>

        {/* Text */}
        <div style={{ flex: 1, padding: "24px 32px" }}>
          <p style={{ fontSize: 20, fontWeight: 900, color: "#111827", margin: "0 0 6px", fontFamily: "var(--font-jakarta)" }}>
            Stay Organized, Stay Ahead!
          </p>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
            Create tasks, assign to your team,<br />and track progress seamlessly.
          </p>
        </div>

        {/* Right illustration */}
        <div style={{ position: "relative", width: 120, height: 130, flexShrink: 0 }}>
          <Image
            src="/brand/task-assign/8e422454-bc36-4a8b-95e0-6ce396fac88d.png"
            alt="" fill style={{ objectFit: "contain", objectPosition: "right bottom" }}
          />
        </div>
      </div>

      {/* ── CREATE TASK MODAL ────────────────────────────────────────────────── */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}>
          <div style={{ width: "100%", maxWidth: 520, borderRadius: 20, padding: "28px 28px 24px", margin: "0 16px", background: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(222,26,26,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Target size={18} style={{ color: "#de1a1a" }} />
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111827", fontFamily: "var(--font-jakarta)", margin: 0 }}>Create Task</h2>
              </div>
              <button onClick={() => { setShowForm(false); setSelectedMembers([]) }}
                style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={15} style={{ color: "#6B7280" }} />
              </button>
            </div>

            <style>{`.ti{outline:none;width:100%;border-radius:12px;padding:10px 14px;font-size:13px;background:#F9FAFB;border:1px solid #E5E7EB;color:#111827;font-family:inherit;transition:border-color 0.15s}.ti:focus{border-color:rgba(222,26,26,0.5)!important}`}</style>

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
                <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>
                  Assign To {selectedMembers.length > 0 && <span style={{ color: "#de1a1a", fontWeight: 700 }}>({selectedMembers.length} selected)</span>}
                </label>
                {selectedMembers.map(id => <input key={id} type="hidden" name="assigned_to" value={id} />)}
                {members.length === 0 ? (
                  <p style={{ fontSize: 12, color: "#6B7280" }}>No team members yet</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {members.map(m => {
                      const sel = selectedMembers.includes(m.id)
                      return (
                        <button key={m.id} type="button" onClick={() => toggleMember(m.id)}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1px solid", cursor: "pointer", transition: "all 0.15s",
                            background: sel ? "rgba(222,26,26,0.08)" : "#F3F4F6",
                            borderColor: sel ? "rgba(222,26,26,0.3)" : "#E5E7EB",
                            color: sel ? "#de1a1a" : "#6B7280",
                          }}>
                          <span style={{ width: 20, height: 20, borderRadius: "50%", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", background: sel ? "rgba(222,26,26,0.15)" : "#E5E7EB", color: sel ? "#de1a1a" : "#6B7280" }}>
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
                  <label style={{ display: "block", fontSize: 10, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 6 }}>Client / Project</label>
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
                <p style={{ fontSize: 12, color: "#de1a1a", fontWeight: 600, margin: 0 }}>{state.error}</p>
              )}

              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button type="button" onClick={() => { setShowForm(false); setSelectedMembers([]) }}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13, fontWeight: 600, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={formPending}
                  style={{ flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(135deg,#de1a1a,#991B1B)", color: "#FFFFFF", opacity: formPending ? 0.65 : 1, boxShadow: "0 4px 14px rgba(222,26,26,0.3)" }}>
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
