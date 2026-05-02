"use client"

import { useState, useMemo, useTransition } from "react"
import {
  Search, Plus, Users, Shield, UserCheck, UserX,
  MoreVertical, Phone, CalendarDays, X, Pencil,
  Ban, RotateCcw, User, Loader2, Trash2, AlertTriangle, ChevronDown,
} from "lucide-react"
import { createMember, updateMember, toggleMemberStatus, deleteMember } from "@/lib/actions/team"

const TEAMS = [
  "Media Team",
  "Tech & Operation Team",
  "Tech & Media Team",
  "Freelancing",
  "Script Team",
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
  created_at: string
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

const FIELD: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  color: "#FFFFFF",
  width: "100%",
  borderRadius: "10px",
  padding: "11px 14px",
  fontSize: "13px",
  outline: "none",
  fontFamily: "inherit",
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
    password: "",
  })
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      const result = isEdit
        ? await updateMember({ id: member!.id, name: form.name, email: form.email, phone: form.phone, role: form.role, team: form.team })
        : await createMember({ name: form.name, employee_id: form.employee_id, email: form.email, phone: form.phone, role: form.role, team: form.team, password: form.password })

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
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[420px] z-50 shadow-2xl flex flex-col"
        style={{ background: "#111111", borderLeft: "1px solid rgba(220,38,38,0.15)" }}>

        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div>
            <h2 className="text-[17px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
              {isEdit ? "Edit Member" : "Add New Member"}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              {isEdit ? "Update member details" : "Create a new team member account"}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-white/5"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

          <style>{`.sheet-input::placeholder{color:rgba(255,255,255,0.22)}.sheet-input:focus{border-color:rgba(220,38,38,0.4)!important}`}</style>

          {/* Full Name */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2"
              style={{ color: "rgba(255,255,255,0.3)" }}>Full Name *</label>
            <input className="sheet-input" value={form.name} onChange={set("name")} placeholder="e.g. Priya Sharma" style={FIELD} />
          </div>

          {/* Employee ID */}
          {!isEdit && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2"
                style={{ color: "rgba(255,255,255,0.3)" }}>Employee ID *</label>
              <input className="sheet-input" value={form.employee_id} onChange={set("employee_id")} placeholder="e.g. GF002" style={FIELD} />
              <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.22)" }}>Unique ID — cannot be changed later.</p>
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2"
              style={{ color: "rgba(255,255,255,0.3)" }}>Email Address *</label>
            <input type="email" className="sheet-input" value={form.email} onChange={set("email")} placeholder="e.g. priya@gmail.com" style={FIELD} />
            <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.22)" }}>Used for account creation.</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2"
              style={{ color: "rgba(255,255,255,0.3)" }}>WhatsApp Number</label>
            <input className="sheet-input" value={form.phone} onChange={set("phone")} placeholder="e.g. 919876543210" style={FIELD} />
            <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.22)" }}>Credentials will be sent here after account creation.</p>
          </div>

          {/* Team */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2"
              style={{ color: "rgba(255,255,255,0.3)" }}>Team *</label>
            <div className="relative">
              <select className="sheet-input" value={form.team} onChange={set("team")}
                style={{ ...FIELD, appearance: "none", paddingRight: "36px", colorScheme: "dark" }}>
                <option value="">Select a team…</option>
                {TEAMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "rgba(255,255,255,0.3)" }} />
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2"
              style={{ color: "rgba(255,255,255,0.3)" }}>Role *</label>
            <div className="flex gap-3">
              {(["MEMBER", "ADMIN"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setForm((prev) => ({ ...prev, role: r }))}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                  style={form.role === r
                    ? { background: "linear-gradient(135deg, #DC2626, #7F1D1D)", color: "#FFFFFF", border: "1px solid rgba(220,38,38,0.3)" }
                    : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }
                  }>
                  {r === "ADMIN" ? "Admin" : "Member"}
                </button>
              ))}
            </div>
          </div>

          {/* Password */}
          {!isEdit && (
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2"
                style={{ color: "rgba(255,255,255,0.3)" }}>Temporary Password *</label>
              <input type="text" className="sheet-input" value={form.password} onChange={set("password")}
                placeholder="Min 6 characters" style={FIELD} />
              <p className="text-[11px] mt-1.5" style={{ color: "rgba(255,255,255,0.22)" }}>Will be sent via WhatsApp.</p>
            </div>
          )}

          {error && (
            <p className="text-[12px] rounded-xl px-4 py-3"
              style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }}>{error}</p>
          )}
        </div>

        <div className="px-6 py-4 flex items-center gap-3 flex-shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={onClose}
            className="flex-1 py-3 rounded-xl text-[13px] font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isPending}
            className="flex-1 py-3 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
            style={{ background: "linear-gradient(135deg, #DC2626, #7F1D1D)", color: "#FFFFFF", boxShadow: "0 4px 16px rgba(220,38,38,0.25)" }}>
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
          <h1 className="text-[30px] leading-tight font-black"
            style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>Team</h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>Manage your employees and their access</p>
        </div>
        <button onClick={() => { setEditMember(null); setSheetOpen(true) }}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all"
          style={{ background: "linear-gradient(135deg, #DC2626, #7F1D1D)", color: "#FFFFFF", boxShadow: "0 4px 16px rgba(220,38,38,0.25)" }}>
          <Plus size={15} /> Add Member
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Members", value: stats.total,    Icon: Users,      color: "#FFFFFF",  bg: "rgba(255,255,255,0.06)",  border: "rgba(255,255,255,0.08)" },
          { label: "Active",        value: stats.active,   Icon: UserCheck,  color: "#22C55E",  bg: "rgba(34,197,94,0.08)",    border: "rgba(34,197,94,0.15)"   },
          { label: "Admins",        value: stats.admins,   Icon: Shield,     color: "#DC2626",  bg: "rgba(220,38,38,0.08)",    border: "rgba(220,38,38,0.15)"   },
          { label: "Inactive",      value: stats.inactive, Icon: UserX,      color: "rgba(255,255,255,0.35)", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.06)" },
        ].map(({ label, value, Icon, color, bg, border }) => (
          <div key={label} className="rounded-xl px-5 py-4 flex items-center gap-4"
            style={{ background: "#111111", border: `1px solid ${border}` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: bg }}>
              <Icon size={17} style={{ color }} />
            </div>
            <div>
              <p className="text-[28px] leading-none font-black"
                style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-[360px]">
          <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "rgba(255,255,255,0.3)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or ID…"
            className="w-full rounded-xl pl-9 pr-4 py-2.5 text-[13px] outline-none"
            style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.08)", color: "#FFFFFF" }} />
          <style>{`.search-input::placeholder{color:rgba(255,255,255,0.25)}`}</style>
        </div>

        <div className="flex items-center gap-1 rounded-xl p-1"
          style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.08)" }}>
          {(["ALL", "MEMBER", "ADMIN"] as const).map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
              style={roleFilter === r
                ? { background: "rgba(220,38,38,0.15)", color: "#DC2626" }
                : { color: "rgba(255,255,255,0.35)" }
              }>
              {r === "ALL" ? "All Roles" : r === "MEMBER" ? "Members" : "Admins"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-xl p-1"
          style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.08)" }}>
          {(["ALL", "active", "inactive"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
              style={statusFilter === s
                ? { background: "rgba(220,38,38,0.15)", color: "#DC2626" }
                : { color: "rgba(255,255,255,0.35)" }
              }>
              {s === "ALL" ? "All" : s === "active" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>
          {filtered.length} of {members.length} members
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden"
        style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
              {["Employee", "ID", "Team", "Role", "Phone", "Status", "Joined", ""].map((h) => (
                <th key={h} className="text-left px-5 py-3.5 text-[10px] font-bold uppercase tracking-[0.18em] last:w-12"
                  style={{ color: "rgba(255,255,255,0.3)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((member, i) => (
              <tr key={member.id}
                style={{ borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>

                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}>
                      <span className="text-[11px] font-bold"
                        style={{ fontFamily: "var(--font-jakarta)", color: "#DC2626" }}>{getInitials(member.name)}</span>
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold leading-tight" style={{ color: "#FFFFFF" }}>{member.name}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{member.email ?? "—"}</p>
                    </div>
                  </div>
                </td>

                <td className="px-5 py-3.5">
                  <span className="text-[12px] font-mono font-medium px-2.5 py-1 rounded-lg"
                    style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)" }}>
                    {member.employee_id}
                  </span>
                </td>

                <td className="px-5 py-3.5">
                  <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.55)" }}>{member.team ?? "—"}</span>
                </td>

                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                    style={member.role === "ADMIN"
                      ? { background: "rgba(220,38,38,0.1)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }
                      : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }
                    }>
                    {member.role === "ADMIN" ? <Shield size={9} /> : <User size={9} />}
                    {member.role}
                  </span>
                </td>

                <td className="px-5 py-3.5">
                  <p className="text-[12px] flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                    <Phone size={9} style={{ color: "rgba(255,255,255,0.25)" }} />
                    {member.phone ?? "—"}
                  </p>
                </td>

                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full"
                    style={member.status === "active"
                      ? { background: "rgba(34,197,94,0.1)", color: "#22C55E", border: "1px solid rgba(34,197,94,0.2)" }
                      : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.06)" }
                    }>
                    <span className="w-1.5 h-1.5 rounded-full"
                      style={{ background: member.status === "active" ? "#22C55E" : "rgba(255,255,255,0.25)" }} />
                    {member.status === "active" ? "Active" : "Inactive"}
                  </span>
                </td>

                <td className="px-5 py-3.5">
                  <p className="text-[12px] flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                    <CalendarDays size={10} />
                    {formatDate(member.created_at)}
                  </p>
                </td>

                <td className="px-4 py-3.5">
                  <div className="relative flex justify-end">
                    <button onClick={() => setOpenDropdown(openDropdown === member.id ? null : member.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                      style={{ color: "rgba(255,255,255,0.3)" }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                      <MoreVertical size={14} />
                    </button>

                    {openDropdown === member.id && (
                      <div className="absolute right-0 top-9 w-44 rounded-xl shadow-2xl z-20 overflow-hidden py-1"
                        style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.08)" }}>
                        <button onClick={() => { setEditMember(member); setSheetOpen(true); setOpenDropdown(null) }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all"
                          style={{ color: "rgba(255,255,255,0.7)" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                          <Pencil size={12} style={{ color: "rgba(255,255,255,0.35)" }} /> Edit
                        </button>
                        <button onClick={() => handleToggleStatus(member)} disabled={isPending}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all"
                          style={{ color: member.status === "active" ? "#F59E0B" : "#22C55E" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                          {member.status === "active" ? <><Ban size={12} /> Deactivate</> : <><RotateCcw size={12} /> Reactivate</>}
                        </button>
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "2px 0" }} />
                        <button onClick={() => { setConfirmDelete(member); setOpenDropdown(null) }}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all"
                          style={{ color: "#FF6B57" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,107,87,0.06)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
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
                <td colSpan={8} className="px-5 py-16 text-center">
                  <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.25)" }}>No members found</p>
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
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
            onClick={() => setConfirmDelete(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-[380px] rounded-2xl shadow-2xl flex flex-col"
              style={{ background: "#111111", border: "1px solid rgba(220,38,38,0.2)" }}>
              <div className="px-6 pt-6 pb-4 flex flex-col items-center text-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}>
                  <AlertTriangle size={22} style={{ color: "#DC2626" }} />
                </div>
                <div>
                  <h3 className="text-[16px] font-bold" style={{ color: "#FFFFFF" }}>Delete Member</h3>
                  <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
                    This will permanently delete <strong style={{ color: "#FFFFFF" }}>{confirmDelete.name}</strong> and remove their login access.
                  </p>
                </div>
                {deleteError && (
                  <p className="text-[12px] rounded-xl px-4 py-2.5 w-full"
                    style={{ background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.2)" }}>
                    {deleteError}
                  </p>
                )}
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button onClick={() => { setConfirmDelete(null); setDeleteError("") }}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  Cancel
                </button>
                <button onClick={handleDeleteConfirm} disabled={isPending}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
                  style={{ background: "linear-gradient(135deg, #DC2626, #7F1D1D)", color: "#FFFFFF" }}>
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
