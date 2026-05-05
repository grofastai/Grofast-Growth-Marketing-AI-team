"use client"

import { useState, useMemo, useTransition } from "react"
import Link from "next/link"
import {
  Search, Plus, FolderOpen, CheckCircle2, Clock, PauseCircle,
  MoreVertical, MapPin, X, Pencil, Trash2, Loader2, User,
  Briefcase, ChevronDown, Target, ArrowRight, Package, CalendarRange,
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
  package_name: string | null
  start_month: string | null
  end_month: string | null
  progress_pct: number
  created_at: string
}

interface TaskStats { total: number; completed: number; active: number }

const STATUS_CONFIG = {
  active:    { label: "Active",    color: "#DC2626", bg: "rgba(220,38,38,0.1)",  border: "rgba(220,38,38,0.2)",  dot: "#DC2626",  icon: Clock },
  completed: { label: "Completed", color: "#16A34A", bg: "rgba(22,163,74,0.1)",  border: "rgba(22,163,74,0.2)",  dot: "#16A34A",  icon: CheckCircle2 },
  on_hold:   { label: "On Hold",   color: "#F59E0B", bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.2)", dot: "#F59E0B",  icon: PauseCircle },
}

const inputStyle: React.CSSProperties = {
  background: "#F8F9FA", border: "1px solid #2E2E2E", color: "#111111",
  borderRadius: "10px", padding: "10px 14px", fontSize: "13px",
  outline: "none", width: "100%", fontFamily: "inherit", colorScheme: "dark",
}

// "2025-03-01" → "2025-03" for <input type="month">
function dateToMonth(d: string | null): string {
  if (!d) return ""
  return d.slice(0, 7)
}

// "2025-03-01" → "Mar 2025"
function fmtMonth(d: string | null): string {
  if (!d) return "—"
  const [y, m] = d.split("-")
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return `${months[parseInt(m) - 1]} ${y}`
}

const EMPTY = {
  business_name: "", client_name: "", location: "",
  service_types: [] as string[], status: "active" as const,
  package_name: "", start_month: "", end_month: "", progress_pct: 0,
}

// ── Project Sheet ─────────────────────────────────────────────────────────────

function ProjectSheet({ open, onClose, project }: { open: boolean; onClose: () => void; project?: Project | null }) {
  const isEdit = !!project
  const [form, setForm] = useState(project ? {
    business_name: project.business_name,
    client_name: project.client_name,
    location: project.location ?? "",
    service_types: project.service_types ?? [],
    status: project.status,
    package_name: project.package_name ?? "",
    start_month: dateToMonth(project.start_month),
    end_month: dateToMonth(project.end_month),
    progress_pct: project.progress_pct,
  } : EMPTY)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }))

  function toggleService(s: string) {
    setForm(p => ({
      ...p,
      service_types: p.service_types.includes(s)
        ? p.service_types.filter(x => x !== s)
        : [...p.service_types, s],
    }))
  }

  function handleSubmit() {
    if (!form.business_name.trim()) { setError("Business name is required"); return }
    if (!form.client_name.trim()) { setError("Client name is required"); return }
    setError("")
    startTransition(async () => {
      const payload = {
        ...form,
        start_month: form.start_month || null,
        end_month: form.end_month || null,
        progress_pct: Number(form.progress_pct),
      }
      const result = isEdit
        ? await updateProject({ id: project!.id, ...payload })
        : await createProject(payload)
      if (result.success) onClose()
      else setError(result.error ?? "Something went wrong")
    })
  }

  if (!open) return null

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: "10px", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.16em",
    marginBottom: "8px", color: "#9CA3AF",
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[440px] z-50 flex flex-col"
        style={{ background: "#0D0D0D", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
        <style>{`.ps-input::placeholder{color:rgba(255,255,255,0.2)}.ps-input:focus{border-color:rgba(220,38,38,0.4)!important}`}</style>

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div>
            <h2 className="text-[17px] font-black text-white" style={{ fontFamily: "var(--font-jakarta)" }}>
              {isEdit ? "Edit Client" : "Add New Client"}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              {isEdit ? "Update client details" : "Create and track a new client engagement"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "#F8F9FA" }}>
            <X size={14} style={{ color: "#6B7280" }} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Services */}
          <div>
            <label style={labelStyle}>
              Services
              {form.service_types.length > 0 && (
                <span style={{ color: "#F87171" }}> ({form.service_types.length} selected)</span>
              )}
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-[160px] overflow-y-auto">
              {SERVICES.map(s => {
                const active = form.service_types.includes(s)
                return (
                  <button key={s} type="button" onClick={() => toggleService(s)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all border"
                    style={active
                      ? { background: "rgba(220,38,38,0.12)", borderColor: "rgba(220,38,38,0.35)", color: "#F87171" }
                      : { background: "#F8F9FA", borderColor: "#2E2E2E", color: "#9CA3AF" }
                    }>
                    {active && "✓ "}{s}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Business Name */}
          <div>
            <label style={labelStyle}>Business Name *</label>
            <input value={form.business_name} onChange={set("business_name")}
              placeholder="e.g. Krishna Saree House" className="ps-input" style={inputStyle} />
          </div>

          {/* Client Name */}
          <div>
            <label style={labelStyle}>Client Name *</label>
            <input value={form.client_name} onChange={set("client_name")}
              placeholder="e.g. Ravi Kumar" className="ps-input" style={inputStyle} />
          </div>

          {/* Location */}
          <div>
            <label style={labelStyle}>Location</label>
            <input value={form.location} onChange={set("location")}
              placeholder="e.g. T. Nagar, Chennai" className="ps-input" style={inputStyle} />
          </div>

          {/* Package */}
          <div>
            <label style={labelStyle}>Package</label>
            <input value={form.package_name} onChange={set("package_name")}
              placeholder="e.g. 3-Month Social Media — ₹15,000/mo"
              className="ps-input" style={inputStyle} />
            <p className="text-[10px] mt-1.5" style={{ color: "#D1D5DB" }}>
              Describe the service package or pricing plan for this client
            </p>
          </div>

          {/* Engagement Period */}
          <div>
            <label style={labelStyle}>Engagement Period</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] mb-1.5" style={{ color: "#D1D5DB" }}>From Month</p>
                <input type="month" value={form.start_month} onChange={set("start_month")}
                  className="ps-input" style={inputStyle} />
              </div>
              <div>
                <p className="text-[10px] mb-1.5" style={{ color: "#D1D5DB" }}>To Month</p>
                <input type="month" value={form.end_month} onChange={set("end_month")}
                  className="ps-input" style={inputStyle} />
              </div>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: "#D1D5DB" }}>
              The months this client engagement runs — used to track how long the project is active
            </p>
          </div>

          {/* Status */}
          <div>
            <label style={labelStyle}>Status</label>
            <div className="flex gap-2">
              {(["active", "on_hold", "completed"] as const).map(s => {
                const cfg = STATUS_CONFIG[s]
                const isActive = form.status === s
                return (
                  <button key={s} type="button" onClick={() => setForm(p => ({ ...p, status: s }))}
                    className="flex-1 py-2.5 rounded-lg text-[12px] font-bold transition-all"
                    style={isActive
                      ? { background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }
                      : { background: "#F8F9FA", border: "1px solid #2E2E2E", color: "#9CA3AF" }
                    }>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                Work Completion — {form.progress_pct}%
              </label>
            </div>
            <input type="range" min={0} max={100} step={5}
              value={form.progress_pct}
              onChange={e => setForm(p => ({ ...p, progress_pct: Number(e.target.value) }))}
              className="w-full" style={{ accentColor: "#DC2626" }} />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: "rgba(0,0,0,0.1)" }}>
              <span>0% — Not started</span><span>50%</span><span>100% — Done</span>
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: "#D1D5DB" }}>
              How much of the overall work / deliverables are completed for this client
            </p>
          </div>

          {error && (
            <p className="text-[12px] px-4 py-3 rounded-lg"
              style={{ background: "rgba(220,38,38,0.07)", color: "#F87171", border: "1px solid rgba(220,38,38,0.18)" }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex gap-3 flex-shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl text-[13px] font-semibold"
            style={{ background: "#F8F9FA", border: "1px solid #2E2E2E", color: "#6B7280" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isPending}
            className="flex-1 py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2"
            style={{ background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)", color: "#FFFFFF", opacity: isPending ? 0.65 : 1 }}>
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
        <div className="rounded-2xl p-6 w-full max-w-sm" style={{ background: "#0D0D0D", border: "1px solid #2A2A2A" }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
            style={{ background: "rgba(220,38,38,0.1)" }}>
            <Trash2 size={16} style={{ color: "#DC2626" }} />
          </div>
          <h3 className="text-[16px] font-black mb-1 text-white" style={{ fontFamily: "var(--font-jakarta)" }}>
            Delete Client?
          </h3>
          <p className="text-[13px] mb-6" style={{ color: "#9CA3AF" }}>
            <span className="text-white font-semibold">{project.business_name}</span> will be permanently removed.
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: "#F8F9FA", border: "1px solid #2E2E2E", color: "#6B7280" }}>
              Cancel
            </button>
            <button onClick={handleDelete} disabled={isPending}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2"
              style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)", color: "#F87171", opacity: isPending ? 0.65 : 1 }}>
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
  readOnly = false,
  sheetUrl = null,
}: {
  projects: Project[]
  taskStats?: Record<string, TaskStats>
  readOnly?: boolean
  sheetUrl?: string | null
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
    return projects.filter(p => {
      const matchSearch = !q || p.business_name.toLowerCase().includes(q)
        || p.client_name.toLowerCase().includes(q)
        || (p.location ?? "").toLowerCase().includes(q)
        || (p.package_name ?? "").toLowerCase().includes(q)
      const matchStatus = statusFilter === "ALL" || p.status === statusFilter
      const matchService = !serviceFilter || (p.service_types ?? []).includes(serviceFilter)
      return matchSearch && matchStatus && matchService
    })
  }, [search, statusFilter, serviceFilter, projects])

  const stats = {
    total: projects.length,
    active: projects.filter(p => p.status === "active").length,
    completed: projects.filter(p => p.status === "completed").length,
    on_hold: projects.filter(p => p.status === "on_hold").length,
  }

  return (
    <div className="p-8 max-w-[1400px]">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="gradient-heading text-[28px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>
            Clients
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(17,24,39,0.4)" }}>
            {readOnly ? "Client list synced from Google Sheets — edit the sheet to make changes." : "Track and manage all client engagements."}
          </p>
        </div>
        {readOnly ? (
          sheetUrl ? (
            <a href={sheetUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
              style={{ background: "#F0FDF4", border: "1px solid rgba(22,163,74,0.3)", color: "#16A34A" }}>
              <ArrowRight size={14} /> Open Sheet
            </a>
          ) : null
        ) : (
          <button onClick={() => { setEditProject(null); setSheetOpen(true) }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all hover:opacity-90"
            style={{ background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)", color: "#FFFFFF" }}>
            <Plus size={14} /> Add Client
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Clients", value: stats.total,     color: "#DC2626",  bg: "rgba(220,38,38,0.08)",  border: "rgba(220,38,38,0.15)",  icon: FolderOpen },
          { label: "Active",        value: stats.active,    color: "#DC2626",  bg: "rgba(220,38,38,0.06)",  border: "rgba(220,38,38,0.12)",  icon: Clock },
          { label: "Completed",     value: stats.completed, color: "#16A34A",  bg: "rgba(22,163,74,0.06)",  border: "rgba(22,163,74,0.12)",  icon: CheckCircle2 },
          { label: "On Hold",       value: stats.on_hold,   color: "#F59E0B",  bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.12)", icon: PauseCircle },
        ].map(({ label, value, color, bg, border, icon: Icon }) => (
          <div key={label} className="rounded-2xl p-5 flex items-center gap-4"
            style={{ background: "#FFFFFF", border: `1px solid ${border}` }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
              <Icon size={15} style={{ color }} />
            </div>
            <div>
              <p className="text-[28px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#111827" }}>{value}</p>
              <p className="text-[11px] font-medium mt-1" style={{ color: "#6B7280" }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-[280px]">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#9CA3AF" }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search client, business, package…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-[13px] outline-none"
            style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)", color: "#111827" }} />
        </div>
        <div className="relative">
          <Briefcase size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#9CA3AF" }} />
          <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}
            className="appearance-none pl-8 pr-8 py-2.5 rounded-xl text-[12px] outline-none min-w-[190px]"
            style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)", color: "#374151" }}>
            <option value="">All Services</option>
            {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#9CA3AF" }} />
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}>
          {(["ALL", "active", "on_hold", "completed"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
              style={statusFilter === s
                ? { background: "#FFFFFF", color: "#DC2626", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }
                : { color: "#6B7280" }
              }>
              {s === "ALL" ? "All" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px]" style={{ color: "#9CA3AF" }}>
          {filtered.length} of {projects.length}
        </span>
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 rounded-2xl"
          style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)" }}>
          <FolderOpen size={36} style={{ color: "#E5E7EB" }} className="mb-3" />
          <p className="text-[14px] font-semibold" style={{ color: "#9CA3AF" }}>
            {projects.length === 0 ? "No clients yet" : "No clients match your filter"}
          </p>
          {projects.length === 0 && !readOnly && (
            <button onClick={() => { setEditProject(null); setSheetOpen(true) }}
              className="mt-5 px-5 py-2.5 rounded-xl text-[13px] font-bold"
              style={{ background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)", color: "#FFFFFF" }}>
              Add First Client
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map(project => {
            const cfg = STATUS_CONFIG[project.status]
            const ts = taskStats[project.id]
            const taskProgress = ts && ts.total > 0 ? Math.round((ts.completed / ts.total) * 100) : null
            const displayProgress = taskProgress ?? project.progress_pct

            // Duration in months
            let durationLabel = ""
            if (project.start_month && project.end_month) {
              const s = new Date(project.start_month)
              const e = new Date(project.end_month)
              const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1
              durationLabel = months > 0 ? `${months} month${months > 1 ? "s" : ""}` : ""
            }

            return (
              <div key={project.id}
                className="rounded-2xl p-5 flex flex-col gap-4 transition-all hover:-translate-y-0.5 hover:shadow-md"
                style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)" }}>

                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                        {cfg.label}
                      </span>
                      {durationLabel && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(220,38,38,0.07)", color: "#B91C1C" }}>
                          {durationLabel}
                        </span>
                      )}
                    </div>
                    <h3 className="text-[15px] font-black leading-snug truncate"
                      style={{ fontFamily: "var(--font-jakarta)", color: "#111827" }}>
                      {project.business_name}
                    </h3>
                    {/* Services */}
                    {project.service_types?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {project.service_types.slice(0, 2).map(s => (
                          <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(220,38,38,0.07)", color: "#B91C1C" }}>
                            {s}
                          </span>
                        ))}
                        {project.service_types.length > 2 && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: "#F3F4F6", color: "#6B7280" }}>
                            +{project.service_types.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {!readOnly && (
                    <div className="relative ml-2 flex-shrink-0">
                      <button onClick={() => setOpenDropdown(openDropdown === project.id ? null : project.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "#F3F4F6" }}>
                        <MoreVertical size={14} style={{ color: "#6B7280" }} />
                      </button>
                      {openDropdown === project.id && (
                        <div className="absolute right-0 top-9 w-36 rounded-xl overflow-hidden py-1 z-20"
                          style={{ background: "#FFFFFF", border: "1px solid #F0F0F0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
                          <button onClick={() => { setEditProject(project); setSheetOpen(true); setOpenDropdown(null) }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all hover:bg-gray-50"
                            style={{ color: "#374151" }}>
                            <Pencil size={12} /> Edit
                          </button>
                          <button onClick={() => { setDeleteTarget(project); setOpenDropdown(null) }}
                            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all hover:bg-red-50"
                            style={{ color: "#DC2626" }}>
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Client + Location + Package + Period */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <User size={11} style={{ color: "#9CA3AF" }} />
                    <span className="text-[12px] truncate" style={{ color: "#374151" }}>{project.client_name}</span>
                  </div>
                  {project.location && (
                    <div className="flex items-center gap-2">
                      <MapPin size={11} style={{ color: "#9CA3AF" }} />
                      <span className="text-[12px] truncate" style={{ color: "#6B7280" }}>{project.location}</span>
                    </div>
                  )}
                  {project.package_name && (
                    <div className="flex items-start gap-2">
                      <Package size={11} style={{ color: "#DC2626", marginTop: 1, flexShrink: 0 }} />
                      <span className="text-[12px] leading-snug" style={{ color: "#374151", fontWeight: 500 }}>
                        {project.package_name}
                      </span>
                    </div>
                  )}
                  {(project.start_month || project.end_month) && (
                    <div className="flex items-center gap-2">
                      <CalendarRange size={11} style={{ color: "#9CA3AF" }} />
                      <span className="text-[12px]" style={{ color: "#6B7280" }}>
                        {fmtMonth(project.start_month)} → {fmtMonth(project.end_month)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Task stats */}
                {ts && (
                  <div className="flex items-center gap-3 px-3 py-2 rounded-xl"
                    style={{ background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.1)" }}>
                    <Target size={11} style={{ color: "#DC2626" }} />
                    <span className="text-[11px] font-semibold" style={{ color: "#DC2626" }}>{ts.active} active</span>
                    <span className="text-[11px]" style={{ color: "#D1D5DB" }}>·</span>
                    <span className="text-[11px]" style={{ color: "#6B7280" }}>{ts.completed}/{ts.total} done</span>
                  </div>
                )}

                {/* Work Completion bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                      Work Completion
                    </span>
                    <span className="text-[12px] font-bold" style={{ color: "#111827" }}>
                      {displayProgress}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${displayProgress}%`,
                        background: project.status === "completed"
                          ? "#16A34A"
                          : project.status === "on_hold"
                          ? "#F59E0B"
                          : `linear-gradient(90deg, #DC2626 0%, #B91C1C 100%)`,
                      }}
                    />
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: "#D1D5DB" }}>
                    {taskProgress != null ? "Based on completed tasks" : "Manually set by admin"}
                  </p>
                </div>

                {/* View Details — only for Supabase-backed clients */}
                {!readOnly && (
                  <Link href={`/admin/clients/${project.id}`}
                    className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-[12px] font-semibold transition-all hover:opacity-90"
                    style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.15)", color: "#DC2626" }}>
                    View Details <ArrowRight size={12} />
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}

      {openDropdown && <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />}
      {!readOnly && <ProjectSheet key={editProject?.id ?? "add"} open={sheetOpen} onClose={() => setSheetOpen(false)} project={editProject} />}
      {!readOnly && deleteTarget && <DeleteConfirm project={deleteTarget} onCancel={() => setDeleteTarget(null)} />}
    </div>
  )
}
