"use client"

import { useState, useMemo } from "react"
import {
  Search,
  Plus,
  Users,
  Shield,
  UserCheck,
  UserX,
  MoreVertical,
  Mail,
  Phone,
  CalendarDays,
  X,
  Pencil,
  Ban,
  RotateCcw,
  User,
} from "lucide-react"

interface Member {
  id: string
  name: string
  employee_id: string
  role: "ADMIN" | "MEMBER"
  email: string
  phone: string
  status: "active" | "inactive"
  joined: string
}

const mockMembers: Member[] = [
  { id: "1", name: "Priya Sharma", employee_id: "EMP001", role: "MEMBER", email: "priya@grofast.in", phone: "+91 98765 43210", status: "active", joined: "2024-01-15" },
  { id: "2", name: "Rahul Mehta", employee_id: "EMP002", role: "MEMBER", email: "rahul@grofast.in", phone: "+91 87654 32109", status: "active", joined: "2024-02-20" },
  { id: "3", name: "Anita Roy", employee_id: "EMP003", role: "MEMBER", email: "anita@grofast.in", phone: "+91 76543 21098", status: "active", joined: "2024-03-10" },
  { id: "4", name: "Dev Kapoor", employee_id: "EMP004", role: "MEMBER", email: "dev@grofast.in", phone: "+91 65432 10987", status: "active", joined: "2024-04-05" },
  { id: "5", name: "Sneha Nair", employee_id: "EMP005", role: "MEMBER", email: "sneha@grofast.in", phone: "+91 54321 09876", status: "inactive", joined: "2023-11-20" },
  { id: "6", name: "Vikram Singh", employee_id: "EMP006", role: "ADMIN", email: "vikram@grofast.in", phone: "+91 43210 98765", status: "active", joined: "2023-09-01" },
  { id: "7", name: "Kavya Reddy", employee_id: "EMP007", role: "MEMBER", email: "kavya@grofast.in", phone: "+91 32109 87654", status: "active", joined: "2024-05-15" },
  { id: "8", name: "Arjun Patel", employee_id: "EMP008", role: "MEMBER", email: "arjun@grofast.in", phone: "+91 21098 76543", status: "active", joined: "2024-06-01" },
]

const AVATAR_PALETTE = [
  "bg-brand-soft text-brand",
  "bg-success-bg text-success",
  "bg-warning-bg text-warning",
  "bg-[#eff6ff] text-blue-700",
  "bg-[#fdf4ff] text-purple-700",
  "bg-[#fff1f2] text-rose-700",
]

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function avatarColor(id: string) {
  return AVATAR_PALETTE[parseInt(id, 10) % AVATAR_PALETTE.length]
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

// ── Add / Edit sheet ──────────────────────────────────────────────────────────

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
    role: member?.role ?? ("MEMBER" as "ADMIN" | "MEMBER"),
    password: "",
  })

  const set =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }))

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-ink/25 backdrop-blur-[2px] z-40"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-[420px] bg-card z-50 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between flex-shrink-0">
          <div>
            <h2
              className="text-ink text-[17px]"
              style={{ fontFamily: "var(--font-syne)", fontWeight: 700 }}
            >
              {isEdit ? "Edit Member" : "Add New Member"}
            </h2>
            <p className="text-[12px] text-ink-muted font-sans mt-0.5">
              {isEdit ? "Update member details" : "Invite a new team member"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-cream transition-colors"
          >
            <X size={15} className="text-ink-muted" />
          </button>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Full Name *
            </label>
            <input
              value={form.name}
              onChange={set("name")}
              placeholder="e.g. Priya Sharma"
              className="w-full bg-cream rounded-xl px-4 py-3 text-[13px] font-sans text-ink placeholder:text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Employee ID *
            </label>
            <input
              value={form.employee_id}
              onChange={set("employee_id")}
              placeholder="e.g. EMP009"
              className="w-full bg-cream rounded-xl px-4 py-3 text-[13px] font-sans text-ink placeholder:text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Email Address *
            </label>
            <input
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="e.g. priya@company.com"
              className="w-full bg-cream rounded-xl px-4 py-3 text-[13px] font-sans text-ink placeholder:text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Phone
            </label>
            <input
              value={form.phone}
              onChange={set("phone")}
              placeholder="e.g. +91 98765 43210"
              className="w-full bg-cream rounded-xl px-4 py-3 text-[13px] font-sans text-ink placeholder:text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
              Role *
            </label>
            <div className="flex gap-3">
              {(["MEMBER", "ADMIN"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, role: r }))}
                  className={`flex-1 py-3 rounded-xl text-[13px] font-semibold font-sans border transition-all ${
                    form.role === r
                      ? "bg-brand border-brand text-white"
                      : "bg-cream border-cream-dark text-ink hover:border-brand/40"
                  }`}
                >
                  {r === "ADMIN" ? "Admin" : "Member"}
                </button>
              ))}
            </div>
          </div>

          {!isEdit && (
            <div>
              <label className="block text-[11px] font-semibold font-sans text-ink-2 uppercase tracking-wider mb-1.5">
                Temporary Password *
              </label>
              <input
                type="password"
                value={form.password}
                onChange={set("password")}
                placeholder="Set a temporary password"
                className="w-full bg-cream rounded-xl px-4 py-3 text-[13px] font-sans text-ink placeholder:text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:bg-white transition-all"
              />
              <p className="text-[11px] text-ink-muted font-sans mt-1.5">
                The member can change this after first login.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-cream text-ink text-[13px] font-semibold font-sans hover:bg-cream-dark transition-colors"
          >
            Cancel
          </button>
          <button className="flex-1 py-3 rounded-xl bg-brand text-white text-[13px] font-semibold font-sans hover:bg-brand-dark transition-colors shadow-sm shadow-brand/20">
            {isEdit ? "Save Changes" : "Add Member"}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamPage() {
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "MEMBER">("ALL")
  const [statusFilter, setStatusFilter] = useState<"ALL" | "active" | "inactive">("ALL")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editMember, setEditMember] = useState<Member | null>(null)
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return mockMembers.filter((m) => {
      const matchSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.employee_id.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q)
      const matchRole = roleFilter === "ALL" || m.role === roleFilter
      const matchStatus = statusFilter === "ALL" || m.status === statusFilter
      return matchSearch && matchRole && matchStatus
    })
  }, [search, roleFilter, statusFilter])

  const stats = {
    total: mockMembers.length,
    active: mockMembers.filter((m) => m.status === "active").length,
    admins: mockMembers.filter((m) => m.role === "ADMIN").length,
    inactive: mockMembers.filter((m) => m.status === "inactive").length,
  }

  function openAdd() {
    setEditMember(null)
    setSheetOpen(true)
  }

  function openEdit(m: Member) {
    setEditMember(m)
    setSheetOpen(true)
    setOpenDropdown(null)
  }

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-[38px] leading-tight text-ink"
            style={{ fontFamily: "var(--font-syne)", fontWeight: 800 }}
          >
            Team
          </h1>
          <p className="text-ink-muted font-sans text-sm mt-1.5">
            Manage your employees and their access
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-brand text-white px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans hover:bg-brand-dark transition-colors mt-2 shadow-sm shadow-brand/20"
        >
          <Plus size={15} />
          Add Member
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
          <div
            key={label}
            className="bg-card rounded-2xl border border-border px-5 py-4 flex items-center gap-4"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
              <Icon size={17} className={color} />
            </div>
            <div>
              <p
                className="text-[26px] leading-none text-ink"
                style={{ fontFamily: "var(--font-syne)", fontWeight: 800 }}
              >
                {value}
              </p>
              <p className="text-[11px] text-ink-muted font-sans mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-[360px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, or email…"
            className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2.5 text-[13px] font-sans text-ink placeholder:text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand/40 transition-all"
          />
        </div>

        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          {(["ALL", "MEMBER", "ADMIN"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold font-sans transition-all ${
                roleFilter === r
                  ? "bg-brand text-white shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {r === "ALL" ? "All Roles" : r === "MEMBER" ? "Members" : "Admins"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          {(["ALL", "active", "inactive"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-1.5 rounded-lg text-[12px] font-semibold font-sans transition-all ${
                statusFilter === s
                  ? "bg-brand text-white shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {s === "ALL" ? "All" : s === "active" ? "Active" : "Inactive"}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[12px] text-ink-muted font-sans">
          {filtered.length} of {mockMembers.length} members
        </span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-cream/50">
              {["Employee", "ID", "Role", "Contact", "Status", "Joined", ""].map((h) => (
                <th
                  key={h}
                  className="text-left px-5 py-3.5 text-[10px] font-semibold font-sans text-ink-muted uppercase tracking-widest first:pl-5 last:w-12"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((member) => (
              <tr key={member.id} className="hover:bg-cream/30 transition-colors">
                {/* Employee */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${avatarColor(member.id)}`}
                    >
                      <span
                        className="text-[11px]"
                        style={{ fontFamily: "var(--font-syne)", fontWeight: 700 }}
                      >
                        {getInitials(member.name)}
                      </span>
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold font-sans text-ink leading-tight">
                        {member.name}
                      </p>
                      <p className="text-[11px] text-ink-muted font-sans mt-0.5 flex items-center gap-1">
                        <Mail size={9} />
                        {member.email}
                      </p>
                    </div>
                  </div>
                </td>

                {/* ID */}
                <td className="px-5 py-3.5">
                  <span className="text-[12px] font-mono font-medium text-ink-2 bg-cream px-2.5 py-1 rounded-lg">
                    {member.employee_id}
                  </span>
                </td>

                {/* Role */}
                <td className="px-5 py-3.5">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold font-sans px-2.5 py-1 rounded-full ${
                      member.role === "ADMIN"
                        ? "bg-brand-soft text-brand"
                        : "bg-cream-dark text-ink-2"
                    }`}
                  >
                    {member.role === "ADMIN" ? <Shield size={9} /> : <User size={9} />}
                    {member.role}
                  </span>
                </td>

                {/* Contact */}
                <td className="px-5 py-3.5">
                  <p className="text-[12px] font-sans text-ink-2 flex items-center gap-1.5">
                    <Phone size={9} className="text-ink-muted flex-shrink-0" />
                    {member.phone}
                  </p>
                </td>

                {/* Status */}
                <td className="px-5 py-3.5">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold font-sans px-2.5 py-1 rounded-full ${
                      member.status === "active"
                        ? "bg-success-bg text-success"
                        : "bg-cream-dark text-ink-muted"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        member.status === "active" ? "bg-success" : "bg-ink-muted/50"
                      }`}
                    />
                    {member.status === "active" ? "Active" : "Inactive"}
                  </span>
                </td>

                {/* Joined */}
                <td className="px-5 py-3.5">
                  <p className="text-[12px] font-sans text-ink-muted flex items-center gap-1.5">
                    <CalendarDays size={10} className="flex-shrink-0" />
                    {formatDate(member.joined)}
                  </p>
                </td>

                {/* Actions */}
                <td className="px-4 py-3.5">
                  <div className="relative flex justify-end">
                    <button
                      onClick={() =>
                        setOpenDropdown(openDropdown === member.id ? null : member.id)
                      }
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-cream transition-colors"
                    >
                      <MoreVertical size={14} className="text-ink-muted" />
                    </button>

                    {openDropdown === member.id && (
                      <div className="absolute right-0 top-9 w-40 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden py-1">
                        <button
                          onClick={() => openEdit(member)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-sans text-ink hover:bg-cream transition-colors"
                        >
                          <Pencil size={12} className="text-ink-muted" />
                          Edit Member
                        </button>
                        <button
                          onClick={() => setOpenDropdown(null)}
                          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-sans transition-colors ${
                            member.status === "active"
                              ? "text-warning hover:bg-warning-bg"
                              : "text-success hover:bg-success-bg"
                          }`}
                        >
                          {member.status === "active" ? (
                            <>
                              <Ban size={12} />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <RotateCcw size={12} />
                              Reactivate
                            </>
                          )}
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
                  <p className="text-ink-muted font-sans text-[13px]">
                    No members match your search
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Invisible backdrop to close dropdown */}
      {openDropdown && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setOpenDropdown(null)}
        />
      )}

      {/* Add / Edit slide-over — key forces remount on member switch */}
      <MemberSheet
        key={editMember?.id ?? "add"}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        member={editMember}
      />
    </div>
  )
}
