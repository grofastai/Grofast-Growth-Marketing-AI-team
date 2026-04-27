"use client"

import { useState, useMemo, useTransition } from "react"
import {
  Search, Plus, FolderOpen, CheckCircle2, Clock, PauseCircle,
  MoreVertical, MapPin, CalendarDays, X, Pencil, Trash2,
  Loader2, Building2, User, Briefcase, ChevronDown,
} from "lucide-react"
import { createProject, updateProject, deleteProject } from "@/lib/actions/projects"

export const SERVICES = [
  "Performance Marketing",
  "Google Ads & SEO",
  "Personal Branding",
  "Video Editing",
  "Business Consulting",
  "LinkedIn Personal Branding",
  "Social Media Management",
  "Social Media Promotion",
  "Email Marketing",
  "SAAS Tool",
  "Customized Software Development",
  "Website Development",
  "E-Commerce Website",
  "Landing Page Designing",
  "AI Chatbot",
  "Poster Designing",
  "Google My Business Optimization",
  "Professional RJ Voice Over",
  "Advertisement Shoot",
  "Drone Shooting",
] as const

interface Project {
  id: string
  business_name: string
  client_name: string
  location: string | null
  service_type: string | null
  status: "active" | "completed" | "on_hold"
  deadline: string | null
  progress_pct: number
  created_at: string
}

const STATUS_CONFIG = {
  active: { label: "Active", bg: "bg-primary-soft", text: "text-[#4AADAD]", dot: "bg-[#4AADAD]", icon: Clock },
  completed: { label: "Completed", bg: "bg-success-bg", text: "text-success", dot: "bg-success", icon: CheckCircle2 },
  on_hold: { label: "On Hold", bg: "bg-warning-bg", text: "text-warning", dot: "bg-warning", icon: PauseCircle },
}

function formatDate(s: string | null) {
  if (!s) return "—"
  return new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

function isOverdue(deadline: string | null, status: string) {
  if (!deadline || status === "completed") return false
  return new Date(deadline) < new Date()
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

interface SheetProps {
  open: boolean
  onClose: () => void
  project?: Project | null
}

const EMPTY_FORM = {
  business_name: "",
  client_name: "",
  location: "",
  service_type: "",
  status: "active" as const,
  deadline: "",
  progress_pct: 0,
}

function ProjectSheet({ open, onClose, project }: SheetProps) {
  const isEdit = !!project
  const [form, setForm] = useState(
    project
      ? {
          business_name: project.business_name,
          client_name: project.client_name,
          location: project.location ?? "",
          service_type: project.service_type ?? "",
          status: project.status,
          deadline: project.deadline ?? "",
          progress_pct: project.progress_pct,
        }
      : EMPTY_FORM
  )
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  function handleSubmit() {
    if (!form.business_name.trim()) { setError("Project / Business name is required"); return }
    if (!form.client_name.trim()) { setError("Client name is required"); return }
    setError("")
    startTransition(async () => {
      const payload = {
        ...form,
        service_type: form.service_type || null,
        deadline: form.deadline || null,
        progress_pct: Number(form.progress_pct),
      }
      const result = isEdit
        ? await updateProject({ id: project!.id, ...payload })
        : await createProject(payload)
      if (result.success) { onClose() }
      else { setError(result.error ?? "Something went wrong") }
    })
  }

  if (!open) return null

  const inputCls = "w-full bg-cream rounded-xl px-4 py-3 text-[13px] font-sans text-ink placeholder:text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:bg-white transition-all"

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[440px] bg-card z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-ink text-[17px]" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 700 }}>
              {isEdit ? "Edit Project" : "Add New Project"}
            </h2>
            <p className="text-[12px] text-ink-muted font-sans mt-0.5">
              {isEdit ? "Update project details" : "Create and track a new client project"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-cream transition-colors">
            <X size={15} className="text-ink-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Service *
            </label>
            <div className="relative">
              <select
                value={form.service_type}
                onChange={set("service_type")}
                className={`${inputCls} appearance-none pr-10 cursor-pointer`}
              >
                <option value="">Select a service…</option>
                {SERVICES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Project / Business Name *
            </label>
            <input value={form.business_name} onChange={set("business_name")}
              placeholder="e.g. Krishna Saree House" className={inputCls} />
          </div>

          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Client Name *
            </label>
            <input value={form.client_name} onChange={set("client_name")}
              placeholder="e.g. Ravi Kumar" className={inputCls} />
          </div>

          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Location
            </label>
            <input value={form.location} onChange={set("location")}
              placeholder="e.g. T. Nagar, Chennai" className={inputCls} />
          </div>

          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Status
            </label>
            <div className="flex gap-2">
              {(["active", "on_hold", "completed"] as const).map((s) => {
                const cfg = STATUS_CONFIG[s]
                return (
                  <button key={s} type="button" onClick={() => setForm((p) => ({ ...p, status: s }))}
                    className={`flex-1 py-2.5 rounded-xl text-[12px] font-semibold font-sans border transition-all ${
                      form.status === s ? "bg-brand border-brand text-white" : "bg-cream border-cream-dark text-ink hover:border-brand/40"
                    }`}>
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Deadline
            </label>
            <input type="date" value={form.deadline} onChange={set("deadline")} className={inputCls} />
          </div>

          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Progress — {form.progress_pct}%
            </label>
            <input type="range" min={0} max={100} step={5}
              value={form.progress_pct}
              onChange={(e) => setForm((p) => ({ ...p, progress_pct: Number(e.target.value) }))}
              className="w-full accent-brand" />
            <div className="flex justify-between text-[10px] text-ink-muted font-sans mt-1">
              <span>0%</span><span>50%</span><span>100%</span>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-[12px] bg-red-50 border border-red-200 rounded-xl px-4 py-3 font-sans">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center gap-3 flex-shrink-0">
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-cream text-ink text-[13px] font-semibold font-sans hover:bg-cream-dark transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isPending}
            className="flex-1 py-3 rounded-xl bg-brand text-white text-[13px] font-semibold font-sans hover:bg-brand-dark transition-colors shadow-sm shadow-brand/20 disabled:opacity-60 flex items-center justify-center gap-2">
            {isPending && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Add Project"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Delete Confirm ────────────────────────────────────────────────────────────

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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-sm p-6">
          <div className="w-11 h-11 rounded-xl bg-danger-bg flex items-center justify-center mb-4">
            <Trash2 size={18} className="text-red-500" />
          </div>
          <h3 className="text-ink text-[16px] mb-1" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 700 }}>
            Delete Project?
          </h3>
          <p className="text-[13px] text-ink-muted font-sans mb-6">
            <strong className="text-ink">{project.business_name}</strong> will be permanently removed. This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl bg-cream text-ink text-[13px] font-semibold font-sans hover:bg-cream-dark transition-colors">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-[13px] font-semibold font-sans hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {isPending && <Loader2 size={12} className="animate-spin" />}
              Delete
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProjectsClient({ projects }: { projects: Project[] }) {
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
      const matchService = !serviceFilter || p.service_type === serviceFilter
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
    <div className="p-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[38px] leading-tight text-ink" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800 }}>
            Projects
          </h1>
          <p className="text-ink-muted font-sans text-sm mt-1.5">Track and manage all client projects</p>
        </div>
        <button
          onClick={() => { setEditProject(null); setSheetOpen(true) }}
          className="flex items-center gap-2 bg-brand text-white px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans hover:bg-brand-dark transition-colors mt-2 shadow-sm shadow-brand/20"
        >
          <Plus size={15} /> Add Project
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Projects", value: stats.total, icon: FolderOpen, bg: "bg-cream-dark", color: "text-ink" },
          { label: "Active", value: stats.active, icon: Clock, bg: "bg-[#e6f4f1]", color: "text-[#006b65]" },
          { label: "Completed", value: stats.completed, icon: CheckCircle2, bg: "bg-success-bg", color: "text-success" },
          { label: "On Hold", value: stats.on_hold, icon: PauseCircle, bg: "bg-warning-bg", color: "text-warning" },
        ].map(({ label, value, icon: Icon, bg, color }) => (
          <div key={label} className="bg-card rounded-2xl border border-border px-5 py-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
              <Icon size={17} className={color} />
            </div>
            <div>
              <p className="text-[26px] leading-none text-ink" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800 }}>{value}</p>
              <p className="text-[11px] text-ink-muted font-sans mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-[300px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project or client…"
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-[13px] font-sans text-ink placeholder:text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand/20 transition-all" />
        </div>

        {/* Service filter */}
        <div className="relative">
          <Briefcase size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="appearance-none bg-card border border-border rounded-xl pl-8 pr-8 py-2.5 text-[12px] font-sans text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand/20 transition-all cursor-pointer min-w-[200px]"
          >
            <option value="">All Services</option>
            {SERVICES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        </div>

        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          {(["ALL", "active", "on_hold", "completed"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold font-sans transition-all ${
                statusFilter === s ? "bg-brand text-white shadow-sm" : "text-ink-muted hover:text-ink"
              }`}>
              {s === "ALL" ? "All" : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-ink-muted font-sans">{filtered.length} of {projects.length} projects</span>
      </div>

      {/* Project Cards Grid */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-2xl border border-border p-16 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-cream-dark flex items-center justify-center mb-4">
            <FolderOpen size={24} className="text-ink-muted" />
          </div>
          <h3 className="text-[16px] font-bold mb-2 text-ink" style={{ fontFamily: "var(--font-jakarta)" }}>
            {projects.length === 0 ? "No projects yet" : "No projects match your filter"}
          </h3>
          <p className="text-[13px] text-ink-muted font-sans max-w-xs">
            {projects.length === 0 ? "Add your first client project to start tracking progress." : "Try clearing the search or changing the filters."}
          </p>
          {projects.length === 0 && (
            <button onClick={() => { setEditProject(null); setSheetOpen(true) }}
              className="mt-6 px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white"
              style={{ background: "linear-gradient(135deg, #ee0039, #c8002f)", boxShadow: "0 3px 10px rgba(238,0,57,0.3)" }}>
              Add First Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((project) => {
            const cfg = STATUS_CONFIG[project.status]
            const overdue = isOverdue(project.deadline, project.status)

            return (
              <div key={project.id} className="bg-card rounded-2xl border border-border p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col gap-4">
                {/* Card header */}
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold font-sans px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                      {overdue && (
                        <span className="inline-flex items-center text-[10px] font-semibold font-sans px-2 py-0.5 rounded-full bg-red-50 text-red-500">
                          Overdue
                        </span>
                      )}
                    </div>
                    <h3 className="text-[15px] text-ink mt-1.5 leading-snug truncate" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 700 }}>
                      {project.business_name}
                    </h3>
                    {project.service_type && (
                      <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold font-sans px-2 py-0.5 rounded-full bg-[#f0f0ff] text-[#5a4fcf]">
                        <Briefcase size={9} />
                        {project.service_type}
                      </span>
                    )}
                  </div>
                  <div className="relative ml-2 flex-shrink-0">
                    <button onClick={() => setOpenDropdown(openDropdown === project.id ? null : project.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-cream transition-colors">
                      <MoreVertical size={14} className="text-ink-muted" />
                    </button>
                    {openDropdown === project.id && (
                      <div className="absolute right-0 top-9 w-36 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden py-1">
                        <button onClick={() => { setEditProject(project); setSheetOpen(true); setOpenDropdown(null) }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-sans text-ink hover:bg-cream transition-colors">
                          <Pencil size={12} className="text-ink-muted" /> Edit
                        </button>
                        <button onClick={() => { setDeleteTarget(project); setOpenDropdown(null) }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-sans text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Client & Location */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[12px] font-sans text-ink-2">
                    <User size={11} className="text-ink-muted flex-shrink-0" />
                    <span className="truncate">{project.client_name}</span>
                  </div>
                  {project.location && (
                    <div className="flex items-center gap-2 text-[12px] font-sans text-ink-muted">
                      <MapPin size={11} className="flex-shrink-0" />
                      <span className="truncate">{project.location}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-[12px] font-sans text-ink-muted">
                    <CalendarDays size={11} className="flex-shrink-0" />
                    <span className={overdue ? "text-red-500 font-semibold" : ""}>{formatDate(project.deadline)}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-semibold font-sans text-ink-muted uppercase tracking-wider">Progress</span>
                    <span className="text-[12px] font-bold font-sans text-ink">{project.progress_pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-cream-dark overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${project.progress_pct}%`,
                        background: project.status === "completed"
                          ? "#22c55e"
                          : project.status === "on_hold"
                          ? "#f59e0b"
                          : "linear-gradient(90deg, #0E3B3B, #6D5DF6)",
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
