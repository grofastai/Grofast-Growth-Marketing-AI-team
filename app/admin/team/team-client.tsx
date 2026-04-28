"use client"

import { useState, useMemo, useTransition } from "react"
import {
  Search, Plus, Users, Shield, UserCheck, UserX,
  MoreVertical, Phone, CalendarDays, X, Pencil,
  Ban, RotateCcw, User, Loader2, Trash2, AlertTriangle,
} from "lucide-react"
import { createMember, updateMember, toggleMemberStatus, deleteMember } from "@/lib/actions/team"

interface Member {
  id: string
  name: string
  employee_id: string
  role: "ADMIN" | "MEMBER"
  email: string | null
  phone: string | null
  status: "active" | "inactive"
  created_at: string
}

const AVATAR_PALETTE = [
  "bg-brand-soft text-brand",
  "bg-success-bg text-success",
  "bg-warning-bg text-warning",
  "bg-[#0A1628] text-[#60A5FA]",
  "bg-accent-soft text-accent",
  "bg-primary-soft text-[#4AADAD]",
]

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function avatarColor(id: string) {
  const num = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_PALETTE[num % AVATAR_PALETTE.length]
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
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
    password: "",
  })
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = isEdit
        ? await updateMember({ id: member!.id, name: form.name, email: form.email, phone: form.phone, role: form.role })
        : await createMember({ name: form.name, employee_id: form.employee_id, email: form.email, phone: form.phone, role: form.role, password: form.password })

      if (result.success) {
        onClose()
      } else {
        setError(result.error ?? "Something went wrong")
      }
    })
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] z-50 shadow-2xl flex flex-col" style={{ background: "#111827", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <h2 className="text-[17px]" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 700, color: "#E6EDF3" }}>
              {isEdit ? "Edit Member" : "Add New Member"}
            </h2>
            <p className="text-[12px] font-sans mt-0.5" style={{ color: "#6B7280" }}>
              {isEdit ? "Update member details" : "Create a new team member account"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
            <X size={15} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          {/* Full Name */}
          <div>
            <label className="block text-[11px] font-semibold font-sans uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>Full Name *</label>
            <input value={form.name} onChange={set("name")} placeholder="e.g. Priya Sharma"
              className="w-full rounded-xl px-4 py-3 text-[13px] font-sans outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#E6EDF3" }} />
          </div>

          {/* Employee ID */}
          {!isEdit && (
            <div>
              <label className="block text-[11px] font-semibold font-sans uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>Employee ID *</label>
              <input value={form.employee_id} onChange={set("employee_id")} placeholder="e.g. GF002"
                className="w-full rounded-xl px-4 py-3 text-[13px] font-sans outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#E6EDF3" }} />
              <p className="text-[11px] font-sans mt-1" style={{ color: "#6B7280" }}>Unique ID. Cannot be changed later.</p>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-[11px] font-semibold font-sans uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>Email Address *</label>
            <input type="email" value={form.email} onChange={set("email")} placeholder="e.g. priya@gmail.com"
              className="w-full rounded-xl px-4 py-3 text-[13px] font-sans outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#E6EDF3" }} />
            <p className="text-[11px] font-sans mt-1" style={{ color: "#6B7280" }}>Used for account creation (not shown on login page).</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-[11px] font-semibold font-sans uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>Phone</label>
            <input value={form.phone} onChange={set("phone")} placeholder="e.g. 919876543210"
              className="w-full rounded-xl px-4 py-3 text-[13px] font-sans outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#E6EDF3" }} />
          </div>

          {/* Role */}
          <div>
            <label className="block text-[11px] font-semibold font-sans uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>Role *</label>
            <div className="flex gap-3">
              {(["MEMBER", "ADMIN"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setForm((prev) => ({ ...prev, role: r }))}
                  className="flex-1 py-3 rounded-xl text-[13px] font-semibold font-sans transition-all"
                  style={form.role === r
                    ? { background: "linear-gradient(135deg, #6D5DF6, #5547D4)", color: "#fff", border: "1px solid #6D5DF6" }
                    : { background: "rgba(255,255,255,0.04)", color: "#9CA3AF", border: "1px solid rgba(255,255,255,0.1)" }
                  }>
                  {r === "ADMIN" ? "Admin" : "Member"}
                </button>
              ))}
            </div>
          </div>

          {/* Temporary Password */}
          {!isEdit && (
            <div>
              <label className="block text-[11px] font-semibold font-sans uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>Temporary Password *</label>
              <input type="password" value={form.password} onChange={set("password")} placeholder="Min 6 characters"
                className="w-full rounded-xl px-4 py-3 text-[13px] font-sans outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#E6EDF3" }} />
              <p className="text-[11px] font-sans mt-1" style={{ color: "#6B7280" }}>Share this with the employee. They can change it after logging in.</p>
            </div>
          )}

          {error && (
            <p className="text-[12px] font-sans rounded-xl px-4 py-3" style={{ background: "rgba(255,107,87,0.1)", color: "#FF6B57", border: "1px solid rgba(255,107,87,0.2)" }}>{error}</p>
          )}
        </div>

        <div className="px-6 py-4 flex items-center gap-3 flex-shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl text-[13px] font-semibold font-sans transition-all"
            style={{ background: "rgba(255,255,255,0.06)", color: "#9CA3AF", border: "1px solid rgba(255,255,255,0.1)" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isPending}
            className="flex-1 py-3 rounded-xl text-[13px] font-semibold font-sans text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
            style={{ background: "linear-gradient(135deg, #6D5DF6, #5547D4)", boxShadow: "0 4px 16px rgba(109,93,246,0.3)" }}>
            {isPending && <Loader2 size={13} className="animate-spin" />}
            {isEdit ? "Save Changes" : "Add Member"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamClient({ members }: { members: Member[] }) {
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "MEMBER">("ALL")
  const [statusFilter, setStatusFilter] = useState<"ALL" | "active" | "inactive">("ALL")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editMember, setEditMember] = useState<Member | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Member | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return members.filter((m) => {
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.employee_id.toLowerCase().includes(q)
      const matchRole = roleFilter === "ALL" || m.role === roleFilter
      const matchStatus = statusFilter === "ALL" || m.status === statusFilter
      return matchSearch && matchRole && matchStatus
    })
  }, [search, roleFilter, statusFilter, members])

  const stats = {
    total: members.length,
    active: members.filter((m) => m.status === "active").length,
    admins: members.filter((m) => m.role === "ADMIN").length,
    inactive: members.filter((m) => m.status === "inactive").length,
  }

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
      if (result.success) {
        setConfirmDelete(null)
      } else {
        setDeleteError(result.error ?? "Failed to delete member")
      }
    })
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[38px] leading-tight text-ink" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800 }}>Team</h1>
          <p className="text-ink-muted font-sans text-sm mt-1.5">Manage your employees and their access</p>
        </div>
        <button onClick={() => { setEditMember(null); setSheetOpen(true) }}
          className="flex items-center gap-2 bg-brand text-white px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans hover:bg-brand-dark transition-colors mt-2 shadow-sm shadow-brand/20">
          <Plus size={15} /> Add Member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total Members", value: stats.total, Icon: Users, color: "text-ink", bg: "bg-cream-dark" },
          { label: "Active", value: stats.active, Icon: UserCheck, color: "text-success", bg: "bg-success-bg" },
          { label: "Admins", value: stats.admins, Icon: Shield, color: "text-brand", bg: "bg-brand-soft" },
          { label: "Inactive", value: stats.inactive, Icon: UserX, color: "text-ink-muted", bg: "bg-cream-dark" },
        ].map(({ label, value, Icon, color, bg }) => (
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
        <div className="relative flex-1 min-w-[240px] max-w-[360px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or ID…"
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-[13px] font-sans text-ink placeholder:text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand/20 transition-all" />
        </div>
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          {(["ALL", "MEMBER", "ADMIN"] as const).map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold font-sans transition-all ${roleFilter === r ? "bg-brand text-white shadow-sm" : "text-ink-muted hover:text-ink"}`}>
              {r === "ALL" ? "All Roles" : r === "MEMBER" ? "Members" : "Admins"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          {(["ALL", "active", "inactive"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold font-sans transition-all ${statusFilter === s ? "bg-brand text-white shadow-sm" : "text-ink-muted hover:text-ink"}`}>
              {s === "ALL" ? "All" : s === "active" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[12px] text-ink-muted font-sans">{filtered.length} of {members.length} members</span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-cream/50">
              {["Employee", "ID", "Role", "Phone", "Status", "Joined", ""].map((h) => (
                <th key={h} className="text-left px-5 py-3.5 text-[10px] font-semibold font-sans text-ink-muted uppercase tracking-widest last:w-12">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((member) => (
              <tr key={member.id} className="hover:bg-cream/30 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${avatarColor(member.id)}`}>
                      <span className="text-[11px]" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 700 }}>{getInitials(member.name)}</span>
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold font-sans text-ink leading-tight">{member.name}</p>
                      <p className="text-[11px] text-ink-muted font-sans mt-0.5">{member.email ?? "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-[12px] font-mono font-medium text-ink-2 bg-cream px-2.5 py-1 rounded-lg">{member.employee_id}</span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold font-sans px-2.5 py-1 rounded-full ${member.role === "ADMIN" ? "bg-brand-soft text-brand" : "bg-cream-dark text-ink-2"}`}>
                    {member.role === "ADMIN" ? <Shield size={9} /> : <User size={9} />}
                    {member.role}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-[12px] font-sans text-ink-2 flex items-center gap-1.5">
                    <Phone size={9} className="text-ink-muted flex-shrink-0" />
                    {member.phone ?? "—"}
                  </p>
                </td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold font-sans px-2.5 py-1 rounded-full ${member.status === "active" ? "bg-success-bg text-success" : "bg-cream-dark text-ink-muted"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${member.status === "active" ? "bg-success" : "bg-ink-muted/50"}`} />
                    {member.status === "active" ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <p className="text-[12px] font-sans text-ink-muted flex items-center gap-1.5">
                    <CalendarDays size={10} className="flex-shrink-0" />
                    {formatDate(member.created_at)}
                  </p>
                </td>
                <td className="px-4 py-3.5">
                  <div className="relative flex justify-end">
                    <button onClick={() => setOpenDropdown(openDropdown === member.id ? null : member.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-cream transition-colors">
                      <MoreVertical size={14} className="text-ink-muted" />
                    </button>
                    {openDropdown === member.id && (
                      <div className="absolute right-0 top-9 w-40 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden py-1">
                        <button onClick={() => { setEditMember(member); setSheetOpen(true); setOpenDropdown(null) }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-sans text-ink hover:bg-cream transition-colors">
                          <Pencil size={12} className="text-ink-muted" /> Edit
                        </button>
                        <button onClick={() => handleToggleStatus(member)} disabled={isPending}
                          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-sans transition-colors ${member.status === "active" ? "text-warning hover:bg-warning-bg" : "text-success hover:bg-success-bg"}`}>
                          {member.status === "active" ? <><Ban size={12} /> Deactivate</> : <><RotateCcw size={12} /> Reactivate</>}
                        </button>
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "2px 0" }} />
                        <button onClick={() => { setConfirmDelete(member); setOpenDropdown(null) }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-sans text-red-400 hover:bg-red-500/10 transition-colors">
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-16 text-center">
                  <p className="text-ink-muted font-sans text-[13px]">No members found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {openDropdown && <div className="fixed inset-0 z-10" onClick={() => setOpenDropdown(null)} />}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40" onClick={() => setConfirmDelete(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-[380px] rounded-2xl shadow-2xl flex flex-col" style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)" }}>
                  <AlertTriangle size={22} style={{ color: "#EF4444" }} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold font-sans" style={{ color: "#E6EDF3" }}>Delete Member</h3>
                  <p className="text-[13px] font-sans mt-1" style={{ color: "#6B7280" }}>
                    This will permanently delete <strong style={{ color: "#E6EDF3" }}>{confirmDelete.name}</strong> and remove their login access. This cannot be undone.
                  </p>
                </div>
                {deleteError && (
                  <p className="text-[12px] font-sans rounded-xl px-4 py-2.5 w-full" style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>{deleteError}</p>
                )}
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => { setConfirmDelete(null); setDeleteError("") }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold font-sans transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#9CA3AF", border: "1px solid rgba(255,255,255,0.1)" }}>
                  Cancel
                </button>
                <button onClick={handleDeleteConfirm} disabled={isPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
                  style={{ background: "linear-gradient(135deg, #EF4444, #DC2626)" }}>
                  {isPending && <Loader2 size={13} className="animate-spin" />}
                  Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <MemberSheet key={editMember?.id ?? "add"} open={sheetOpen} onClose={() => setSheetOpen(false)} member={editMember} />
    </div>
  )
}
