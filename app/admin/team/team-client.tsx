"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Search, Plus, Shield, UserCheck,
  MoreVertical, Phone, CalendarDays, X, Pencil,
  Ban, RotateCcw, User, Loader2, Trash2, AlertTriangle, ChevronDown, KeyRound,
  ClipboardList, CheckCircle2, Send, TrendingUp, Star, Clock,
} from "lucide-react"
import { createMember, updateMember, toggleMemberStatus, deleteMember, resetMemberPassword, assignTask } from "@/lib/actions/team"

const TEAMS = [
  "Media & Technology Team",
  "Media Team",
  "Technology & Operation Team",
  "Creative Team",
] as const

interface Member {
  id: string
  name: string
  employee_id: string
  role: "ADMIN" | "MEMBER"
  email: string | null
  phone: string | null
  status: "active" | "inactive"
  team: string | null
  position: string | null
  created_at: string
  employment_type: "regular" | "part_time" | "freelancer" | null
  monthly_salary: number | null
  hourly_rate: number | null
  paid_leave_days: number | null
  deleted_at?: string | null
  date_of_birth?: string | null
  joined_at?: string | null
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

function formatDateShort(s: string) {
  return new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short" })
}

const FIELD: React.CSSProperties = {
  background: "rgba(0,0,0,0.03)",
  border: "1px solid #E5E7EB",
  color: "#111111",
  width: "100%",
  borderRadius: "10px",
  padding: "11px 14px",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
}

// team color per department
function teamColor(team: string | null): { bg: string; color: string } {
  if (!team) return { bg: "#F3F4F6", color: "#6B7280" }
  if (team.includes("Media & Tech")) return { bg: "rgba(99,102,241,0.1)", color: "#6366F1" }
  if (team.includes("Media")) return { bg: "rgba(236,72,153,0.1)", color: "#EC4899" }
  if (team.includes("Tech")) return { bg: "rgba(16,185,129,0.1)", color: "#10B981" }
  if (team.includes("Creative")) return { bg: "rgba(245,158,11,0.1)", color: "#F59E0B" }
  return { bg: "#F3F4F6", color: "#6B7280" }
}

function teamShort(team: string | null) {
  if (!team) return "—"
  if (team.includes("Media & Tech")) return "Media & Tech"
  if (team.includes("Media")) return "Media"
  if (team.includes("Tech")) return "Tech & Ops"
  if (team.includes("Creative")) return "Creative"
  return team
}

// ── Add / Edit Sheet ──────────────────────────────────────────────────────────

interface SheetProps {
  open: boolean
  onClose: () => void
  member?: Member | null
}

function MemberSheet({ open, onClose, member }: SheetProps) {
  const isEdit = !!member
  const [form, setForm] = useState({
    name: member?.name ?? "",
    employee_id: member?.employee_id ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    role: (member?.role ?? "MEMBER") as "ADMIN" | "MEMBER",
    team: member?.team ?? "",
    position: member?.position ?? "",
    password: "",
    employment_type: (member?.employment_type ?? "regular") as "regular" | "part_time" | "freelancer",
    monthly_salary: member?.monthly_salary?.toString() ?? "",
    hourly_rate: member?.hourly_rate?.toString() ?? "",
    paid_leave_days: member?.paid_leave_days?.toString() ?? "5",
    date_of_birth: member?.date_of_birth ?? "",
    joined_at: member?.joined_at ?? new Date().toISOString().split("T")[0],
  })
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const router = useRouter()

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const salaryFields = {
        employment_type: form.employment_type,
        monthly_salary: form.employment_type === "regular" && form.monthly_salary ? parseFloat(form.monthly_salary) : null,
        hourly_rate: form.employment_type !== "regular" && form.hourly_rate ? parseFloat(form.hourly_rate) : null,
        paid_leave_days: form.employment_type === "regular" ? (parseInt(form.paid_leave_days) || 5) : 0,
      }
      const dateFields = {
        date_of_birth: form.date_of_birth || null,
        joined_at: form.joined_at || null,
      }
      const result = isEdit
        ? await updateMember({ id: member!.id, name: form.name, email: form.email, phone: form.phone, role: form.role, team: form.team, position: form.position || null, ...salaryFields, ...dateFields })
        : await createMember({ name: form.name, employee_id: form.employee_id, email: form.email, phone: form.phone, role: form.role, team: form.team, position: form.position || null, password: form.password, ...salaryFields, ...dateFields })

      if (result.success) {
        router.refresh()
        onClose()
      } else {
        setError(result.error ?? "Something went wrong")
      }
    })
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] z-50 shadow-2xl flex flex-col"
        style={{ background: "#FFFFFF", borderLeft: "1px solid rgba(222,26,26,0.15)" }}>

        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid #E5E7EB" }}>
          <div>
            <h2 className="text-[17px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
              {isEdit ? "Edit Member" : "Add New Member"}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
              {isEdit ? "Update member details" : "Create a new team member account"}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-gray-100"
            style={{ border: "1px solid #E5E7EB" }}>
            <X size={14} style={{ color: "#6B7280" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <style>{`.sheet-input:focus{border-color:rgba(222,26,26,0.4)!important}`}</style>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Full Name *</label>
            <input className="sheet-input" value={form.name} onChange={set("name")} placeholder="e.g. Priya Sharma" style={FIELD} />
          </div>

          {!isEdit && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Employee ID *</label>
              <input className="sheet-input" value={form.employee_id} onChange={set("employee_id")} placeholder="e.g. GF002" style={FIELD} />
              <p className="text-[11px] mt-1.5" style={{ color: "#9CA3AF" }}>Unique ID — cannot be changed later.</p>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Email Address *</label>
            <input type="email" className="sheet-input" value={form.email} onChange={set("email")} placeholder="e.g. priya@gmail.com" style={FIELD} />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>WhatsApp Number</label>
            <input className="sheet-input" value={form.phone} onChange={set("phone")} placeholder="e.g. 919876543210" style={FIELD} />
            <p className="text-[11px] mt-1.5" style={{ color: "#9CA3AF" }}>Credentials will be sent here after account creation.</p>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Team *</label>
            <div className="relative">
              <select className="sheet-input" value={form.team} onChange={set("team")}
                style={{ ...FIELD, appearance: "none", paddingRight: "36px" }}>
                <option value="">Select a team…</option>
                {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#6B7280" }} />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Position / Designation</label>
            <input className="sheet-input" value={form.position} onChange={set("position")} placeholder="e.g. Social Media Executive, Videographer…" style={FIELD} />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Role *</label>
            <div className="flex gap-3">
              {(["MEMBER", "ADMIN"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setForm((prev) => ({ ...prev, role: r }))}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                  style={form.role === r
                    ? { background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#FFFFFF", border: "1px solid rgba(222,26,26,0.3)" }
                    : { background: "rgba(0,0,0,0.03)", color: "#6B7280", border: "1px solid #E5E7EB" }
                  }>
                  {r === "ADMIN" ? "Admin" : "Member"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Employment Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "regular", label: "Regular" },
                { value: "part_time", label: "Part Time" },
                { value: "freelancer", label: "Freelancer" },
              ] as const).map(({ value, label }) => (
                <button key={value} type="button"
                  onClick={() => setForm((prev) => ({ ...prev, employment_type: value, monthly_salary: "", hourly_rate: "", paid_leave_days: value === "regular" ? "5" : "0" }))}
                  className="py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                  style={form.employment_type === value
                    ? { background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#FFFFFF", border: "1px solid rgba(222,26,26,0.3)" }
                    : { background: "rgba(0,0,0,0.03)", color: "#6B7280", border: "1px solid #E5E7EB" }
                  }>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {form.employment_type === "regular" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Monthly Salary (₹)</label>
                <input type="number" min="0" step="500" className="sheet-input" style={FIELD}
                  placeholder="e.g. 15000" value={form.monthly_salary}
                  onChange={(e) => setForm((prev) => ({ ...prev, monthly_salary: e.target.value }))} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Paid Leave/Month</label>
                <input type="number" min="0" max="30" step="1" className="sheet-input" style={FIELD}
                  placeholder="5" value={form.paid_leave_days}
                  onChange={(e) => setForm((prev) => ({ ...prev, paid_leave_days: e.target.value }))} />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Hourly Rate (₹)</label>
              <input type="number" min="0" step="10" className="sheet-input" style={FIELD}
                placeholder="e.g. 150" value={form.hourly_rate}
                onChange={(e) => setForm((prev) => ({ ...prev, hourly_rate: e.target.value }))} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Date of Birth</label>
              <input type="date" className="sheet-input" style={{ ...FIELD, colorScheme: "light" }}
                value={form.date_of_birth} onChange={set("date_of_birth")} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Work Start Date</label>
              <input type="date" className="sheet-input" style={{ ...FIELD, colorScheme: "light" }}
                value={form.joined_at} onChange={set("joined_at")} />
            </div>
          </div>

          {!isEdit && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Temporary Password *</label>
              <input type="text" className="sheet-input" value={form.password} onChange={set("password")}
                placeholder="Min 6 characters" style={FIELD} />
              <p className="text-[11px] mt-1.5" style={{ color: "#9CA3AF" }}>Will be sent via WhatsApp.</p>
            </div>
          )}

          {error && (
            <p className="text-[12px] rounded-xl px-4 py-3"
              style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}>{error}</p>
          )}
        </div>

        <div className="px-6 py-4 flex items-center gap-3 flex-shrink-0" style={{ borderTop: "1px solid #E5E7EB" }}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl text-[13px] font-semibold transition-all"
            style={{ background: "rgba(0,0,0,0.03)", color: "#6B7280", border: "1px solid #E5E7EB" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isPending}
            className="flex-1 py-3 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
            style={{ background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#FFFFFF", boxShadow: "0 4px 16px rgba(222,26,26,0.25)" }}>
            {isPending && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Add Member"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Assign Task Modal ─────────────────────────────────────────────────────────

interface AssignTaskModalProps {
  member: Member
  onClose: () => void
}

function AssignTaskModal({ member, onClose }: AssignTaskModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<{ whatsappSent: boolean } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAssign() {
    if (!title.trim()) { setError("Task title is required"); return }
    setError("")
    startTransition(async () => {
      const result = await assignTask({
        member_id: member.id,
        member_name: member.name,
        member_phone: member.phone,
        title: title.trim(),
        description: description.trim(),
        due_date: dueDate || null,
      })
      if (result.success) {
        setSuccess({ whatsappSent: result.whatsappSent ?? false })
      } else {
        setError(result.error ?? "Something went wrong")
      }
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[420px] rounded-2xl shadow-2xl flex flex-col"
          style={{ background: "#FFFFFF", border: "1px solid rgba(99,102,241,0.2)" }}>

          <div className="px-6 pt-6 pb-4 flex items-start justify-between" style={{ borderBottom: "1px solid #F3F4F6" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                <ClipboardList size={18} style={{ color: "#6366F1" }} />
              </div>
              <div>
                <h3 className="text-[15px] font-bold" style={{ color: "#111111" }}>Assign Task</h3>
                <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
                  To <strong style={{ color: "#111111" }}>{member.name}</strong>
                  {member.team ? <span style={{ color: "#9CA3AF" }}> · {member.team}</span> : null}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: "1px solid #E5E7EB" }}>
              <X size={13} style={{ color: "#6B7280" }} />
            </button>
          </div>

          {success ? (
            <div className="px-6 py-8 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                <CheckCircle2 size={26} style={{ color: "#22C55E" }} />
              </div>
              <div>
                <p className="text-[15px] font-bold" style={{ color: "#111111" }}>Task Assigned!</p>
                {success.whatsappSent ? (
                  <p className="text-[13px] mt-1.5 flex items-center justify-center gap-1.5" style={{ color: "#22C55E" }}>
                    <Send size={12} /> WhatsApp sent to {member.name}
                  </p>
                ) : (
                  <p className="text-[12px] mt-1.5" style={{ color: "#9CA3AF" }}>
                    {member.phone ? "WhatsApp notification failed — task still created." : "No phone number — task created without notification."}
                  </p>
                )}
              </div>
              <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-xl text-[13px] font-semibold"
                style={{ background: "rgba(0,0,0,0.04)", color: "#374151", border: "1px solid #E5E7EB" }}>
                Done
              </button>
            </div>
          ) : (
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[12px]"
                style={member.phone
                  ? { background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.15)", color: "#16A34A" }
                  : { background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)", color: "#B45309" }}>
                <Send size={11} className="flex-shrink-0" />
                {member.phone ? <>WhatsApp notification will be sent to <strong>{member.phone}</strong></> : "No phone — task will be assigned without notification"}
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: "#6B7280" }}>Task Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Upload shoot clips to Drive"
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111", fontFamily: "inherit" }} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: "#6B7280" }}>Description <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optional)</span></label>
                <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Add context, links, or instructions…"
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none resize-none"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111", fontFamily: "inherit" }} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: "#6B7280" }}>Due Date <span style={{ color: "#9CA3AF", fontWeight: 400 }}>(optional)</span></label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111", colorScheme: "light", fontFamily: "inherit" }} />
              </div>
              {error && (
                <p className="text-[12px] rounded-xl px-4 py-2.5"
                  style={{ background: "rgba(222,26,26,0.06)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.15)" }}>{error}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: "rgba(0,0,0,0.03)", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                  Cancel
                </button>
                <button onClick={handleAssign} disabled={isPending || !title.trim()}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                  style={{ background: "linear-gradient(135deg, #6366F1, #4F46E5)", color: "#FFFFFF", boxShadow: "0 4px 14px rgba(99,102,241,0.3)" }}>
                  {isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  {isPending ? "Assigning…" : "Assign + Notify"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamClient({ members, pastMembers }: { members: Member[]; pastMembers: Member[] }) {
  const [search, setSearch] = useState("")
  const [tabFilter, setTabFilter] = useState<"ALL" | "active" | "inactive">("ALL")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editMember, setEditMember] = useState<Member | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Member | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const [resetTarget, setResetTarget] = useState<Member | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetError, setResetError] = useState("")
  const [resetSuccess, setResetSuccess] = useState(false)
  const [assignTarget, setAssignTarget] = useState<Member | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return members.filter((m) => {
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.employee_id.toLowerCase().includes(q) || (m.team ?? "").toLowerCase().includes(q)
      const matchStatus = tabFilter === "ALL" || m.status === tabFilter
      return matchSearch && matchStatus
    })
  }, [search, tabFilter, members])

  const stats = {
    total: members.length,
    active: members.filter((m) => m.status === "active").length,
    admins: members.filter((m) => m.role === "ADMIN").length,
    onLeave: 0,
  }

  // Recent activity: last 6 members sorted by created_at desc
  const recentActivity = useMemo(() =>
    [...members].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6),
    [members]
  )

  function handleToggleStatus(member: Member) {
    setOpenDropdown(null)
    const newStatus = member.status === "active" ? "inactive" : "active"
    startTransition(async () => { await toggleMemberStatus(member.id, newStatus) })
  }

  function handleDeleteConfirm() {
    if (!confirmDelete) return
    setDeleteError("")
    startTransition(async () => {
      const result = await deleteMember(confirmDelete.id)
      if (result.success) { setConfirmDelete(null) }
      else { setDeleteError(result.error ?? "Failed to delete member") }
    })
  }

  function handleResetPassword() {
    if (!resetTarget) return
    setResetError("")
    setResetSuccess(false)
    startTransition(async () => {
      const result = await resetMemberPassword(resetTarget.id, resetPassword)
      if (result.success) { setResetSuccess(true); setResetPassword("") }
      else { setResetError(result.error ?? "Failed to reset password") }
    })
  }

  const STAT_CARDS = [
    { label: "Total Members", value: stats.total, sub: "All team members", img: "/brand/member-working.png", bg: "linear-gradient(135deg, #FDF2F8 0%, #FCE7F3 100%)", border: "rgba(236,72,153,0.15)", num: "#EC4899" },
    { label: "Active Members", value: stats.active, sub: "Currently working", img: "/brand/thumbs-up.png", bg: "linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)", border: "rgba(34,197,94,0.15)", num: "#16A34A" },
    { label: "Admins", value: stats.admins, sub: "Admin access", img: "/brand/target-goal.png", bg: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)", border: "rgba(139,92,246,0.15)", num: "#7C3AED" },
    { label: "On Leave", value: stats.onLeave, sub: "Away today", img: "/brand/hourglass.png", bg: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)", border: "rgba(245,158,11,0.15)", num: "#D97706" },
  ]

  return (
    <div className="p-4 md:p-6 xl:p-8 space-y-6 max-w-[1600px]">

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #DE1A1A 0%, #9B1C1C 60%, #450A0A 100%)",
        borderRadius: 20, padding: "22px 28px",
        boxShadow: "0 8px 32px rgba(222,26,26,0.25)",
      }}>
        <div className="flex items-center gap-4 flex-wrap">
          <div style={{ flex: "0 0 auto" }}>
            <h1 className="text-[26px] font-black text-white leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>Team</h1>
            <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>Manage your employees and their access</p>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[220px] max-w-[380px] mx-auto">
            <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "rgba(255,255,255,0.45)" }} />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full rounded-xl pl-9 pr-4 py-2.5 text-[13px] outline-none"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", color: "#FFFFFF", fontFamily: "inherit" }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => { setEditMember(null); setSheetOpen(true) }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all"
              style={{ background: "#FFFFFF", color: "#DE1A1A", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
              <Plus size={14} /> Add Member
            </button>
          </div>
        </div>
      </div>

      {/* ── 4 Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((s) => (
          <div key={s.label} style={{
            background: s.bg, border: `1px solid ${s.border}`, borderRadius: 18,
            padding: "20px 18px 0 22px", overflow: "hidden", position: "relative", minHeight: 148,
          }}>
            {/* Illustration — responsive size */}
            <div className="absolute right-0 bottom-0 w-24 h-24 sm:w-36 sm:h-32 lg:w-[200px] lg:h-[175px] pointer-events-none">
              <Image src={s.img} alt={s.label} fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
            </div>
            {/* Text */}
            <div style={{ position: "relative", zIndex: 1 }} className="max-w-[70%] sm:max-w-[60%] lg:max-w-[55%]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: s.num, opacity: 0.85 }}>{s.label}</p>
              <p className="text-[42px] font-black leading-none mt-1" style={{ fontFamily: "var(--font-jakarta)", color: s.num }}>{s.value}</p>
              <p className="text-[11px] mt-1.5 font-medium" style={{ color: "#6B7280" }}>{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Main 2-column ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] lg:grid-cols-[1fr_300px] gap-5">

        {/* LEFT: Table */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>

          {/* Table header row */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
            <div>
              <h3 className="text-[15px] font-bold" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>Employee Directory</h3>
              <p className="text-[12px]" style={{ color: "#9CA3AF" }}>{filtered.length} of {members.length} members</p>
            </div>
            {/* Tab filters */}
            <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
              {([
                { key: "ALL", label: "All" },
                { key: "active", label: "Active" },
                { key: "inactive", label: "Inactive" },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setTabFilter(key)}
                  className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                  style={tabFilter === key
                    ? { background: "#FFFFFF", color: "#111111", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }
                    : { color: "#9CA3AF" }
                  }>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table className="w-full" style={{ minWidth: 700 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }}>
                  {["Employee", "ID", "Department", "Role", "Status", "Joined", "Action"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em]"
                      style={{ color: "#9CA3AF" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((member, i) => {
                  const tc = teamColor(member.team)
                  return (
                    <tr key={member.id}
                      style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F9FAFB" : "none" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#FAFAFA"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>

                      {/* Employee */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: "rgba(222,26,26,0.08)", border: "1px solid rgba(222,26,26,0.15)" }}>
                            <span className="text-[11px] font-bold" style={{ color: "#de1a1a" }}>{getInitials(member.name)}</span>
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold leading-tight" style={{ color: "#111111" }}>{member.name}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{member.position ?? member.email ?? "—"}</p>
                          </div>
                        </div>
                      </td>

                      {/* ID */}
                      <td className="px-5 py-3.5">
                        <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg"
                          style={{ background: "#F3F4F6", color: "#374151" }}>{member.employee_id}</span>
                      </td>

                      {/* Department */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: tc.bg, color: tc.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: tc.color }} />
                          {teamShort(member.team)}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                          style={member.role === "ADMIN"
                            ? { background: "rgba(139,92,246,0.1)", color: "#7C3AED", border: "1px solid rgba(139,92,246,0.2)" }
                            : { background: "rgba(0,0,0,0.04)", color: "#6B7280", border: "1px solid #E5E7EB" }
                          }>
                          {member.role === "ADMIN" ? <Shield size={9} /> : <User size={9} />}
                          {member.role === "ADMIN" ? "Admin" : "Member"}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                          style={member.status === "active"
                            ? { background: "rgba(34,197,94,0.1)", color: "#16A34A", border: "1px solid rgba(34,197,94,0.2)" }
                            : { background: "#F3F4F6", color: "#9CA3AF", border: "1px solid #E5E7EB" }
                          }>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: member.status === "active" ? "#22C55E" : "#D1D5DB" }} />
                          {member.status === "active" ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* Joined */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays size={10} style={{ color: "#D1D5DB" }} />
                          <span className="text-[12px]" style={{ color: "#6B7280" }}>{formatDate(member.joined_at ?? member.created_at)}</span>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5">
                        <div className="relative flex items-center gap-1">
                          <button onClick={() => { setEditMember(member); setSheetOpen(true) }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                            style={{ background: "rgba(222,26,26,0.07)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.12)" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.14)"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.07)"}>
                            <Pencil size={11} /> Edit
                          </button>

                          <button onClick={() => setAssignTarget(member)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            title="Assign Task"
                            style={{ color: "#6366F1" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.1)"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                            <ClipboardList size={14} />
                          </button>

                          <button onClick={() => setOpenDropdown(openDropdown === member.id ? null : member.id)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            style={{ color: "#9CA3AF" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F3F4F6"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                            <MoreVertical size={14} />
                          </button>

                          {openDropdown === member.id && (
                            <div className="absolute right-0 top-9 w-44 rounded-xl shadow-2xl z-50 overflow-hidden py-1"
                              style={{ background: "#FFFFFF", border: "1px solid #E5E7EB" }}>
                              <button onClick={() => handleToggleStatus(member)} disabled={isPending}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all"
                                style={{ color: member.status === "active" ? "#F59E0B" : "#22C55E" }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F9FAFB"}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                {member.status === "active" ? <><Ban size={12} /> Deactivate</> : <><RotateCcw size={12} /> Reactivate</>}
                              </button>
                              <button onClick={() => { setResetTarget(member); setResetPassword(""); setResetError(""); setResetSuccess(false); setOpenDropdown(null) }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all"
                                style={{ color: "#6366F1" }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F9FAFB"}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                <KeyRound size={12} /> Reset Password
                              </button>
                              <div style={{ borderTop: "1px solid #F3F4F6", margin: "2px 0" }} />
                              <button onClick={() => { setConfirmDelete(member); setOpenDropdown(null) }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all"
                                style={{ color: "#EF4444" }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.05)"}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#F3F4F6" }}>
                          <Search size={18} style={{ color: "#D1D5DB" }} />
                        </div>
                        <p className="text-[13px] font-medium" style={{ color: "#9CA3AF" }}>No members found</p>
                        <p className="text-[12px]" style={{ color: "#D1D5DB" }}>Try adjusting your search or filters</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT panel */}
        <div className="space-y-4">

          {/* Build a stronger team card */}
          <div style={{
            background: "linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4C1D95 100%)",
            borderRadius: 18, overflow: "hidden", position: "relative", minHeight: 220,
            boxShadow: "0 8px 32px rgba(79,46,229,0.25)",
          }}>
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 70% 50%, rgba(139,92,246,0.3) 0%, transparent 65%)" }} />
            <div style={{ position: "absolute", right: 0, bottom: 0, width: 160, height: 170, pointerEvents: "none" }}>
              <Image src="/brand/team-image.png" alt="Team" fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
            </div>
            <div style={{ position: "relative", zIndex: 1, padding: "22px 20px" }}>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full mb-3"
                style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)" }}>
                <Star size={10} style={{ color: "#FCD34D" }} />
                <span className="text-[10px] font-semibold" style={{ color: "rgba(255,255,255,0.8)" }}>Pro Tip</span>
              </div>
              <h3 className="text-[17px] font-black text-white leading-tight mb-2" style={{ fontFamily: "var(--font-jakarta)", maxWidth: "65%" }}>
                Build a stronger team
              </h3>
              <p className="text-[11px] leading-relaxed mb-4" style={{ color: "rgba(255,255,255,0.6)", maxWidth: "65%" }}>
                Assign roles, track progress, and keep your team aligned.
              </p>
              <button
                onClick={() => { setEditMember(null); setSheetOpen(true) }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold transition-all"
                style={{ background: "#FFFFFF", color: "#4C1D95" }}>
                <Plus size={12} /> Add Member
              </button>
            </div>
          </div>

          {/* Team Activity */}
          <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid #F3F4F6" }}>
              <div>
                <h3 className="text-[14px] font-bold" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>Team Activity</h3>
                <p className="text-[11px]" style={{ color: "#9CA3AF" }}>Recent additions</p>
              </div>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(222,26,26,0.08)" }}>
                <Clock size={14} style={{ color: "#de1a1a" }} />
              </div>
            </div>
            <div className="px-5 py-3 space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-center text-[12px] py-6" style={{ color: "#D1D5DB" }}>No team members yet</p>
              ) : (
                recentActivity.map((m) => {
                  const tc = teamColor(m.team)
                  return (
                    <div key={m.id} className="flex items-center gap-3 py-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(222,26,26,0.08)" }}>
                        <span className="text-[10px] font-bold" style={{ color: "#de1a1a" }}>{getInitials(m.name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold truncate" style={{ color: "#111111" }}>{m.name}</p>
                        <p className="text-[10px] truncate" style={{ color: tc.color }}>{teamShort(m.team)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-[10px]" style={{ color: "#9CA3AF" }}>{formatDateShort(m.joined_at ?? m.created_at)}</p>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={m.status === "active"
                            ? { background: "rgba(34,197,94,0.1)", color: "#16A34A" }
                            : { background: "#F3F4F6", color: "#9CA3AF" }}>
                          {m.status}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Past Members ── */}
      {pastMembers.length > 0 && (
        <div>
          <button onClick={() => setShowPast(v => !v)}
            className="flex items-center gap-2 text-[13px] font-semibold mb-3"
            style={{ color: "#6B7280" }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
              style={{ background: "#F3F4F6" }}>
              {showPast ? "▲" : "▼"}
            </span>
            Past Members
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#9CA3AF" }}>
              {pastMembers.length}
            </span>
          </button>

          {showPast && (
            <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }}>
                    {["Employee", "ID", "Team", "Role", "Left On"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em]"
                        style={{ color: "#D1D5DB" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pastMembers.map((m, i) => (
                    <tr key={m.id} style={{ borderBottom: i < pastMembers.length - 1 ? "1px solid #F9FAFB" : "none", opacity: 0.65 }}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: "#F3F4F6" }}>
                            <span className="text-[10px] font-bold" style={{ color: "#9CA3AF" }}>{getInitials(m.name)}</span>
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold" style={{ color: "#6B7280" }}>{m.name}</p>
                            <p className="text-[11px]" style={{ color: "#D1D5DB" }}>{m.email ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><span className="text-[12px] font-mono px-2 py-0.5 rounded" style={{ background: "#F3F4F6", color: "#9CA3AF" }}>{m.employee_id}</span></td>
                      <td className="px-5 py-3"><span className="text-[12px]" style={{ color: "#D1D5DB" }}>{m.team ?? "—"}</span></td>
                      <td className="px-5 py-3"><span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#9CA3AF" }}>{m.role}</span></td>
                      <td className="px-5 py-3"><span className="text-[12px]" style={{ color: "#D1D5DB" }}>{m.deleted_at ? formatDate(m.deleted_at) : "—"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Bottom Productivity Banner ── */}
      <div style={{
        background: "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)",
        borderRadius: 20, overflow: "hidden", position: "relative",
        boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 20% 50%, rgba(222,26,26,0.12) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(99,102,241,0.1) 0%, transparent 50%)" }} />

        {/* Boy with laptop illustration */}
        <div className="absolute right-4 bottom-0 hidden sm:block pointer-events-none" style={{ width: 240, height: 220 }}>
          <Image src="/brand/boy-laptop.png" alt="Productivity" fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
        </div>

        <div style={{ position: "relative", zIndex: 1, padding: "24px 28px" }}>
          <div className="flex items-start gap-6 flex-wrap sm:pr-56 lg:pr-64 xl:pr-72">
            <div>
              <h2 className="text-[22px] font-black text-white leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>
                Happy Team,<br />Productive Team!
              </h2>
              <p className="text-[12px] mt-2" style={{ color: "rgba(255,255,255,0.5)" }}>Your team is performing great this month</p>
            </div>

            <div className="flex items-center gap-8 flex-wrap">
              {[
                { label: "Team Happiness", value: "98%", icon: <Star size={14} style={{ color: "#FCD34D" }} />, color: "#FCD34D" },
                { label: "Task Completion", value: "85%", icon: <CheckCircle2 size={14} style={{ color: "#34D399" }} />, color: "#34D399" },
                { label: "On-time Delivery", value: "92%", icon: <TrendingUp size={14} style={{ color: "#60A5FA" }} />, color: "#60A5FA" },
                { label: "Active Members", value: `${stats.active}/${stats.total}`, icon: <UserCheck size={14} style={{ color: "#F9A8D4" }} />, color: "#F9A8D4" },
              ].map(({ label, value, icon, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                    {icon}
                  </div>
                  <div>
                    <p className="text-[20px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.45)" }}>{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {openDropdown && <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />}

      {/* ── Delete confirmation modal ── */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={() => setConfirmDelete(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-[380px] rounded-2xl shadow-2xl flex flex-col"
              style={{ background: "#FFFFFF", border: "1px solid rgba(222,26,26,0.2)" }}>
              <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(222,26,26,0.1)", border: "1px solid rgba(222,26,26,0.2)" }}>
                  <AlertTriangle size={22} style={{ color: "#de1a1a" }} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold" style={{ color: "#111111" }}>Delete Member</h3>
                  <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "#6B7280" }}>
                    This will permanently delete <strong style={{ color: "#111111" }}>{confirmDelete.name}</strong> and remove their login access.
                  </p>
                </div>
                {deleteError && (
                  <p className="text-[12px] rounded-xl px-4 py-2.5 w-full"
                    style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}>{deleteError}</p>
                )}
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => { setConfirmDelete(null); setDeleteError("") }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                  Cancel
                </button>
                <button onClick={handleDeleteConfirm} disabled={isPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#FFFFFF" }}>
                  {isPending && <Loader2 size={13} className="animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Reset Password modal ── */}
      {resetTarget && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={() => { setResetTarget(null); setResetSuccess(false) }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-[380px] rounded-2xl shadow-2xl"
              style={{ background: "#FFFFFF", border: "1px solid rgba(99,102,241,0.2)" }}>
              <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                  <KeyRound size={20} style={{ color: "#6366F1" }} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold" style={{ color: "#111111" }}>Reset Password</h3>
                  <p className="text-[13px] mt-1" style={{ color: "#6B7280" }}>
                    Set a new password for <strong style={{ color: "#111111" }}>{resetTarget.name}</strong>
                  </p>
                </div>
              </div>

              {resetSuccess ? (
                <div className="px-6 pb-6 flex flex-col items-center gap-4">
                  <div className="w-full rounded-xl px-4 py-3 text-center text-[13px] font-semibold"
                    style={{ background: "rgba(34,197,94,0.08)", color: "#16A34A", border: "1px solid rgba(34,197,94,0.2)" }}>
                    Password reset successfully!
                  </div>
                  <button onClick={() => { setResetTarget(null); setResetSuccess(false) }}
                    className="w-full py-2.5 rounded-xl text-[13px] font-semibold"
                    style={{ background: "#F9FAFB", color: "#374151", border: "1px solid #E5E7EB" }}>
                    Close
                  </button>
                </div>
              ) : (
                <div className="px-6 pb-6 space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#6B7280" }}>New Password</label>
                    <input type="password" placeholder="Min. 6 characters" value={resetPassword}
                      onChange={e => setResetPassword(e.target.value)}
                      className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none"
                      style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }} />
                  </div>
                  {resetError && (
                    <p className="text-[12px] px-3 py-2 rounded-lg"
                      style={{ background: "rgba(222,26,26,0.06)", color: "#de1a1a" }}>{resetError}</p>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setResetTarget(null); setResetError(""); setResetPassword("") }}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                      style={{ background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                      Cancel
                    </button>
                    <button onClick={handleResetPassword} disabled={isPending || !resetPassword}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #6366F1, #4F46E5)", color: "#FFFFFF" }}>
                      {isPending && <Loader2 size={13} className="animate-spin" />}
                      Reset Password
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {assignTarget && <AssignTaskModal member={assignTarget} onClose={() => setAssignTarget(null)} />}

      <MemberSheet key={editMember?.id ?? "add"} open={sheetOpen} onClose={() => setSheetOpen(false)} member={editMember} />
    </div>
  )
}
