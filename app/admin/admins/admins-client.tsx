"use client"

import { useState, useTransition } from "react"
import { Shield, Plus, Edit2, Trash2, ToggleLeft, ToggleRight, KeyRound, Loader2, X, CheckCircle2, UserCog, AlertTriangle } from "lucide-react"
import { createMember, updateMember, toggleMemberStatus, deleteMember, resetMemberPassword } from "@/lib/actions/team"
import { useRouter } from "next/navigation"

type Admin = {
  id: string
  name: string
  email: string | null
  employee_id: string
  role: string
  status: string
  created_at: string
  passport_photo_url: string | null
}

const ADMIN_CFG = { label: "Admin", color: "#7C3AED", bg: "rgba(124,58,237,0.1)" }

const INP: React.CSSProperties = {
  width: "100%", boxSizing: "border-box" as const,
  padding: "10px 13px", borderRadius: 10,
  border: "1.5px solid #E5E7EB", fontSize: 14,
  color: "#111827", background: "#FFFFFF", outline: "none",
}

function initials(name: string) {
  return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
}

type FormState = {
  name: string
  email: string
  password: string
}

function emptyForm(): FormState {
  return { name: "", email: "", password: "" }
}

export default function AdminsClient({
  admins: initial,
  currentUserId,
}: {
  admins: Admin[]
  currentUserId: string
}) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [admins, setAdmins] = useState(initial)
  const [sheet, setSheet] = useState<"create" | "edit" | "password" | null>(null)
  const [editing, setEditing] = useState<Admin | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [newPassword, setNewPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Admin | null>(null)

  function patch(field: keyof FormState, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function openCreate() {
    setForm(emptyForm())
    setEditing(null)
    setError(null)
    setSheet("create")
  }

  function openEdit(a: Admin) {
    setForm({ name: a.name, email: a.email ?? "", password: "" })
    setEditing(a)
    setError(null)
    setSheet("edit")
  }

  function openPassword(a: Admin) {
    setNewPassword("")
    setEditing(a)
    setError(null)
    setSheet("password")
  }

  function closeSheet() { setSheet(null); setEditing(null); setError(null) }

  function showSuccess(msg: string) {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  // ── Create ────────────────────────────────────────────────────────────────
  function handleCreate() {
    setError(null)
    if (!form.email.trim() || !form.password) {
      setError("Email and password are required.")
      return
    }
    const derivedName = form.email.trim().split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, c => c.toUpperCase())
    start(async () => {
      const res = await createMember({
        name: derivedName,
        email: form.email.trim(),
        password: form.password,
        role: "ADMIN",
        employee_id: "",
        phone: "",
        team: "",
      })
      if (!res.success) { setError(res.error ?? "Failed to create admin."); return }
      closeSheet()
      showSuccess(`${derivedName} added as Admin`)
      router.refresh()
    })
  }

  // ── Edit ─────────────────────────────────────────────────────────────────
  function handleEdit() {
    if (!editing) return
    setError(null)
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.")
      return
    }
    start(async () => {
      const res = await updateMember({
        id: editing.id,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: "",
        role: "ADMIN" as const,
        team: "",
      })
      if (!res.success) { setError(res.error ?? "Failed to update."); return }
      setAdmins(prev => prev.map(a => a.id === editing.id ? { ...a, name: form.name.trim(), email: form.email.trim() } : a))
      closeSheet()
      showSuccess("Admin updated")
    })
  }

  // ── Reset password ────────────────────────────────────────────────────────
  function handleResetPassword() {
    if (!editing) return
    setError(null)
    if (!newPassword || newPassword.length < 6) { setError("Password must be at least 6 characters."); return }
    start(async () => {
      const res = await resetMemberPassword(editing.id, newPassword)
      if (!res.success) { setError(res.error ?? "Failed to reset password."); return }
      closeSheet()
      showSuccess("Password updated")
    })
  }

  // ── Toggle status ─────────────────────────────────────────────────────────
  function handleToggle(a: Admin) {
    if (a.id === currentUserId) return
    const newStatus = a.status === "active" ? "inactive" : "active"
    start(async () => {
      const res = await toggleMemberStatus(a.id, newStatus)
      if (!res.success) { showSuccess("Error: " + res.error); return }
      setAdmins(prev => prev.map(x => x.id === a.id ? { ...x, status: newStatus } : x))
      showSuccess(`${a.name} ${newStatus === "active" ? "enabled" : "disabled"}`)
    })
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  function handleDelete(a: Admin) {
    start(async () => {
      const res = await deleteMember(a.id)
      if (!res.success) { showSuccess("Error: " + res.error); return }
      setAdmins(prev => prev.filter(x => x.id !== a.id))
      setConfirmDelete(null)
      showSuccess(`${a.name} deleted`)
    })
  }

  return (
    <div style={{ background: "#F5F6FA", minHeight: "100vh", padding: "24px 20px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(222,26,26,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <UserCog size={18} style={{ color: "#DE1A1A" }} />
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>Admin Accounts</h1>
            </div>
            <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Manage admin, founder and CEO accounts. These accounts have full panel access.</p>
          </div>
          <button onClick={openCreate} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 20px", borderRadius: 12, border: "none", background: "#DE1A1A", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(222,26,26,0.3)" }}>
            <Plus size={15} /> Add Admin
          </button>
        </div>

        {/* Success toast */}
        {success && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderRadius: 12, background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)", marginBottom: 16 }}>
            <CheckCircle2 size={16} style={{ color: "#16A34A" }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#16A34A" }}>{success}</span>
          </div>
        )}

        {/* Admin list */}
        {admins.length === 0 ? (
          <div style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #E5E7EB", padding: "48px 24px", textAlign: "center" }}>
            <Shield size={40} style={{ color: "#D1D5DB", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: "#374151", margin: "0 0 4px" }}>No admin accounts yet</p>
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: 0 }}>Click "Add Admin" to create the first admin account.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {admins.map(a => {
              const isMe = a.id === currentUserId
              const isActive = a.status === "active"
              return (
                <div key={a.id} style={{ background: "#FFFFFF", borderRadius: 16, border: "1px solid #E5E7EB", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, opacity: isActive ? 1 : 0.6, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>

                  {/* Avatar */}
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: ADMIN_CFG.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `1.5px solid ${ADMIN_CFG.color}22` }}>
                    {a.passport_photo_url ? (
                      <img src={a.passport_photo_url} alt={a.name} style={{ width: "100%", height: "100%", borderRadius: 14, objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 16, fontWeight: 900, color: ADMIN_CFG.color }}>{initials(a.name)}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "#111827" }}>{a.name}</span>
                      {isMe && <span style={{ fontSize: 10, fontWeight: 700, color: "#6B7280", background: "#F3F4F6", padding: "2px 7px", borderRadius: 4 }}>You</span>}
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: ADMIN_CFG.bg, color: ADMIN_CFG.color }}>Admin</span>
                      {!isActive && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "rgba(239,68,68,0.08)", color: "#EF4444" }}>Disabled</span>}
                    </div>
                    <p style={{ fontSize: 12, color: "#6B7280", margin: 0 }}>{a.email ?? "—"}</p>
                    <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Joined {new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(a)} title="Edit" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", color: "#374151" }}>
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => openPassword(a)} title="Reset Password" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, border: "1.5px solid #E5E7EB", background: "#F9FAFB", cursor: "pointer", color: "#374151" }}>
                      <KeyRound size={14} />
                    </button>
                    {!isMe && (
                      <button onClick={() => handleToggle(a)} title={isActive ? "Disable" : "Enable"}
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${isActive ? "rgba(222,26,26,0.2)" : "rgba(22,163,74,0.2)"}`, background: isActive ? "rgba(222,26,26,0.05)" : "rgba(22,163,74,0.05)", cursor: "pointer", color: isActive ? "#DE1A1A" : "#16A34A" }}>
                        {isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                    )}
                    {!isMe && (
                      <button onClick={() => setConfirmDelete(a)} title="Delete" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, border: "1.5px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.05)", cursor: "pointer", color: "#EF4444" }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Sheet overlay ─────────────────────────────────────────────────── */}
      {sheet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) closeSheet() }}>
          <div style={{ background: "#FFFFFF", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 520, padding: "28px 24px 36px", maxHeight: "90vh", overflowY: "auto" }}>

            {/* Sheet header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111827", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                {sheet === "create" ? "Add Admin Account" : sheet === "edit" ? "Edit Admin" : "Reset Password"}
              </h2>
              <button onClick={closeSheet} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Error */}
            {error && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                <AlertTriangle size={13} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#DC2626", lineHeight: 1.4 }}>{error}</span>
              </div>
            )}

            {/* Create form — Email + Password only */}
            {sheet === "create" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>Email *</label>
                  <input type="email" placeholder="admin@gmail.com" value={form.email} onChange={e => patch("email", e.target.value)} style={INP} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>Password *</label>
                  <input type="password" placeholder="Min. 6 characters" value={form.password} onChange={e => patch("password", e.target.value)} style={INP} />
                </div>
                <button onClick={handleCreate} disabled={isPending}
                  style={{ marginTop: 6, width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: isPending ? "#9CA3AF" : "#DE1A1A", color: "#fff", fontSize: 14, fontWeight: 800, cursor: isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-jakarta)" }}>
                  {isPending ? <><Loader2 size={15} className="animate-spin" /> Creating…</> : "Create Admin"}
                </button>
              </div>
            )}

            {/* Edit form — Name, Email, Role */}
            {sheet === "edit" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>Full Name *</label>
                  <input type="text" placeholder="e.g. Sanjay Kumar" value={form.name} onChange={e => patch("name", e.target.value)} style={INP} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>Email *</label>
                  <input type="email" placeholder="admin@gmail.com" value={form.email} onChange={e => patch("email", e.target.value)} style={INP} />
                </div>
                <button onClick={handleEdit} disabled={isPending}
                  style={{ marginTop: 6, width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: isPending ? "#9CA3AF" : "#DE1A1A", color: "#fff", fontSize: 14, fontWeight: 800, cursor: isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "var(--font-jakarta)" }}>
                  {isPending ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : "Save Changes"}
                </button>
              </div>
            )}

            {/* Reset Password form */}
            {sheet === "password" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Set a new password for <strong style={{ color: "#111827" }}>{editing?.name}</strong></p>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.07em", display: "block", marginBottom: 6 }}>New Password *</label>
                  <input type="password" placeholder="Min. 6 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={INP} />
                </div>
                <button onClick={handleResetPassword} disabled={isPending}
                  style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: isPending ? "#9CA3AF" : "#DE1A1A", color: "#fff", fontSize: 14, fontWeight: 800, cursor: isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  {isPending ? <><Loader2 size={15} className="animate-spin" /> Updating…</> : "Update Password"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirm ────────────────────────────────────────────────── */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(null) }}>
          <div style={{ background: "#FFFFFF", borderRadius: 20, padding: "28px 24px", maxWidth: 380, width: "100%" }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Trash2 size={22} style={{ color: "#EF4444" }} />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: "#111827", textAlign: "center", margin: "0 0 8px", fontFamily: "var(--font-jakarta)" }}>Delete Admin?</h3>
            <p style={{ fontSize: 13, color: "#6B7280", textAlign: "center", margin: "0 0 24px" }}>
              This will permanently delete <strong style={{ color: "#111827" }}>{confirmDelete.name}</strong> and revoke their access. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: "11px 0", borderRadius: 11, border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)} disabled={isPending}
                style={{ flex: 1, padding: "11px 0", borderRadius: 11, border: "none", background: "#EF4444", color: "#fff", fontSize: 13, fontWeight: 700, cursor: isPending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {isPending ? <Loader2 size={13} className="animate-spin" /> : null}
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
