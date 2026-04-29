"use client"

import { useState, useMemo, useTransition } from "react"
import {
  Search, Plus, FolderOpen, CheckCircle2, Clock, PauseCircle,
  MoreVertical, MapPin, CalendarDays, X, Pencil, Trash2,
  Loader2, User, Briefcase, ChevronDown, Target, AlertTriangle,
} from "lucide-react"
import { createProject, updateProject, deleteProject } from "@/lib/actions/projects"

export const SERVICES = [
  "Performance Marketing", "Google Ads & SEO", "Personal Branding", "Video Editing",
  "Business Consulting", "LinkedIn Personal Branding", "Social Media Management",
  "Social Media Promotion", "Email Marketing", "SAAS Tool",
  "Customized Software Development", "Website Development", "E-Commerce Website",
  "Landing Page Designing", "AI Chatbot", "Poster Designing",
  "Google My Business Optimization", "Professional RJ Voice Over",
  "Advertisement Shoot", "Drone Shooting",
] as const

interface Project {
  id: string
  business_name: string
  client_name: string
  location: string | null
  service_types: string[]
  status: "active" | "completed" | "on_hold"
  deadline: string | null
  progress_pct: number
  created_at: string
}

interface TaskStats { total: number; completed: number; active: number }

const STATUS_CONFIG = {
  active:    { label: "Active",    color: "#A3E635", bg: "rgba(163,230,53,0.1)",  border: "rgba(163,230,53,0.2)",  dot: "#A3E635",  icon: Clock },
  completed: { label: "Completed", color: "#FFFFFF", bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.1)", dot: "rgba(255,255,255,0.4)", icon: CheckCircle2 },
  on_hold:   { label: "On Hold",   color: "#F59E0B", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.2)", dot: "#F59E0B",  icon: PauseCircle },
}

const inputStyle: React.CSSProperties = {
  background: "#1A1A1A", border: "1px solid #2E2E2E", color: "#FFFFFF",
  borderRadius: "10px", padding: "10px 14px", fontSize: "13px",
  outline: "none", width: "100%", fontFamily: "inherit", colorScheme: "dark",
}

function formatDate(s: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

function isOverdue(deadline: string | null, status: string) {
  if (!deadline || status === "completed") return false
  return new Date(deadline) < new Date()
}

// ── Project Sheet ─────────────────────────────────────────────────────────────

const EMPTY = {
  business_name: "", client_name: "", location: "",
  service_types: [] as string[], status: "active" as const,
  deadline: "", progress_pct: 0,
}

function ProjectSheet({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project | null }) {
  const isEdit = !!project
  const [form, setForm] = useState(project ? {
    business_name: project.business_name, client_name: project.client_name,
    location: project.location ?? "", service_types: project.service_types ?? [],
    status: project.status, deadline: project.deadline ?? "", progress_pct: project.progress_pct,
  } : EMPTY)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }))

  function toggleService(s: string) {
    setForm((p) => ({
      ...p,
      service_types: p.service_types.includes(s)
        ? p.service_types.filter((x) => x !== s)
        : [...p.service_types, s],
    }))
  }

  function handleSubmit() {
    if (!form.business_name.trim()) { setError("Business name is required"); return }
    if (!form.client_name.trim()) { setError("Client name is required"); return }
    setError("")
    startTransition(async () => {
      const payload = { ...form, deadline: form.deadline || null, progress_pct: Number(form.progress_pct) }
      const result = isEdit ? await updateProject({ id: project!.id, ...payload }) : await createProject(payload)
      if (result.success) onClose()
      else setError(result.error ?? "Something went wrong")
    })
  }

  if (!open) return null

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "10px", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.16em",
    marginBottom: "8px", color: "rgba(255,255,255,0.3)",
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[440px] z-50 flex flex-col"
        style={{ background: "#0D0D0D", borderLeft: "1px solid #1A1A1A" }}>
        <style>{`.ps-input::placeholder{color:rgba(255,255,255,0.2)}.ps-input:focus{border-color:rgba(163,230,53,0.4)!important}`}</style>

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid #1A1A1A" }}>
          <div>
            <h2 className="text-[17px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
              {isEdit ? "Edit Client" : "Add New Client"}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              {isEdit ? "Update client details" : "Create and track a new client engagement"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ background: "#1A1A1A" }}>
            <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <div>
            <label style={labelStyle}>
              Services {form.service_types.length > 0 && <span style={{ color: "#A3E635" }}>({form.service_types.length} selected)</span>}
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
              {SERVICES.map((s) => {
                const active = form.service_types.includes(s)
                return (
                  <button key={s} type="button" onClick={() => toggleService(s)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all border"
                    style={active
                      ? { background: "rgba(163,230,53,0.1)", borderColor: "rgba(163,230,53,0.3)", color: "#A3E635" }
                      : { background: "#1A1A1A", borderColor: "#2E2E2E", color: "rgba(255,255,255,0.4)" }
                    }>
                    {active && "✓ "}{s}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Business Name *</label>
            <input value={form.business_name} onChange={set("business_name")}
              placeholder="e.g. Krishna Saree House" className="ps-input" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Client Name *</label>
            <input value={form.client_name} onChange={set("client_name")}
              placeholder="e.g. Ravi Kumar" className="ps-input" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Location</label>
            <input value={form.location} onChange={set("location")}
              placeholder="e.g. T. Nagar, Chennai" className="ps-input" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Status</label>
            <div className="flex gap-2">
              {(["active", "on_hold", "completed"] as const).map((s) => {
                const cfg = STATUS_CONFIG[s]
                const isActive = form.status === s
                return (
                  <button key={s} type="button" onClick={() => setForm((p) => ({ ...p, status: s }))}
                    className="flex-1 py-2.5 rounded-lg text-[12px] font-bold transition-all"
                    style={isActive
                      ? { background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }
                      : { background: "#1A1A1A", border: "1px solid #2E2E2E", color: "rgba(255,255,255,0.35)" }
                    }>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Deadline</label>
            <input type="date" value={form.deadline} onChange={set("deadline")}
              className="ps-input" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Progress — {form.progress_pct}%</label>
            <input type="range" min={0} max={100} step={5}
              value={form.progress_pct}
              onChange={(e) => setForm((p) => ({ ...p, progress_pct: Number(e.target.value) }))}
              className="w-full" style={{ accentColor: "#A3E635" }} />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.25)" }}>
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          {error && (
            <p className="text-[12px] px-4 py-3 rounded-lg" style={{ background: "rgba(255,107,87,0.07)", color: "#FF6B57", border: "1px solid rgba(255,107,87,0.18)" }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-3 flex-shrink-0" style={{ borderTop: "1px solid #1A1A1A" }}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-lg text-[13px] font-semibold"
            style={{ background: "#1A1A1A", border: "1px solid #2E2E2E", color: "rgba(255,255,255,0.5)" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isPending}
            className="flex-1 py-3 rounded-lg text-[13px] font-bold flex items-center justify-center gap-2"
            style={{ background: "#A3E635", color: "#0D0D0D", opacity: isPending ? 0.65 : 1 }}>
            {isPending && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Add Client"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Delete Confirm ─────────────────────────────────────────────────────────────

function DeleteConfirm({ project, onCancel }: { project: Project; onCancel: () => void }) {
  const [isPending, startTransition] = useTransition()
  function handleDelete() {
    startTransition(async () => {
      await deleteProject(project.id)
      onCancel()
    })
  }
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="rounded-xl p-6 w-full max-w-sm" style={{ background: "#0D0D0D", border: "1px solid #2A2A2A" }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
            style={{ background: "rgba(255,107,87,0.1)" }}>
            <Trash2 size={16} style={{ color: "#FF6B57" }} />
          </div>
          <h3 className="text-[16px] font-black mb-1" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>Delete Client?</h3>
          <p className="text-[13px] mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span style={{ color: "#FFFFFF", fontWeight: 600 }}>{project.business_name}</span> will be permanently removed. This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold"
              style={{ background: "#1A1A1A", border: "1px solid #2E2E2E", color: "rgba(255,255,255,0.5)" }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={isPending}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-bold flex items-center justify-center gap-2"
              style={{ background: "rgba(255,107,87,0.15)", border: "1px solid rgba(255,107,87,0.3)", color: "#FF6B57", opacity: isPending ? 0.65 : 1 }}>
              {isPending && <Loader2 size={12} className="animate-spin" />}
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ProjectsClient({
  projects,
  taskStats = {},
}: {
  projects: Project[]
  taskStats?: Record<string, TaskStats>
}) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<"ALL" | "active" | "completed" | "on_hold">("ALL")
  const [serviceFilter, setServiceFilter] = useState("")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return projects.filter((p) => {
      const matchSearch = !q || p.business_name.toLowerCase().includes(q) || p.client_name.toLowerCase().includes(q) || (p.location ?? "").toLowerCase().includes(q)
      const matchStatus = statusFilter === "ALL" || p.status === statusFilter
      const matchService = !serviceFilter || (p.service_types ?? []).includes(serviceFilter)
      return matchSearch && matchStatus && matchService
    })
  }, [search, statusFilter, serviceFilter, projects])

  const stats = {
    total: projects.length,
    active: projects.filter((p) => p.status === "active").length,
    completed: projects.filter((p) => p.status === "completed").length,
    on_hold: projects.filter((p) => p.status === "on_hold").length,
  }

  return (
    <div className="p-8 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>Clients</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>Track and manage all client engagements.</p>
        </div>
        <button
          onClick={() => { setEditProject(null); setSheetOpen(true) }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-bold transition-all"
          style={{ background: "#A3E635", color: "#0D0D0D" }}>
          <Plus size={15} /> Add Client
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Clients", value: stats.total,     color: "#FFFFFF",  bg: "#262626",                  border: "#2A2A2A",                   icon: FolderOpen },
          { label: "Active",        value: stats.active,    color: "#A3E635",  bg: "rgba(163,230,53,0.05)",     border: "rgba(163,230,53,0.15)",     icon: Clock },
          { label: "Completed",     value: stats.completed, color: "rgba(255,255,255,0.5)", bg: "#262626", border: "#2A2A2A", icon: CheckCircle2 },
          { label: "On Hold",       value: stats.on_hold,   color: "#F59E0B",  bg: "rgba(245,158,11,0.05)",     border: "rgba(245,158,11,0.15)",     icon: PauseCircle },
        ].map(({ label, value, color, bg, border, icon: Icon }) => (
          <div key={label} className="rounded-xl p-5 flex items-center gap-4"
            style={{ background: bg, border: `1px solid ${border}` }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <Icon size={15} style={{ color }} />
            </div>
            <div>
              <p className="text-[28px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</p>
              <p className="text-[11px] font-medium mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-[280px]">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.25)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client or business…"
            className="w-full pl-9 pr-4 py-2.5 rounded-lg text-[13px] outline-none"
            style={{ background: "#262626", border: "1px solid #2A2A2A", color: "#FFFFFF" }} />
        </div>
        <div className="relative">
          <Briefcase size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.25)" }} />
          <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)}
            className="appearance-none pl-8 pr-8 py-2.5 rounded-lg text-[12px] outline-none min-w-[190px]"
            style={{ background: "#262626", border: "1px solid #2A2A2A", color: "#FFFFFF", colorScheme: "dark" }}>
            <option value="">All Services</option>
            {SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.25)" }} />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          {(["ALL", "active", "on_hold", "completed"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all"
              style={statusFilter === s
                ? { background: "#A3E635", color: "#0D0D0D" }
                : { color: "rgba(255,255,255,0.4)" }
              }>
              {s === "ALL" ? "All" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          {filtered.length} of {projects.length}
        </span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-xl"
          style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <FolderOpen size={36} style={{ color: "rgba(255,255,255,0.08)" }} className="mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: "rgba(255,255,255,0.3)" }}>
            {projects.length === 0 ? "No clients yet" : "No clients match your filter"}
          </p>
          {projects.length === 0 && (
            <button onClick={() => { setEditProject(null); setSheetOpen(true) }}
              className="mt-5 px-5 py-2.5 rounded-lg text-[13px] font-bold"
              style={{ background: "#A3E635", color: "#0D0D0D" }}>
              Add First Client
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((project) => {
            const cfg = STATUS_CONFIG[project.status]
            const overdue = isOverdue(project.deadline, project.status)
            const ts = taskStats[project.id]
            const taskProgress = ts && ts.total > 0 ? Math.round((ts.completed / ts.total) * 100) : null

            return (
              <div key={project.id} className="rounded-xl p-5 flex flex-col gap-4 transition-all hover:-translate-y-0.5"
                style={{ background: "#262626", border: `1px solid ${overdue ? "rgba(255,107,87,0.25)" : "#2A2A2A"}` }}>

                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                        {cfg.label}
                      </span>
                      {overdue && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,107,87,0.1)", color: "#FF6B57" }}>
                          <AlertTriangle size={9} /> Overdue
                        </span>
                      )}
                    </div>
                    <h3 className="text-[15px] font-black leading-snug truncate" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
                      {project.business_name}
                    </h3>
                    {project.service_types?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {project.service_types.slice(0, 2).map((s) => (
                          <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(163,230,53,0.07)", color: "#A3E635" }}>
                            {s}
                          </span>
                        ))}
                        {project.service_types.length > 2 && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}>
                            +{project.service_types.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative ml-2 flex-shrink-0">
                    <button onClick={() => setOpenDropdown(openDropdown === project.id ? null : project.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                      style={{ background: "rgba(255,255,255,0.04)" }}>
                      <MoreVertical size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
                    </button>
                    {openDropdown === project.id && (
                      <div className="absolute right-0 top-9 w-36 rounded-xl overflow-hidden py-1 z-20"
                        style={{ background: "#0D0D0D", border: "1px solid #2A2A2A", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
                        <button onClick={() => { setEditProject(project); setSheetOpen(true); setOpenDropdown(null) }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all hover:bg-white/[0.04]"
                          style={{ color: "rgba(255,255,255,0.7)" }}>
                          <Pencil size={12} /> Edit
                        </button>
                        <button onClick={() => { setDeleteTarget(project); setOpenDropdown(null) }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all hover:bg-red-500/10"
                          style={{ color: "#FF6B57" }}>
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Client & Location */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <User size={11} style={{ color: "rgba(255,255,255,0.25)" }} />
                    <span className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.55)" }}>{project.client_name}</span>
                  </div>
                  {project.location && (
                    <div className="flex items-center gap-2">
                      <MapPin size={11} style={{ color: "rgba(255,255,255,0.25)" }} />
                      <span className="text-[12px] truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{project.location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <CalendarDays size={11} style={{ color: "rgba(255,255,255,0.25)" }} />
                    <span className={`text-[12px] ${overdue ? "font-semibold" : ""}`}
                      style={{ color: overdue ? "#FF6B57" : "rgba(255,255,255,0.4)" }}>
                      {formatDate(project.deadline)}
                    </span>
                  </div>
                </div>

                {/* Task stats */}
                {ts && (
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.03)" }}>
                    <Target size={11} style={{ color: "#A3E635" }} />
                    <span className="text-[11px] font-semibold" style={{ color: "#A3E635" }}>{ts.active} active</span>
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>·</span>
                    <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>{ts.completed}/{ts.total} done</span>
                  </div>
                )}

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.25)" }}>
                      {taskProgress != null ? "Task Progress" : "Progress"}
                    </span>
                    <span className="text-[12px] font-bold" style={{ color: "#FFFFFF" }}>
                      {taskProgress != null ? `${taskProgress}%` : `${project.progress_pct}%`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#1A1A1A" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${taskProgress ?? project.progress_pct}%`,
                        background: project.status === "completed" ? "#A3E635" : project.status === "on_hold" ? "#F59E0B" : "#A3E635",
                      }}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {openDropdown && <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />}
      <ProjectSheet key={editProject?.id ?? "add"} open={sheetOpen} onClose={() => setSheetOpen(false)} project={editProject} />
      {deleteTarget && <DeleteConfirm project={deleteTarget} onCancel={() => setDeleteTarget(null)} />}
    </div>
  )
}
