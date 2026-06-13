"use client"

import { useState, useTransition, useEffect, useActionState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import {
  Search, Calendar, Clock, Sparkles, Target,
  TrendingUp, CheckCircle2, ChevronDown, Zap,
  Flame, AlertCircle, GripVertical, Plus, X, User,
  Trash2, MessageSquare, Send, Loader2, Pencil, Layers,
} from "lucide-react"
import { updateTaskStatus, createMemberTask, deleteTask, deleteQuickProject, updateTask } from "@/lib/actions/tasks"
import { getTaskComments, addTaskComment, type TaskComment } from "@/lib/actions/comments"

interface Task {
  id: string
  title: string
  description: string | null
  status: "todo" | "in_progress" | "completed"
  priority: "low" | "medium" | "high"
  due_date: string | null
  created_by: string | null
  assigned_to: string | null
  projects: { id: string; business_name: string } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assignedBy: { id: string; name: string } | null | any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assignedToUser: { id: string; name: string } | null | any
}

// ── Design tokens ──────────────────────────────────────────────────────────────
const PRIORITY_STYLE = {
  high:   { bg: "rgba(222,26,26,0.1)",   color: "#de1a1a", label: "High"   },
  medium: { bg: "rgba(245,158,11,0.1)",  color: "#D97706", label: "Medium" },
  low:    { bg: "rgba(59,130,246,0.1)",  color: "#3B82F6", label: "Low"    },
}

const KANBAN_COLS = [
  { key: "todo"        as const, label: "To Do",       accent: "#6B7280" },
  { key: "in_progress" as const, label: "In Progress", accent: "#F59E0B" },
  { key: "completed"   as const, label: "Completed",   accent: "#22C55E" },
]

const SPARK = {
  hours:  [1.5, 2.1, 3.0, 2.5, 3.2, 2.8, 3.6],
  active: [12,  10,  11,  9,   10,  8,   8  ],
  done:   [6,   7,   8,   9,   10,  11,  12 ],
  prod:   [75,  78,  80,  79,  84,  85,  87 ],
}

function taskPct(id: string) {
  const n = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  return 30 + (n % 41)
}

// ── Mini Sparkline ─────────────────────────────────────────────────────────────
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

// ── Productivity Heatmap (dynamic from tasks) ─────────────────────────────────
function HeatMap({ tasks }: { tasks: Task[] }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  // Generate a deterministic heatmap weighted by task data
  const completedWeight = tasks.filter(t => t.status === "completed").length
  const wipWeight       = tasks.filter(t => t.status === "in_progress").length
  const seed = (completedWeight * 7 + wipWeight * 3) || 1
  const rows = [
    { day: "Mon", vals: days.map((_, i) => ((seed * (i + 1) * 13) % 10) / 10) },
    { day: "Wed", vals: days.map((_, i) => ((seed * (i + 3) * 7)  % 10) / 10) },
    { day: "Fri", vals: days.map((_, i) => ((seed * (i + 5) * 11) % 10) / 10) },
  ]
  // Boost later cells if we have completed tasks
  if (completedWeight > 0) {
    rows.forEach(row => {
      row.vals = row.vals.map((v, i) => i >= 4 ? Math.min(1, v + 0.3) : v)
    })
  }
  return (
    <div className="space-y-1.5">
      {rows.map(row => (
        <div key={row.day} className="flex items-center gap-1">
          <span className="text-[9px] w-6 flex-shrink-0" style={{ color: "#9CA3AF" }}>{row.day}</span>
          {row.vals.map((v, i) => (
            <div key={i} title={`${Math.round(v * 100)}% activity`}
              className="flex-1 h-3.5 rounded-sm transition-all cursor-pointer hover:opacity-80"
              style={{ background: `rgba(222,26,26,${Math.max(0.07, v)})` }} />
          ))}
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[9px]" style={{ color: "#D1D5DB" }}>Less</span>
        <div className="flex gap-0.5">
          {[0.1, 0.3, 0.5, 0.75, 1].map(v => (
            <div key={v} className="w-3 h-3 rounded-sm" style={{ background: `rgba(222,26,26,${v})` }} />
          ))}
        </div>
        <span className="text-[9px]" style={{ color: "#D1D5DB" }}>More</span>
      </div>
    </div>
  )
}

// ── Dynamic Workflow Timeline ─────────────────────────────────────────────────
function WorkflowTimeline({ total, inProgress, completed }: { total: number; inProgress: number; completed: number }) {
  const hasAny     = total > 0
  const hasStarted = inProgress > 0 || completed > 0
  const allDone    = total > 0 && completed === total

  const steps = [
    { label: "Assigned",    sub: `${total} tasks`,       done: hasAny,     active: !hasStarted && hasAny },
    { label: "In Progress", sub: `${inProgress} active`, done: hasStarted, active: inProgress > 0 && !allDone },
    { label: "Review",      sub: "check quality",        done: allDone,    active: !allDone && hasStarted && inProgress === 0 },
    { label: "Done",        sub: `${completed} done`,    done: allDone,    active: false },
  ]

  return (
    <div className="flex items-start">
      {steps.map((step, i) => (
        <div key={step.label} className="flex-1 flex flex-col items-center min-w-0">
          <div className="flex items-center w-full">
            {i > 0 && (
              <div className="flex-1 h-0.5 transition-all"
                style={{ background: steps[i - 1].done ? "#22C55E" : "#E5E7EB" }} />
            )}
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all"
              style={{
                background:  step.done ? "#22C55E" : step.active ? "#de1a1a" : "#FFFFFF",
                borderColor: step.done ? "#22C55E" : step.active ? "#de1a1a" : "#E5E7EB",
              }}>
              {step.done
                ? <CheckCircle2 size={14} color="#FFF" />
                : <div className="w-2 h-2 rounded-full" style={{ background: step.active ? "#FFF" : "#D1D5DB" }} />
              }
            </div>
            {i < steps.length - 1 && (
              <div className="flex-1 h-0.5 transition-all"
                style={{ background: step.done ? "#22C55E" : "#E5E7EB" }} />
            )}
          </div>
          <p className="text-[9px] font-semibold mt-1.5 text-center leading-tight px-0.5" style={{ color: "#374151" }}>
            {step.label}
          </p>
          <p className="text-[8px] text-center leading-tight" style={{ color: "#9CA3AF" }}>{step.sub}</p>
        </div>
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "Just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Draggable Task Card ────────────────────────────────────────────────────────
function DraggableCard({
  task, today, onMove, isDragging, currentUserId, onDelete, onComment, onEdit,
}: {
  task: Task
  today: string
  onMove: (id: string, status: "todo" | "in_progress" | "completed") => void
  isDragging?: boolean
  currentUserId?: string
  onDelete?: (id: string) => void
  onComment?: (id: string) => void
  onEdit?: (task: Task) => void
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id, data: { status: task.status } })
  const style = transform
    ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)` }
    : undefined

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCardInner task={task} today={today} onMove={onMove} dragProps={{ attributes, listeners }} isDragging={isDragging}
        currentUserId={currentUserId} onDelete={onDelete} onComment={onComment} onEdit={onEdit} />
    </div>
  )
}

// ── Task Card Inner ────────────────────────────────────────────────────────────
function TaskCardInner({
  task, today, onMove, dragProps, isDragging, currentUserId, onDelete, onComment, onEdit,
}: {
  task: Task
  today: string
  onMove: (id: string, status: "todo" | "in_progress" | "completed") => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dragProps?: { attributes: any; listeners: any }
  isDragging?: boolean
  currentUserId?: string
  onDelete?: (id: string) => void
  onComment?: (id: string) => void
  onEdit?: (task: Task) => void
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
    <div className="rounded-2xl p-3.5 mb-2.5 group transition-all select-none"
      style={{
        background: isDragging ? "#F3F4F6" : "#FFFFFF",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 2px 10px rgba(0,0,0,0.05)",
        border: isOverdue ? "1px solid rgba(222,26,26,0.2)" : "1px solid transparent",
        opacity: isDragging ? 0.5 : 1,
        cursor: dragProps ? "grab" : "default",
      }}>

      {/* Title + drag handle */}
      <div className="flex items-start gap-2 mb-2">
        {dragProps && (
          <button {...dragProps.listeners} {...dragProps.attributes}
            className="flex-shrink-0 mt-0.5 opacity-30 group-hover:opacity-70 transition-opacity cursor-grab active:cursor-grabbing touch-none">
            <GripVertical size={13} style={{ color: "#6B7280" }} />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold leading-snug line-clamp-2" style={{ color: "#111111" }}>
            {task.title}
          </p>
          {task.assignedBy && task.created_by !== currentUserId && (
            <div className="flex items-center gap-1.5 mt-1">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black flex-shrink-0"
                style={{ background: "#de1a1a", color: "#FFFFFF" }}
                title={`Assigned by ${task.assignedBy.name}`}
              >
                {task.assignedBy.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
                by {task.assignedBy.name}
              </span>
            </div>
          )}
          {task.assignedToUser && task.created_by === currentUserId && task.assigned_to !== currentUserId && (
            <div className="flex items-center gap-1.5 mt-1">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-black flex-shrink-0"
                style={{ background: "#6366F1", color: "#FFFFFF" }}
                title={`Assigned to ${task.assignedToUser.name}`}
              >
                {task.assignedToUser.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
                to {task.assignedToUser.name}
              </span>
            </div>
          )}
        </div>
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
        {isOverdue && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold ml-auto" style={{ color: "#de1a1a" }}>
            <AlertCircle size={9} /> Overdue
          </span>
        )}
        {task.status === "in_progress" && !isOverdue && (
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
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: progressColor }} />
          </div>
        </div>
      )}

      {/* Footer */}
      {dueLabel && (
        <div className="flex items-center gap-1 mb-2">
          <Calendar size={9} style={{ color: isOverdue ? "#de1a1a" : "#9CA3AF" }} />
          <span className="text-[9px]" style={{ color: isOverdue ? "#de1a1a" : "#9CA3AF" }}>{dueLabel}</span>
        </div>
      )}

      {/* Move button */}
      {task.status !== "completed" && (
        <button
          onClick={() => onMove(task.id, task.status === "todo" ? "in_progress" : "completed")}
          className="w-full mt-1.5 py-1.5 rounded-xl text-[9px] font-bold transition-all hover:opacity-80"
          style={{
            background: task.status === "todo" ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)",
            color: task.status === "todo" ? "#D97706" : "#16A34A",
          }}>
          {task.status === "todo" ? "→ Start Task" : "→ Mark Completed"}
        </button>
      )}
      {task.status === "completed" && (
        <div className="flex items-center justify-center gap-1 mt-1.5 py-1 rounded-xl"
          style={{ background: "rgba(34,197,94,0.06)" }}>
          <CheckCircle2 size={10} style={{ color: "#22C55E" }} />
          <span className="text-[9px] font-bold" style={{ color: "#22C55E" }}>Completed</span>
        </div>
      )}

      {/* ── Action row: comment + edit + delete ── */}
      <div style={{ display: "flex", gap: 5, marginTop: 7, paddingTop: 7, borderTop: "1px solid #F3F4F6" }}>
        <button
          onClick={e => { e.stopPropagation(); onComment?.(task.id) }}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "4px 6px", borderRadius: 8, background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)", cursor: "pointer" }}
        >
          <MessageSquare size={10} style={{ color: "#6366F1" }} />
          <span style={{ fontSize: 9, color: "#6366F1", fontWeight: 700 }}>Comment</span>
        </button>
        {currentUserId && task.created_by === currentUserId && onEdit && (
          <button
            onClick={e => { e.stopPropagation(); onEdit(task) }}
            title="Edit task"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, padding: "4px 8px", borderRadius: 8, background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)", cursor: "pointer" }}
          >
            <Pencil size={10} style={{ color: "#10B981" }} />
            <span style={{ fontSize: 9, color: "#10B981", fontWeight: 700 }}>Edit</span>
          </button>
        )}
        {currentUserId && task.created_by === currentUserId && onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(task.id) }}
            title="Delete task"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "4px 8px", borderRadius: 8, background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.12)", cursor: "pointer" }}
          >
            <Trash2 size={10} style={{ color: "#de1a1a" }} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Droppable Column ───────────────────────────────────────────────────────────
function DroppableColumn({
  col, children, isOver,
}: {
  col: typeof KANBAN_COLS[number]
  children: React.ReactNode
  isOver: boolean
}) {
  const { setNodeRef } = useDroppable({ id: col.key })
  return (
    <div ref={setNodeRef} className="rounded-2xl transition-all flex flex-col"
      style={{
        border: isOver ? `2px solid ${col.accent}` : "1px solid #E8E9EF",
        background: isOver ? `${col.accent}08` : "#F9FAFB",
        minHeight: 200,
      }}>
      {children}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function MemberTasksClient({
  tasks: initialTasks,
  todayHours,
  teamMembers = [],
  currentUserId = "",
  projects = [],
}: {
  tasks: Task[]
  todayHours: number
  teamMembers?: { id: string; name: string; employee_id: string }[]
  currentUserId?: string
  projects?: { id: string; business_name: string; client_name: string | null }[]
}) {
  const router = useRouter()

  const [tasks, setTasks]           = useState(initialTasks)
  const [search, setSearch]         = useState("")
  const [filter, setFilter]         = useState("all")
  const [sortBy, setSortBy]         = useState<"priority" | "due_date">("priority")
  const [showAssign, setShowAssign] = useState(false)
  const [assignState, assignAction] = useActionState(createMemberTask, null)

  // Edit task
  const [editTask, setEditTask]         = useState<Task | null>(null)
  const [editLoading, setEditLoading]   = useState(false)
  const [editError, setEditError]       = useState<string | null>(null)

  // Comment panel
  const [commentTaskId, setCommentTaskId]   = useState<string | null>(null)
  const [comments, setComments]             = useState<TaskComment[]>([])
  const [commentText, setCommentText]       = useState("")
  const [commentLoading, setCommentLoading] = useState(false)
  const [commentSending, setCommentSending] = useState(false)
  const [commentError, setCommentError]     = useState<string | null>(null)
  const commentEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (assignState && 'success' in assignState) {
      setShowAssign(false)
      setAssignClientType(""); setAssignBrand(""); setAssignCustom("")
      router.refresh()
    }
  }, [assignState, router])

  // Load comments when panel opens
  useEffect(() => {
    if (!commentTaskId) { setComments([]); setCommentError(null); return }
    setCommentLoading(true)
    setCommentError(null)
    getTaskComments(commentTaskId).then(data => {
      setComments(data)
      setCommentLoading(false)
      setTimeout(() => commentEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    }).catch(() => { setCommentLoading(false); setCommentError("Failed to load comments.") })
  }, [commentTaskId])

  async function sendComment() {
    if (!commentText.trim() || !commentTaskId || commentSending) return
    setCommentSending(true)
    setCommentError(null)
    const res = await addTaskComment(commentTaskId, commentText)
    if (res.success) {
      setCommentText("")
      const updated = await getTaskComments(commentTaskId)
      setComments(updated)
      setTimeout(() => commentEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50)
    } else {
      setCommentError(res.error ?? "Failed to send comment. Run migration 039 in Supabase first.")
    }
    setCommentSending(false)
  }
  const [showSort, setShowSort]             = useState(false)
  const [groupByProject, setGroupByProject] = useState(false)
  const [filterProject, setFilterProject]   = useState("")
  const [showProjectFilter, setShowProjectFilter] = useState(false)
  const [assignClientType, setAssignClientType] = useState("")
  const [assignBrand, setAssignBrand]           = useState("")
  const [assignCustom, setAssignCustom]         = useState("")
  const [deletedProjectIds, setDeletedProjectIds] = useState<Set<string>>(new Set())
  const [activeMobileCol, setActiveMobileCol] = useState<"todo" | "in_progress" | "completed">("todo")
  const [dragId, setDragId]         = useState<string | null>(null)
  const [overCol, setOverCol]       = useState<string | null>(null)
  const [, startTransition]         = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const today = new Date().toISOString().split("T")[0]

  // Productivity stats count only tasks assigned TO me (not tasks I assigned to others)
  const myTasks     = tasks.filter(t => t.assigned_to === currentUserId)
  const total       = myTasks.length
  const doneTasks   = myTasks.filter(t => t.status === "completed")
  const wip         = myTasks.filter(t => t.status === "in_progress")
  const todos       = myTasks.filter(t => t.status === "todo")
  const activeCount = wip.length + todos.length
  const productivity = total > 0 ? Math.round((doneTasks.length / total) * 100) : 0

  const forMeCount     = tasks.filter(t => t.assigned_to === currentUserId && t.created_by === currentUserId).length
  const byOtherCount   = tasks.filter(t => t.assigned_to === currentUserId && t.created_by !== currentUserId).length
  const toOthersCount  = tasks.filter(t => t.created_by === currentUserId && t.assigned_to !== currentUserId).length

  // Tasks due within 7 days (not completed) — only MY tasks
  const dueSoon = myTasks
    .filter(t => t.status !== "completed" && t.due_date)
    .filter(t => {
      const diff = (new Date(t.due_date!).getTime() - Date.now()) / 86400000
      return diff <= 7
    })
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 4)

  function moveTask(id: string, status: "todo" | "in_progress" | "completed") {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
    startTransition(async () => { await updateTaskStatus(id, status) })
  }

  function handleDeleteTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id))
    startTransition(async () => {
      const res = await deleteTask(id)
      if (!res.success) setTasks(initialTasks)
    })
  }

  function handleDeleteQuickProject(id: string) {
    setDeletedProjectIds(prev => new Set([...prev, id]))
    startTransition(async () => {
      const res = await deleteQuickProject(id)
      if (!res.success) setDeletedProjectIds(prev => { const n = new Set(prev); n.delete(id); return n })
    })
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!editTask) return
    setEditLoading(true)
    setEditError(null)
    const fd = new FormData(e.currentTarget)
    const updates = {
      title:       (fd.get("title") as string).trim(),
      description: (fd.get("description") as string)?.trim() || undefined,
      priority:    fd.get("priority") as "low" | "medium" | "high",
      due_date:    (fd.get("due_date") as string) || null,
      assigned_to: (fd.get("assigned_to") as string) || null,
    }
    const res = await updateTask(editTask.id, updates)
    if (res.success) {
      const assignedToUser = updates.assigned_to
        ? (teamMembers.find(m => m.id === updates.assigned_to) ?? null)
        : null
      setTasks(prev => prev.map(t => t.id === editTask.id ? { ...t, ...updates, description: updates.description ?? null, assignedToUser } : t))
      setEditTask(null)
    } else {
      setEditError(res.error ?? "Failed to update task")
    }
    setEditLoading(false)
  }

  function handleFilterChange(key: string) {
    setFilter(key)
    if (key === "todo" || key === "in_progress" || key === "completed") setActiveMobileCol(key)
    // for by_me / by_others keep the current mobile column visible
  }

  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }
  function colTasks(key: "todo" | "in_progress" | "completed") {
    let list = tasks.filter(t => t.status === key)
    if      (filter === "by_other")  list = list.filter(t => t.assigned_to === currentUserId && t.created_by !== currentUserId)
    else if (filter === "to_others") list = list.filter(t => t.created_by === currentUserId && t.assigned_to !== currentUserId)
    else if (filter === "for_me")    list = list.filter(t => t.assigned_to === currentUserId && t.created_by === currentUserId)
    if (filterProject) {
      list = list.filter(t => {
        const proj = Array.isArray(t.projects) ? t.projects[0] : t.projects
        return proj?.id === filterProject
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      const project = (t: Task) => (Array.isArray(t.projects) ? t.projects[0] : t.projects)?.business_name ?? ""
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        project(t).toLowerCase().includes(q)
      )
    }
    if (sortBy === "priority") list = [...list].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    if (sortBy === "due_date") list = [...list].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"))
    return list
  }

  // Drag handlers
  function handleDragStart(e: DragStartEvent) {
    setDragId(String(e.active.id))
  }
  function handleDragOver(e: { over: { id: string } | null }) {
    setOverCol(e.over?.id ?? null)
  }
  function handleDragEnd(e: DragEndEvent) {
    const overId = e.over?.id as string | undefined
    if (overId && (overId === "todo" || overId === "in_progress" || overId === "completed")) {
      const task = tasks.find(t => t.id === e.active.id)
      if (task && task.status !== overId) moveTask(String(e.active.id), overId)
    }
    setDragId(null)
    setOverCol(null)
  }

  const draggedTask = dragId ? tasks.find(t => t.id === dragId) : null

  const STAT_CARDS = [
    { id: "h", label: "Worked Hours", value: todayHours > 0 ? `${todayHours}h` : "—", sub: "Today's work time",   color: "#de1a1a", data: SPARK.hours  },
    { id: "a", label: "Active Tasks",  value: String(activeCount),                     sub: `${wip.length} in progress`, color: "#22C55E", data: SPARK.active },
    { id: "c", label: "Completed",     value: String(doneTasks.length),                sub: "This week",          color: "#6366F1", data: SPARK.done   },
    { id: "p", label: "Productivity",  value: `${productivity}%`,                      sub: "Completion rate",    color: "#F59E0B", data: SPARK.prod   },
  ]

  const FILTER_TABS = [
    { key: "all",        label: "All Tasks",       count: total },
    { key: "by_other",   label: "Assigned to Me",  count: byOtherCount },
    { key: "to_others",  label: "I Assigned",      count: toOthersCount },
    { key: "for_me",     label: "Self-Assigned",   count: forMeCount },
    { key: "todo",        label: "To Do",       count: todos.length },
    { key: "in_progress", label: "In Progress", count: wip.length },
    { key: "completed",   label: "Completed",   count: doneTasks.length },
  ]

  return (
    <>
    <div className="flex" style={{ background: "#F8F9FB", minHeight: "100vh" }}>

      {/* ═══ MAIN ════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-w-0 overflow-auto p-4 md:p-5 xl:p-6">

        {/* ── Hero Banner ── */}
        <div style={{
          background: "linear-gradient(110deg, #DE1A1A 0%, #8B0000 28%, #1A0000 58%, #0D0D0D 100%)",
          borderRadius: 24, marginBottom: 24, position: "relative", overflow: "hidden",
          padding: "0 28px", minHeight: 148, display: "flex", alignItems: "center",
          boxShadow: "0 12px 48px rgba(139,0,0,0.55)", flexWrap: "wrap",
        }}>
          {/* Glows */}
          <div style={{ position: "absolute", top: "50%", left: -50, transform: "translateY(-50%)", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,80,80,0.2) 0%, transparent 65%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "50%", right: -40, transform: "translateY(-50%)", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
          {/* Purple streak accent */}
          <div style={{ position: "absolute", bottom: -30, left: "38%", width: 180, height: 80, borderRadius: "50%", background: "radial-gradient(circle, rgba(155,107,255,0.22) 0%, transparent 70%)", pointerEvents: "none" }} />

          {/* LEFT: badge + title + subtitle */}
          <div style={{ flex: 1, position: "relative", zIndex: 3, paddingTop: 24, paddingBottom: 24 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)", borderRadius: 20, padding: "4px 12px 4px 8px", marginBottom: 10, border: "1px solid rgba(255,255,255,0.25)" }}>
              <span style={{ fontSize: 13 }}>⭐</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: "#FFF", letterSpacing: "0.04em" }}>My Tasks</span>
            </div>
            <h1 style={{ fontSize: 30, fontWeight: 900, margin: "0 0 6px", lineHeight: 1.1, display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ color: "#FFFFFF", textShadow: "0 2px 12px rgba(0,0,0,0.3)" }}>Task</span>
              <span style={{
                background: "linear-gradient(135deg, #FF6B6B 0%, #FFD93D 35%, #6BCB77 65%, #9B6BFF 100%)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>Board</span>
            </h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: 0, fontWeight: 500 }}>
              {activeCount > 0 ? `${activeCount} active · drag cards between columns to update status` : "You're all caught up 🎉"}
            </p>
          </div>

          {/* RIGHT: search + assign + stat pills */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end", position: "relative", zIndex: 3, paddingTop: 20, paddingBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 12, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)" }}>
                <Search size={12} style={{ color: "rgba(255,255,255,0.6)" }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search tasks..."
                  style={{ background: "transparent", outline: "none", fontSize: 12, color: "#FFFFFF", width: 160, border: "none" }}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onFocus={e => (e.target as any).placeholder = ""}
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onBlur={e => (e.target as any).placeholder = "Search tasks..."} />
              </div>
              <button onClick={() => setShowAssign(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 12, background: "rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", border: "1.5px solid rgba(255,255,255,0.35)", color: "#FFFFFF", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>
                <Plus size={13} strokeWidth={3} /> Assign Task
              </button>
            </div>
            {/* Multi-color stat pills */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {[
                { icon: Clock,        color: "#FF6B6B", bg: "rgba(255,107,107,0.18)", val: todayHours > 0 ? `${todayHours}h` : "—", lbl: "Worked"  },
                { icon: Zap,          color: "#6BCB77", bg: "rgba(107,203,119,0.18)", val: String(activeCount),                      lbl: "Active"  },
                { icon: CheckCircle2, color: "#9B6BFF", bg: "rgba(155,107,255,0.18)", val: String(doneTasks.length),                 lbl: "Done"    },
                { icon: TrendingUp,   color: "#FFD93D", bg: "rgba(255,217,61,0.18)",  val: `${productivity}%`,                       lbl: "Rate"    },
              ].map(s => (
                <div key={s.lbl} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 11, background: s.bg, border: `1px solid ${s.color}40` }}>
                  <s.icon size={12} style={{ color: s.color }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 900, color: s.color, margin: 0, lineHeight: 1 }}>{s.val}</p>
                    <p style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", margin: 0 }}>{s.lbl}</p>
                  </div>
                </div>
              ))}
            </div>
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

        {/* ── Filter tabs + sort ── */}
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
          {/* Project filter dropdown */}
          {projects.length > 0 && (
            <div className="relative flex-shrink-0">
              <button onClick={() => setShowProjectFilter(s => !s)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold"
                style={{ background: filterProject ? "#de1a1a" : "#FFFFFF", border: `1px solid ${filterProject ? "#de1a1a" : "#E5E7EB"}`, color: filterProject ? "#FFFFFF" : "#374151" }}>
                <span className="hidden sm:inline">
                  {filterProject ? (projects.find(p => p.id === filterProject)?.business_name ?? "Client") : "All Clients"}
                </span>
                <span className="sm:hidden">Client</span>
                <ChevronDown size={11} />
              </button>
              {showProjectFilter && (
                <div className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-20"
                  style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 8px 24px rgba(0,0,0,0.1)", minWidth: 180 }}>
                  <button onClick={() => { setFilterProject(""); setShowProjectFilter(false) }}
                    className="w-full text-left px-4 py-2.5 text-[12px] font-semibold transition-colors hover:bg-gray-50"
                    style={{ color: !filterProject ? "#de1a1a" : "#374151" }}>
                    All Clients
                  </button>
                  {projects.map(p => (
                    <button key={p.id} onClick={() => { setFilterProject(p.id); setShowProjectFilter(false) }}
                      className="w-full text-left px-4 py-2.5 text-[12px] font-semibold transition-colors hover:bg-gray-50"
                      style={{ color: filterProject === p.id ? "#de1a1a" : "#374151" }}>
                      {p.business_name}{p.client_name ? ` · ${p.client_name}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Group by Project toggle */}
          <button
            onClick={() => setGroupByProject(g => !g)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all"
            style={{
              background: groupByProject ? "#de1a1a" : "#FFFFFF",
              border: `1px solid ${groupByProject ? "#de1a1a" : "#E5E7EB"}`,
              color: groupByProject ? "#FFFFFF" : "#374151",
            }}
            title="Toggle group by project"
          >
            <Layers size={12} />
            <span className="hidden sm:inline">Group by Project</span>
          </button>

          {/* Sort dropdown */}
          <div className="relative flex-shrink-0">
            <button onClick={() => setShowSort(s => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold"
              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", color: "#374151" }}>
              <span className="hidden sm:inline">Sort: {sortBy === "priority" ? "Priority" : "Due Date"}</span>
              <span className="sm:hidden">Sort</span>
              <ChevronDown size={11} />
            </button>
            {showSort && (
              <div className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-20"
                style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 8px 24px rgba(0,0,0,0.1)", minWidth: 140 }}>
                {([
                  { key: "priority" as const, label: "By Priority" },
                  { key: "due_date" as const, label: "By Due Date" },
                ]).map(opt => (
                  <button key={opt.key} onClick={() => { setSortBy(opt.key); setShowSort(false) }}
                    className="w-full text-left px-4 py-2.5 text-[12px] font-semibold transition-colors hover:bg-gray-50"
                    style={{ color: sortBy === opt.key ? "#de1a1a" : "#374151" }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Kanban board ── */}

        {/* Mobile: column tab switcher */}
        {!groupByProject && <div className="md:hidden flex gap-1.5 overflow-x-auto mb-3 pb-1" style={{ scrollbarWidth: "none" }}>
          {KANBAN_COLS.map(col => (
            <button key={col.key} onClick={() => setActiveMobileCol(col.key)}
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
        </div>}

        {/* Mobile: single active column (no dnd) */}
        {!groupByProject && <div className="md:hidden mb-6">
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
                </div>
                <div className="p-3">
                  {list.length === 0 ? (
                    <div className="flex items-center justify-center py-8 rounded-xl"
                      style={{ border: "2px dashed #E5E7EB" }}>
                      <p className="text-[11px]" style={{ color: "#D1D5DB" }}>No tasks</p>
                    </div>
                  ) : (
                    list.map(task => (
                      <TaskCardInner key={task.id} task={task} today={today} onMove={moveTask}
                        currentUserId={currentUserId}
                        onDelete={handleDeleteTask}
                        onComment={id => setCommentTaskId(id)}
                        onEdit={setEditTask} />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>}

        {/* ── Group by Project view (desktop + mobile) ── */}
        {groupByProject && (() => {
          // Collect all filtered tasks across all statuses
          const allFiltered = [
            ...colTasks("todo"),
            ...colTasks("in_progress"),
            ...colTasks("completed"),
          ]
          // Build unique project groups preserving insertion order
          const projectMap = new Map<string, { name: string; tasks: Task[] }>()
          for (const task of allFiltered) {
            const proj = Array.isArray(task.projects) ? task.projects[0] : task.projects
            const key  = proj?.id ?? "__none__"
            const name = proj?.business_name ?? "Internal / No Project"
            if (!projectMap.has(key)) projectMap.set(key, { name, tasks: [] })
            projectMap.get(key)!.tasks.push(task)
          }
          // Sort: named projects first (alphabetically), then "No Project"
          const groups = [...projectMap.entries()]
            .sort(([ka, va], [kb, vb]) => {
              if (ka === "__none__") return 1
              if (kb === "__none__") return -1
              return va.name.localeCompare(vb.name)
            })

          const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
            todo:        { bg: "rgba(107,114,128,0.1)", color: "#6B7280", label: "To Do"       },
            in_progress: { bg: "rgba(245,158,11,0.1)",  color: "#D97706", label: "In Progress" },
            completed:   { bg: "rgba(34,197,94,0.1)",   color: "#16A34A", label: "Completed"   },
          }

          if (groups.length === 0) {
            return (
              <div className="mb-6 flex items-center justify-center py-16 rounded-2xl"
                style={{ border: "2px dashed #E5E7EB" }}>
                <p className="text-[13px]" style={{ color: "#D1D5DB" }}>No tasks match the current filter</p>
              </div>
            )
          }

          return (
            <div className="mb-6 space-y-5">
              {groups.map(([key, group]) => {
                const countByStatus = {
                  todo:        group.tasks.filter(t => t.status === "todo").length,
                  in_progress: group.tasks.filter(t => t.status === "in_progress").length,
                  completed:   group.tasks.filter(t => t.status === "completed").length,
                }
                return (
                  <div key={key} className="rounded-2xl overflow-hidden"
                    style={{ border: "1px solid #E8E9EF", background: "#FFFFFF" }}>
                    {/* Section header */}
                    <div className="flex items-center gap-3 px-5 py-3.5"
                      style={{ background: "linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 100%)", borderBottom: "1px solid #E8E9EF" }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: key === "__none__" ? "rgba(107,114,128,0.1)" : "rgba(222,26,26,0.1)" }}>
                        <Layers size={13} style={{ color: key === "__none__" ? "#6B7280" : "#de1a1a" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-black truncate" style={{ color: "#111111" }}>{group.name}</p>
                        <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{group.tasks.length} task{group.tasks.length !== 1 ? "s" : ""}</p>
                      </div>
                      {/* Status summary badges */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {(["todo", "in_progress", "completed"] as const).map(s => {
                          const cnt = countByStatus[s]
                          if (cnt === 0) return null
                          const sb = STATUS_BADGE[s]
                          return (
                            <span key={s} className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: sb.bg, color: sb.color }}>
                              {sb.label} {cnt}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                    {/* Task grid */}
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.tasks.map(task => (
                        <TaskCardInner
                          key={task.id}
                          task={task}
                          today={today}
                          onMove={moveTask}
                          currentUserId={currentUserId}
                          onDelete={handleDeleteTask}
                          onComment={id => setCommentTaskId(id)}
                          onEdit={setEditTask}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Desktop: DnD Kanban 3-column grid */}
        {!groupByProject && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver as never} onDragEnd={handleDragEnd}>
          <div className="hidden md:grid grid-cols-3 gap-4 mb-6">
            {KANBAN_COLS.map(col => {
              const list   = colTasks(col.key)
              const hidden = filter !== "all" && filter !== "todo" && filter !== "in_progress" && filter !== "completed" && list.length === 0
              if (hidden) return null
              return (
                <div key={col.key} className="transition-all">
                  <DroppableColumn col={col} isOver={overCol === col.key}>
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
                      <span className="text-[9px] font-medium px-2 py-0.5 rounded-full"
                        style={{ background: `${col.accent}10`, color: col.accent }}>
                        drop cards here
                      </span>
                    </div>
                    {/* Task list */}
                    <div className="p-3 flex-1">
                      {list.length === 0 ? (
                        <div className="flex items-center justify-center py-8 rounded-xl transition-all"
                          style={{ border: `2px dashed ${overCol === col.key ? col.accent : "#E5E7EB"}` }}>
                          <p className="text-[11px]" style={{ color: overCol === col.key ? col.accent : "#D1D5DB" }}>
                            {overCol === col.key ? "Drop here" : "No tasks"}
                          </p>
                        </div>
                      ) : (
                        list.map(task => (
                          <DraggableCard key={task.id} task={task} today={today} onMove={moveTask}
                            isDragging={dragId === task.id}
                            currentUserId={currentUserId}
                            onDelete={handleDeleteTask}
                            onComment={id => setCommentTaskId(id)}
                            onEdit={setEditTask} />
                        ))
                      )}
                    </div>
                  </DroppableColumn>
                </div>
              )
            })}
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {draggedTask ? (
              <div style={{ width: 260, opacity: 0.95, transform: "rotate(2deg)" }}>
                <TaskCardInner task={draggedTask} today={today} onMove={() => {}} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        )}

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
            {/* Task progress bars */}
            <div className="space-y-2.5 mb-4">
              {[
                { label: "Completed", val: doneTasks.length, total, color: "#22C55E" },
                { label: "In Progress", val: wip.length, total, color: "#F59E0B" },
                { label: "To Do", val: todos.length, total, color: "#6B7280" },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold" style={{ color: "#374151" }}>{row.label}</span>
                    <span className="text-[10px] font-bold" style={{ color: row.color }}>
                      {row.val} / {row.total}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${row.total > 0 ? (row.val / row.total) * 100 : 0}%`, background: row.color }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
              {productivity >= 80
                ? "Excellent work! You're crushing your tasks 🔥"
                : productivity >= 50
                  ? "Good progress — keep the momentum going!"
                  : activeCount > 0
                    ? `${activeCount} tasks waiting for you. Let's get started!`
                    : "All tasks are assigned to you — time to get started!"}
            </p>
          </div>

          {/* Dynamic Workflow Timeline */}
          <div className="rounded-2xl p-5"
            style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <h3 className="text-[14px] font-black mb-4" style={{ color: "#111111" }}>Workflow Timeline</h3>
            <WorkflowTimeline total={total} inProgress={wip.length} completed={doneTasks.length} />
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "To Do",       val: todos.length,      color: "#6B7280", bg: "rgba(107,114,128,0.08)" },
                { label: "In Progress", val: wip.length,        color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
                { label: "Completed",   val: doneTasks.length,  color: "#22C55E", bg: "rgba(34,197,94,0.08)" },
              ].map(s => (
                <div key={s.label} className="rounded-xl px-3 py-2.5 text-center"
                  style={{ background: s.bg }}>
                  <p className="text-[18px] font-black leading-none mb-0.5" style={{ color: s.color }}>{s.val}</p>
                  <p className="text-[9px] font-semibold" style={{ color: s.color }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ═══ RIGHT SIDEBAR ════════════════════════════════════════════════════ */}
      <div className="hidden xl:flex flex-col w-[260px] flex-shrink-0 gap-4 p-4 overflow-y-auto"
        style={{ borderLeft: "1px solid #E8E9EF", background: "#FAFAFA", position: "sticky", top: 0, maxHeight: "100vh" }}>

        {/* Daily Focus + Streak */}
        <div className="rounded-2xl p-4"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <p className="text-[13px] font-black mb-0.5" style={{ color: "#111111" }}>Daily Focus</p>
          <p className="text-[11px] mb-2.5" style={{ color: "#6B7280" }}>
            {doneTasks.length > 0
              ? <>You&apos;ve completed <span className="font-bold" style={{ color: "#22C55E" }}>{doneTasks.length}</span> task{doneTasks.length > 1 ? "s" : ""} today!</>
              : <>You have <span className="font-bold" style={{ color: "#de1a1a" }}>{activeCount}</span> task{activeCount !== 1 ? "s" : ""} to tackle today.</>
            }
          </p>
          <div className="flex items-center gap-0.5 mb-3">
            {[...Array(Math.min(doneTasks.length + wip.length, 7))].map((_, i) => (
              <Flame key={i} size={18} style={{ color: i < doneTasks.length ? "#F59E0B" : "#E5E7EB" }} />
            ))}
            {Array.from({ length: Math.max(0, 7 - Math.min(doneTasks.length + wip.length, 7)) }).map((_, i) => (
              <Flame key={i} size={18} style={{ color: "#E5E7EB" }} />
            ))}
          </div>
          <div className="flex items-center gap-2 pt-3" style={{ borderTop: "1px solid #F3F4F6" }}>
            <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(222,26,26,0.1)" }}>
              <Target size={13} style={{ color: "#de1a1a" }} />
            </div>
            <div>
              <p className="text-[11px] font-bold" style={{ color: "#111111" }}>Today&apos;s Goal</p>
              <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                {todos.length > 0 ? `Complete ${Math.min(3, todos.length)} more tasks` : "All caught up!"}
              </p>
            </div>
          </div>
        </div>

        {/* Due Soon */}
        <div className="rounded-2xl p-4"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-black" style={{ color: "#111111" }}>Due Soon</p>
            {dueSoon.length > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                {dueSoon.length}
              </span>
            )}
          </div>
          {dueSoon.length === 0 ? (
            <p className="text-[11px] text-center py-3" style={{ color: "#D1D5DB" }}>No upcoming deadlines</p>
          ) : (
            <div className="space-y-2">
              {dueSoon.map(task => {
                const daysLeft = Math.ceil((new Date(task.due_date!).getTime() - Date.now()) / 86400000)
                const overdue = daysLeft < 0
                return (
                  <div key={task.id} className="flex items-start gap-2 p-2.5 rounded-xl"
                    style={{ background: overdue ? "rgba(222,26,26,0.05)" : "#F9FAFB" }}>
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: overdue ? "#de1a1a" : daysLeft <= 2 ? "#F59E0B" : "#22C55E" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate" style={{ color: "#111111" }}>{task.title}</p>
                      <p className="text-[10px]" style={{ color: overdue ? "#de1a1a" : "#9CA3AF" }}>
                        {overdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Productivity Heatmap */}
        <div className="rounded-2xl p-4"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <p className="text-[13px] font-black mb-1" style={{ color: "#111111" }}>Activity This Week</p>
          <p className="text-[10px] mb-3" style={{ color: "#9CA3AF" }}>Task engagement heatmap</p>
          <HeatMap tasks={tasks} />
        </div>

      </div>
    </div>

    {/* ── Comment Panel ────────────────────────────────────────────────────── */}
    {commentTaskId && (
      <>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={() => { setCommentTaskId(null); setCommentText("") }} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div style={{ width: "100%", maxWidth: 480, maxHeight: "82vh", background: "#fff", borderRadius: 20, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.22)", border: "1px solid rgba(222,26,26,0.1)" }}>

            {/* Header */}
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MessageSquare size={14} style={{ color: "#6366F1" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tasks.find(t => t.id === commentTaskId)?.title ?? "Task"}
                </p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Comments & Updates</p>
              </div>
              <button onClick={() => { setCommentTaskId(null); setCommentText("") }}
                style={{ width: 28, height: 28, borderRadius: "50%", background: "#F5F6FA", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <X size={12} style={{ color: "#6B7280" }} />
              </button>
            </div>

            {/* Comment list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
              {commentLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
                  <Loader2 size={20} style={{ color: "#9CA3AF", animation: "spin 1s linear infinite" }} />
                </div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px 0" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#374151", margin: "0 0 4px" }}>No comments yet</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Be the first to add a comment or update!</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {comments.map(c => {
                    const initials = c.user.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
                    return (
                      <div key={c.id} style={{ display: "flex", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #DE1A1A, #7F1D1D)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 11, fontWeight: 900, color: "#fff" }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1, background: "#F9FAFB", borderRadius: 12, padding: "9px 13px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{c.user.name}</span>
                            <span style={{ fontSize: 10, color: "#9CA3AF" }}>{timeAgo(c.created_at)}</span>
                          </div>
                          <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.55, margin: 0, wordBreak: "break-word" }}>{c.comment}</p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={commentEndRef} />
                </div>
              )}
            </div>

            {/* Input */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid #F3F4F6" }}>
              {commentError && (
                <p style={{ fontSize: 11, fontWeight: 600, color: "#DE1A1A", margin: "0 0 8px", padding: "7px 12px", background: "rgba(222,26,26,0.06)", borderRadius: 8 }}>
                  {commentError}
                </p>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={commentText}
                  onChange={e => { setCommentText(e.target.value); setCommentError(null) }}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment() } }}
                  placeholder="Write a comment or update..."
                  style={{ flex: 1, padding: "9px 14px", borderRadius: 12, border: "1.5px solid #EBEDF2", fontSize: 13, outline: "none", color: "#111" }}
                />
                <button onClick={sendComment} disabled={commentSending || !commentText.trim()}
                  style={{ padding: "9px 14px", borderRadius: 12, border: "none", cursor: commentText.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", background: commentText.trim() ? "linear-gradient(135deg, #DE1A1A, #7F1D1D)" : "#F3F4F6", transition: "background 0.2s" }}>
                  {commentSending
                    ? <Loader2 size={15} style={{ color: commentText.trim() ? "#fff" : "#9CA3AF", animation: "spin 1s linear infinite" }} />
                    : <Send size={15} style={{ color: commentText.trim() ? "#fff" : "#9CA3AF" }} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )}

    {/* ── Edit Task Modal ───────────────────────────────────────────────────── */}
    {editTask && (
      <>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => { setEditTask(null); setEditError(null) }} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[440px] rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: "#FFFFFF", border: "1px solid rgba(16,185,129,0.2)" }}>

            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid #E5E7EB", background: "rgba(16,185,129,0.03)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Pencil size={14} style={{ color: "#10B981" }} />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold" style={{ color: "#111111", margin: 0 }}>Edit Task</h2>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Only you (the creator) can edit this</p>
                </div>
              </div>
              <button onClick={() => { setEditTask(null); setEditError(null) }}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ border: "1px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer" }}>
                <X size={14} style={{ color: "#6B7280" }} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Title *</label>
                <input name="title" required defaultValue={editTask.title}
                  className="w-full px-3 py-2 rounded-xl text-[13px]"
                  style={{ border: "1.5px solid #EBEDF2", outline: "none" }} />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Description</label>
                <textarea name="description" rows={2} defaultValue={editTask.description ?? ""}
                  placeholder="Details…"
                  className="w-full px-3 py-2 rounded-xl text-[13px] resize-none"
                  style={{ border: "1.5px solid #EBEDF2", outline: "none" }} />
              </div>

              {/* Priority + Due date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Priority</label>
                  <select name="priority" defaultValue={editTask.priority}
                    className="w-full px-3 py-2 rounded-xl text-[13px]"
                    style={{ border: "1.5px solid #EBEDF2", outline: "none" }}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Due Date</label>
                  <input type="date" name="due_date" defaultValue={editTask.due_date ?? ""}
                    className="w-full px-3 py-2 rounded-xl text-[13px]"
                    style={{ border: "1.5px solid #EBEDF2", outline: "none", colorScheme: "light" }} />
                </div>
              </div>

              {/* Assigned to */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                  <User size={9} className="inline mr-1" />Assigned To
                </label>
                <select name="assigned_to" defaultValue={editTask.assigned_to ?? currentUserId}
                  className="w-full px-3 py-2 rounded-xl text-[13px]"
                  style={{ border: "1.5px solid #EBEDF2", outline: "none" }}>
                  <option value={currentUserId}>Myself</option>
                  {teamMembers.filter(m => m.id !== currentUserId).map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.employee_id})</option>
                  ))}
                </select>
              </div>

              {editError && (
                <p className="text-[12px] px-3 py-2 rounded-lg"
                  style={{ background: "rgba(222,26,26,0.06)", color: "#de1a1a" }}>
                  {editError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => { setEditTask(null); setEditError(null) }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#6B7280", cursor: "pointer" }}>
                  Cancel
                </button>
                <button type="submit" disabled={editLoading}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #10B981, #059669)", cursor: editLoading ? "default" : "pointer", opacity: editLoading ? 0.7 : 1 }}>
                  {editLoading ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Pencil size={13} />}
                  {editLoading ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </>
    )}

    {/* ── Assign Task Modal ─────────────────────────────────────────────────── */}
    {showAssign && (
      <>
        <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowAssign(false)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-[420px] rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: "#FFFFFF", border: "1px solid rgba(222,26,26,0.15)" }}>
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid #E5E7EB" }}>
              <h2 className="text-[16px] font-bold" style={{ color: "#111111" }}>Assign a Task</h2>
              <button onClick={() => setShowAssign(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ border: "1px solid #E5E7EB" }}>
                <X size={14} style={{ color: "#6B7280" }} />
              </button>
            </div>
            <form action={assignAction} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Title *</label>
                <input name="title" required placeholder="What needs to be done?"
                  className="w-full px-3 py-2 rounded-xl text-[13px]"
                  style={{ border: "1.5px solid #EBEDF2", outline: "none" }} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Description</label>
                <textarea name="description" rows={2} placeholder="Details…"
                  className="w-full px-3 py-2 rounded-xl text-[13px] resize-none"
                  style={{ border: "1.5px solid #EBEDF2", outline: "none" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Priority</label>
                  <select name="priority" className="w-full px-3 py-2 rounded-xl text-[13px]"
                    style={{ border: "1.5px solid #EBEDF2", outline: "none" }}>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Due Date</label>
                  <input type="date" name="due_date" min={today} className="w-full px-3 py-2 rounded-xl text-[13px]"
                    style={{ border: "1.5px solid #EBEDF2", outline: "none", colorScheme: "light" }} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>
                  <User size={9} className="inline mr-1" />Assign To
                </label>
                <select name="assigned_to" className="w-full px-3 py-2 rounded-xl text-[13px]"
                  style={{ border: "1.5px solid #EBEDF2", outline: "none" }}>
                  <option value={currentUserId}>Myself</option>
                  {teamMembers.filter(m => m.id !== currentUserId).map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.employee_id})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#6B7280" }}>Client / Project</label>
                {/* Hidden fields consumed by createMemberTask */}
                <input type="hidden" name="project_id"
                  value={assignClientType && assignClientType !== "Promotion" && assignClientType !== "__custom__" ? assignClientType : ""} />
                <input type="hidden" name="promotion_name"
                  value={assignClientType === "Promotion" ? (assignBrand || "") : assignClientType === "__custom__" ? assignCustom : ""} />
                <input type="hidden" name="shop_name" value="" />
                {/* Main dropdown — same style as daily update */}
                <div style={{ position: "relative" }}>
                  <select
                    value={assignClientType}
                    onChange={e => { setAssignClientType(e.target.value); setAssignBrand(""); setAssignCustom("") }}
                    className="w-full px-3 py-2 rounded-xl text-[13px]"
                    style={{ border: "1.5px solid #EBEDF2", outline: "none", appearance: "none", paddingRight: 28 }}>
                    <option value="">Add client / project…</option>
                    {projects
                      .filter(p => p.client_name !== "__member_quick__" && !deletedProjectIds.has(p.id))
                      .map(p => <option key={p.id} value={p.id}>{p.business_name}</option>)}
                    <option value="__custom__">✏️ Other (type manually)</option>
                  </select>
                  <ChevronDown size={11} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
                </div>
                {/* Other → custom text */}
                {assignClientType === "__custom__" && (
                  <input
                    value={assignCustom}
                    onChange={e => setAssignCustom(e.target.value)}
                    placeholder="Type client name…"
                    className="w-full px-3 py-2 rounded-xl text-[13px] mt-1.5"
                    style={{ border: "1.5px solid #EBEDF2", outline: "none" }} />
                )}
              </div>
              {assignState && "error" in assignState && (
                <p className="text-[12px] px-3 py-2 rounded-lg"
                  style={{ background: "rgba(222,26,26,0.06)", color: "#de1a1a" }}>
                  {assignState.error}
                </p>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAssign(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#6B7280" }}>
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg, #DE1A1A, #7F1D1D)" }}>
                  Assign
                </button>
              </div>
            </form>
          </div>
        </div>
      </>
    )}
    </>
  )
}
