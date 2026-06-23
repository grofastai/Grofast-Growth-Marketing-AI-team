"use client"

import { useState, useMemo, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {
  Search, Plus, Shield, UserCheck,
  MoreVertical, Phone, CalendarDays, X, Pencil,
  Ban, RotateCcw, User, Loader2, Trash2, AlertTriangle, ChevronDown, KeyRound,
  ClipboardList, CheckCircle2, Send, TrendingUp, Star, Clock, Camera, LogIn, Clapperboard, ArrowRight, FolderOpen,
} from "lucide-react"
import { createMember, updateMember, toggleMemberStatus, deleteMember, resetMemberPassword, assignTask, uploadPassportPhoto, resendOnboardingWhatsApp } from "@/lib/actions/team"
import { startImpersonation } from "@/lib/actions/impersonate"
import { createFreelancer, assignAllFreelancersToMembers, deleteFreelancer } from "@/lib/actions/freelancers"
import { addManagerToAllFreelancers, removeManagerFromAllFreelancers } from "@/lib/actions/freelancer-manager"

type FreelancerBasic = {
  id: string; name: string; type: string; phone: string | null; upi_id: string | null
  rating: number; status: "active" | "inactive"
  cost_per_minute: number | null; cost_per_video: number | null; cost_per_hour: number | null
  voice_type: string | null; editing_software: string[]; gender: string | null; title: string | null
  created_at: string
}

const FL_TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  voice_over:    { label: "Voice Over",    color: "#8b5cf6", bg: "rgba(139,92,246,0.08)" },
  video_editor:  { label: "Video Editor",  color: "#0ea5e9", bg: "rgba(14,165,233,0.08)" },
  video_shooter: { label: "Video Shooter", color: "#10b981", bg: "rgba(16,185,129,0.08)" },
  other:         { label: "Other",         color: "#6b7280", bg: "rgba(107,114,128,0.08)" },
}

const FULL_TIME_TEAMS = [
  "Media Production Team",
  "Creative Studio",
  "AI Development & Automation",
  "Performance Marketing & Operations",
  "AI Development & Media",
] as const

const FREELANCER_TEAMS = [
  "Freelance Media Production",
  "Freelance Video Editing",
  "Freelance Videography",
  "Freelance RJ Voiceover",
  "Freelance Graphics Designer",
  "Freelance Content Writer",
  "Freelance Development & Automation",
  "Freelance Marketing & Operations",
  "Freelance IT Technology & Media",
] as const

interface Member {
  id: string
  name: string
  employee_id: string
  role: "ADMIN" | "MEMBER" | "FREELANCER_MGR" | "FOUNDER" | "CEO"
  email: string | null
  phone: string | null
  status: "active" | "inactive"
  team: string | null
  position: string | null
  created_at: string
  employment_type: "regular" | "freelancer" | null
  monthly_salary: number | null
  hourly_rate: number | null
  paid_leave_days: number | null
  deleted_at?: string | null
  date_of_birth?: string | null
  joined_at?: string | null
  gender?: "male" | "female" | null
  passport_photo_url?: string | null
  drive_folder_id?: string | null
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
}

function computeNextEmployeeId(members: Member[]): string {
  const used = new Set(
    members
      .map(m => { const match = m.employee_id.match(/^GF(\d+)$/i); return match ? parseInt(match[1]) : 0 })
      .filter(n => n > 0)
  )
  let next = 1
  while (used.has(next)) next++
  return `GF${String(next).padStart(3, "0")}`
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

function teamColor(team: string | null): { bg: string; color: string } {
  if (!team) return { bg: "#F3F4F6", color: "#6B7280" }
  if (team === "Media Production Team" || team === "Freelance Media Production" || team === "Media Team" || team === "Media") return { bg: "rgba(236,72,153,0.1)", color: "#EC4899" }
  if (team === "Creative Studio" || team === "Creative Team" || team === "Creative") return { bg: "rgba(245,158,11,0.1)", color: "#F59E0B" }
  if (team === "AI Development & Automation" || team === "Freelance Development & Automation") return { bg: "rgba(99,102,241,0.1)", color: "#6366F1" }
  if (team === "Performance Marketing & Operations" || team === "Freelance Marketing & Operations" || team === "Technology & Operation Team" || team.includes("Tech & Ops")) return { bg: "rgba(16,185,129,0.1)", color: "#10B981" }
  if (team === "AI Development & Media" || team === "Freelance IT Technology & Media" || team.includes("Media & Tech")) return { bg: "rgba(139,92,246,0.1)", color: "#8B5CF6" }
  if (team === "Freelance Video Editing") return { bg: "rgba(99,102,241,0.1)", color: "#6366F1" }
  if (team === "Freelance Videography") return { bg: "rgba(239,68,68,0.1)", color: "#EF4444" }
  if (team === "Freelance RJ Voiceover") return { bg: "rgba(168,85,247,0.1)", color: "#A855F7" }
  if (team === "Freelance Graphics Designer") return { bg: "rgba(249,115,22,0.1)", color: "#F97316" }
  if (team === "Freelance Content Writer") return { bg: "rgba(20,184,166,0.1)", color: "#14B8A6" }
  return { bg: "#F3F4F6", color: "#6B7280" }
}

function teamShort(team: string | null) {
  if (!team) return "—"
  if (team === "Media Production Team" || team === "Media Team" || team === "Media") return "Media Production"
  if (team === "Creative Studio" || team === "Creative Team" || team === "Creative") return "Creative Studio"
  if (team === "AI Development & Automation") return "AI Dev & Auto"
  if (team === "Performance Marketing & Operations" || team.includes("Tech & Ops") || team === "Technology & Operation Team") return "Perf. Marketing"
  if (team === "AI Development & Media" || team.includes("Media & Tech")) return "AI Dev & Media"
  if (team === "Freelance Media Production") return "FL Media"
  if (team === "Freelance Video Editing") return "FL Editing"
  if (team === "Freelance Videography") return "FL Videography"
  if (team === "Freelance RJ Voiceover") return "FL Voiceover"
  if (team === "Freelance Graphics Designer") return "FL Graphics"
  if (team === "Freelance Content Writer") return "FL Content"
  if (team === "Freelance Development & Automation") return "FL Dev & Auto"
  if (team === "Freelance Marketing & Operations") return "FL Marketing"
  if (team === "Freelance IT Technology & Media") return "FL IT & Media"
  return team
}

// ── Add / Edit Sheet ──────────────────────────────────────────────────────────

interface SheetProps {
  open: boolean
  onClose: () => void
  member?: Member | null
  nextId?: string
  initialRole?: "ADMIN" | "MEMBER" | "FREELANCER_MGR"
}

const ACCOUNT_TYPES = [
  {
    role: "MEMBER" as const,
    label: "Team Member",
    desc: "Full-time or freelance — logs daily updates, tasks, attendance",
    icon: User,
    color: "#DE1A1A",
    bg: "rgba(222,26,26,0.06)",
    border: "rgba(222,26,26,0.2)",
  },
  {
    role: "ADMIN" as const,
    label: "Admin",
    desc: "Full admin access — manages team & reports",
    icon: Shield,
    color: "#7C3AED",
    bg: "rgba(124,58,237,0.06)",
    border: "rgba(124,58,237,0.2)",
  },
]

const NO_LOGIN_TEAMS = new Set([
  "Freelance RJ Voiceover",
  "Freelance Graphics Designer",
  "Freelance Content Writer",
  "Freelance Development & Automation",
  "Freelance Marketing & Operations",
  "Freelance IT Technology & Media",
])

function MemberSheet({ open, onClose, member, nextId, initialRole }: SheetProps) {
  const isEdit = !!member
  const [step, setStep] = useState<"type" | "details">(isEdit || initialRole ? "details" : "type")
  const [form, setForm] = useState({
    name: member?.name ?? "",
    employee_id: member?.employee_id ?? nextId ?? "",
    email: member?.email ?? "",
    phone: member?.phone ?? "",
    role: (member?.role ?? initialRole ?? "MEMBER") as "ADMIN" | "MEMBER" | "FREELANCER_MGR" | "FOUNDER" | "CEO",
    team: member?.team ?? "",
    position: member?.position ?? "",
    password: "",
    employment_type: ((member?.employment_type === "regular" || member?.employment_type === "freelancer") ? member.employment_type : "regular") as "regular" | "freelancer",
    monthly_salary: member?.monthly_salary?.toString() ?? "",
    hourly_rate: member?.hourly_rate?.toString() ?? "",
    paid_leave_days: member?.paid_leave_days?.toString() ?? "5",
    date_of_birth: member?.date_of_birth ?? "",
    joined_at: member?.joined_at ?? new Date().toISOString().split("T")[0],
    gender: (member?.gender ?? "male") as "male" | "female",
  })
  const [error, setError] = useState("")
  const [whatsappWarning, setWhatsappWarning] = useState("")
  const [isPending, startTransition] = useTransition()
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoFile, setPhotoFile]       = useState<File | null>(null)

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const router = useRouter()

  function handleSubmit() {
    setError("")
    startTransition(async () => {
      // No-login freelancer — save to freelancers table, no user account
      if (isNoLoginTeam) {
        if (!form.name.trim()) { setError("Name is required"); return }
        const result = await createFreelancer({
          name: form.name.trim(),
          type: "other",
          team: form.team,
          phone: form.phone || undefined,
          gender: form.gender || undefined,
          rating: 0,
        })
        if (result.success) { router.refresh(); onClose() }
        else setError(result.error ?? "Something went wrong")
        return
      }

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
      if (photoFile && isEdit && member) {
        const fd = new FormData()
        fd.append("file", photoFile)
        const photoResult = await uploadPassportPhoto(member.id, fd)
        if (!photoResult.success) {
          setError(photoResult.error ?? "Photo upload failed")
          return
        }
      }

      if (isEdit) {
        const result = await updateMember({ id: member!.id, name: form.name, email: form.email, phone: form.phone, role: form.role, team: form.team, position: form.position || null, gender: form.gender, ...salaryFields, ...dateFields })
        if (result.success) { router.refresh(); onClose() }
        else setError(result.error ?? "Something went wrong")
      } else {
        const isAdminCreate = form.role === "ADMIN" || form.role === "FOUNDER" || form.role === "CEO" || form.role === "FREELANCER_MGR"
        const nameForCreate = form.name.trim() || (isAdminCreate ? form.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "")
        const result = await createMember({ name: nameForCreate, employee_id: form.employee_id, email: form.email, phone: form.phone, role: form.role, team: form.team, position: form.position || null, password: form.password, gender: form.gender, ...salaryFields, ...dateFields })
        if (result.success) {
          if (form.phone && result.whatsappSent === false && !result.whatsappSkipped) {
            setWhatsappWarning(result.whatsappError ?? "Member created, but WhatsApp notification failed. Check the phone number or Meta template status.")
            router.refresh()
          } else {
            router.refresh()
            onClose()
          }
        } else {
          setError(result.error ?? "Something went wrong")
        }
      }
    })
  }

  if (!open) return null

  const selectedType = ACCOUNT_TYPES.find(t => t.role === form.role) ?? ACCOUNT_TYPES[0]
  const isFreelancerMgr = form.role === "FREELANCER_MGR"
  const isAdmin = form.role === "ADMIN" || form.role === "FOUNDER" || form.role === "CEO"
  const isNoLoginTeam = !isEdit && NO_LOGIN_TEAMS.has(form.team)

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }} onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full sm:w-[420px] z-50 shadow-2xl flex flex-col"
        style={{ background: "#FFFFFF", borderLeft: "1px solid rgba(222,26,26,0.15)" }}>

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between flex-shrink-0"
          style={{ borderBottom: "1px solid #E5E7EB" }}>
          <div className="flex items-center gap-3">
            {!isEdit && step === "details" && (
              <button onClick={() => { setStep("type"); setError(""); setWhatsappWarning("") }}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                style={{ background: "#F3F4F6", border: "1px solid #E5E7EB" }}>
                <ChevronDown size={13} style={{ color: "#6B7280", transform: "rotate(90deg)" }} />
              </button>
            )}
            <div>
              <h2 className="text-[17px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                {isEdit ? "Edit Member" : step === "type" ? "Select Account Type" : `New ${selectedType.label}`}
              </h2>
              <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>
                {isEdit ? "Update member details" : step === "type" ? "Choose the type of account to create" : selectedType.desc}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-gray-100"
            style={{ border: "1px solid #E5E7EB" }}>
            <X size={14} style={{ color: "#6B7280" }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          <style>{`.sheet-input:focus{border-color:rgba(222,26,26,0.4)!important}`}</style>

          {/* ── Step 1: Account Type Picker ── */}
          {!isEdit && step === "type" && (
            <div className="space-y-3">
              {ACCOUNT_TYPES.map((type) => {
                const Icon = type.icon
                return (
                  <button key={type.role} type="button"
                    onClick={() => {
                      setForm(p => ({ ...p, role: type.role as "ADMIN" | "MEMBER" | "FREELANCER_MGR" }))
                      setStep("details")
                    }}
                    className="w-full flex items-center gap-4 rounded-2xl transition-all text-left"
                    style={{ padding: "18px 20px", background: type.bg, border: `1.5px solid ${type.border}` }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = "0.85"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = "1"}>
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "#FFFFFF", border: `1.5px solid ${type.border}` }}>
                      <Icon size={20} style={{ color: type.color }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[14px] font-bold" style={{ color: "#111111" }}>{type.label}</p>
                      <p className="text-[12px] mt-0.5" style={{ color: "#6B7280" }}>{type.desc}</p>
                    </div>
                    <ChevronDown size={14} style={{ color: "#D1D5DB", transform: "rotate(-90deg)", flexShrink: 0 }} />
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Step 2: Details Form ── */}
          {(isEdit || step === "details") && (
            <>
              {/* Passport Photo — edit only */}
              {isEdit && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Passport Photo</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 64, height: 80, borderRadius: 10, overflow: "hidden", flexShrink: 0, border: "2px solid #E5E7EB", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {(photoPreview ?? member?.passport_photo_url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoPreview ?? member?.passport_photo_url ?? ""} alt="Passport" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <User size={22} style={{ color: "#D1D5DB" }} />
                      )}
                    </div>
                    <label style={{ flex: 1, cursor: "pointer" }}>
                      <div style={{ padding: "12px", borderRadius: 10, border: "1.5px dashed #E5E7EB", background: "#FAFAFA", textAlign: "center" }}>
                        <Camera size={16} style={{ color: "#9CA3AF", margin: "0 auto 5px" }} />
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{(photoPreview ?? member?.passport_photo_url) ? "Change Photo" : "Upload Photo"}</p>
                        <p style={{ fontSize: 10, color: "#9CA3AF", marginTop: 2 }}>JPG or PNG · Max 2MB</p>
                      </div>
                      <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handlePhotoSelect} />
                    </label>
                  </div>
                  {photoFile && <p style={{ fontSize: 11, color: "#16A34A", marginTop: 6 }}>✓ New photo selected — will upload on save</p>}
                </div>
              )}

              {/* Freelancer Mgr or Admin create — Email + Password only */}
              {(isFreelancerMgr && !isEdit) || (isAdmin && !isEdit) ? (
                <>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Email Address *</label>
                    <input type="email" className="sheet-input" value={form.email} onChange={set("email")} placeholder="e.g. manager@gmail.com" style={FIELD} />
                    <p className="text-[11px] mt-1.5" style={{ color: "#9CA3AF" }}>Logs in with this email + password directly.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Password *</label>
                    <input type="text" className="sheet-input" value={form.password} onChange={set("password")} placeholder="Min 6 characters" style={FIELD} />
                  </div>
                </>
              ) : isFreelancerMgr && isEdit ? (
                /* Freelancer Mgr edit — name + email */
                <>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Name *</label>
                    <input className="sheet-input" value={form.name} onChange={set("name")} placeholder="e.g. Karthik R" style={FIELD} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Email Address *</label>
                    <input type="email" className="sheet-input" value={form.email} onChange={set("email")} placeholder="e.g. karthik@gmail.com" style={FIELD} />
                  </div>
                </>
              ) : isAdmin && !isEdit ? (
                /* Admin create — Email + Password only */
                <>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Gmail Address *</label>
                    <input type="email" className="sheet-input" value={form.email} onChange={set("email")} placeholder="e.g. admin@gmail.com" style={FIELD} />
                    <p className="text-[11px] mt-1.5" style={{ color: "#9CA3AF" }}>Admin logs in with this Gmail + password directly.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Password *</label>
                    <input type="text" className="sheet-input" value={form.password} onChange={set("password")} placeholder="Min 6 characters" style={FIELD} />
                  </div>
                </>
              ) : (
                /* Member / Admin edit — full fields */
                <>
                  {/* Employment Type toggle — Full Time / Part Time */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Employment Type *</label>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: "regular",    label: "Full Time" },
                        { value: "freelancer", label: "Part Time" },
                      ] as const).map(({ value, label }) => (
                        <button key={value} type="button"
                          onClick={() => setForm(prev => ({ ...prev, employment_type: value, team: "", monthly_salary: "", hourly_rate: "", paid_leave_days: value === "regular" ? "5" : "0" }))}
                          className="py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                          style={form.employment_type === value
                            ? { background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#FFFFFF", border: "1px solid rgba(222,26,26,0.3)" }
                            : { background: "rgba(0,0,0,0.03)", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Team — filtered by employment type */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Team *</label>
                    <div className="relative">
                      <select className="sheet-input" value={form.team}
                        onChange={e => setForm(prev => ({ ...prev, team: e.target.value }))}
                        style={{ ...FIELD, appearance: "none", paddingRight: "36px" }}>
                        <option value="">Select a team…</option>
                        {form.employment_type === "regular" ? (
                          FULL_TIME_TEAMS.map(t => <option key={t} value={t}>{t}</option>)
                        ) : (
                          <>
                            <optgroup label="── Login (has app access)">
                              {(["Freelance Media Production","Freelance Video Editing","Freelance Videography"] as const).map(t => <option key={t} value={t}>{t}</option>)}
                            </optgroup>
                            <optgroup label="── No Login (manager enters work)">
                              {(["Freelance RJ Voiceover","Freelance Graphics Designer","Freelance Content Writer","Freelance Development & Automation","Freelance Marketing & Operations","Freelance IT Technology & Media"] as const).map(t => <option key={t} value={t}>{t}</option>)}
                            </optgroup>
                          </>
                        )}
                      </select>
                      <ChevronDown size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#6B7280" }} />
                    </div>
                    {isNoLoginTeam && (
                      <p className="text-[11px] mt-1.5 font-semibold" style={{ color: "#F97316" }}>
                        No-login — only name &amp; phone needed.
                      </p>
                    )}
                  </div>

                  {/* Full Name — always shown */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Full Name *</label>
                    <input className="sheet-input" value={form.name} onChange={set("name")} placeholder="e.g. Priya Sharma" style={FIELD} />
                  </div>

                  {/* Gender — always shown */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Gender *</label>
                    <div style={{ display: "flex", gap: 10 }}>
                      {(["male", "female"] as const).map(g => (
                        <button key={g} type="button" onClick={() => setForm(p => ({ ...p, gender: g }))}
                          style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, border: "1.5px solid", cursor: "pointer", transition: "all 0.15s",
                            background: form.gender === g ? (g === "male" ? "rgba(59,130,246,0.08)" : "rgba(236,72,153,0.08)") : "#F9FAFB",
                            borderColor: form.gender === g ? (g === "male" ? "#3B82F6" : "#EC4899") : "#E5E7EB",
                            color: form.gender === g ? (g === "male" ? "#2563EB" : "#DB2777") : "#6B7280",
                          }}>
                          {g === "male" ? "👦 Male" : "👧 Female"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Phone — always shown */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>WhatsApp Number</label>
                    <input className="sheet-input" value={form.phone} onChange={set("phone")} placeholder="e.g. 919876543210" style={FIELD} />
                    {!isNoLoginTeam && <p className="text-[11px] mt-1.5" style={{ color: "#9CA3AF" }}>Credentials will be sent here after account creation.</p>}
                  </div>

                  {/* Login-only fields — hidden for no-login freelancers */}
                  {!isNoLoginTeam && (
                    <>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Position / Designation</label>
                    <input className="sheet-input" value={form.position} onChange={set("position")} placeholder="e.g. Social Media Executive, Videographer…" style={FIELD} />
                  </div>

                  {!isEdit && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>
                        Employee ID * <span style={{ color: "#22C55E", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>· Auto-generated</span>
                      </label>
                      <input className="sheet-input" value={form.employee_id} onChange={set("employee_id")} placeholder="e.g. GF001" style={{ ...FIELD, fontFamily: "monospace", fontWeight: 700 }} />
                      <p className="text-[11px] mt-1.5" style={{ color: "#9CA3AF" }}>Auto-filled — you can change it. Cannot be edited after creation.</p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Email Address *</label>
                    <input type="email" className="sheet-input" value={form.email} onChange={set("email")} placeholder="e.g. priya@gmail.com" style={FIELD} />
                  </div>
                    </>
                  )}

                  {/* Salary fields — Full Time only */}
                  {!isNoLoginTeam && form.employment_type === "regular" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                  )}

                  {!isNoLoginTeam && (
                    <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Date of Birth</label>
                      <input type="date" className="sheet-input" style={{ ...FIELD, colorScheme: "light" }} value={form.date_of_birth} onChange={set("date_of_birth")} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Work Start Date</label>
                      <input type="date" className="sheet-input" style={{ ...FIELD, colorScheme: "light" }} value={form.joined_at} onChange={set("joined_at")} max={new Date().toISOString().split("T")[0]} />
                    </div>
                  </div>

                  {!isEdit && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>
                        {isAdmin ? "Password *" : "Temporary Password *"}
                      </label>
                      <input type="text" className="sheet-input" value={form.password} onChange={set("password")} placeholder="Min 6 characters" style={FIELD} />
                      {!isAdmin && <p className="text-[11px] mt-1.5" style={{ color: "#9CA3AF" }}>Will be sent via WhatsApp.</p>}
                    </div>
                  )}
                    </>
                  )}
                </>
              )}

              {whatsappWarning && (
                <div className="rounded-xl px-4 py-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <p className="text-[12px] font-semibold" style={{ color: "#B45309" }}>WhatsApp not sent</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#B45309" }}>{whatsappWarning}</p>
                </div>
              )}
              {error && (
                <p className="text-[12px] rounded-xl px-4 py-3"
                  style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}>{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {(isEdit || step === "details") && (
          <div className="px-6 py-4 flex items-center gap-3 flex-shrink-0" style={{ borderTop: "1px solid #E5E7EB" }}>
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl text-[13px] font-semibold transition-all"
              style={{ background: "rgba(0,0,0,0.03)", color: "#6B7280", border: "1px solid #E5E7EB" }}>
              {whatsappWarning ? "Close" : "Cancel"}
            </button>
            <button onClick={handleSubmit} disabled={isPending || !!whatsappWarning}
              className="flex-1 py-3 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
              style={{ background: isFreelancerMgr ? "linear-gradient(135deg, #2D6A4F, #1A4731)" : "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#FFFFFF", boxShadow: isFreelancerMgr ? "0 4px 16px rgba(45,106,79,0.25)" : "0 4px 16px rgba(222,26,26,0.25)" }}>
              {isPending && <Loader2 size={13} className="animate-spin" />}
              {isEdit ? "Save Changes" : "Create Account"}
            </button>
          </div>
        )}
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

// ── Freelancer Quick-Create Sheet ─────────────────────────────────────────────

const FL_TYPES = [
  { key: "Freelance RJ Voiceover",            label: "RJ Voiceover",    emoji: "🎙️", color: "#A855F7", bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.3)" },
  { key: "Freelance Graphics Designer",        label: "Graphics Design", emoji: "🎨", color: "#F97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.3)" },
  { key: "Freelance Content Writer",           label: "Content Writer",  emoji: "✍️", color: "#14B8A6", bg: "rgba(20,184,166,0.08)",  border: "rgba(20,184,166,0.3)" },
  { key: "Freelance Development & Automation", label: "Dev & Automation",emoji: "💻", color: "#6366F1", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.3)" },
  { key: "Freelance Marketing & Operations",   label: "Marketing & Ops", emoji: "📊", color: "#10B981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.3)" },
  { key: "Freelance IT Technology & Media",    label: "IT & Media",      emoji: "🖥️", color: "#8B5CF6", bg: "rgba(139,92,246,0.08)",  border: "rgba(139,92,246,0.3)" },
]

function FreelancerQuickSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<"type" | "details">("type")
  const [type, setType] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [upi, setUpi] = useState("")
  const [gender, setGender] = useState("")
  const [rating, setRating] = useState(0)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")
  const [success, setSuccess] = useState(false)

  function reset() {
    setStep("type"); setType(""); setName(""); setPhone(""); setUpi(""); setGender(""); setRating(0); setSaving(false); setErr(""); setSuccess(false)
  }
  function close() { reset(); onClose() }

  const cfg = FL_TYPES.find(t => t.key === type)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr("Name is required"); return }
    setSaving(true); setErr("")
    const res = await createFreelancer({
      name: name.trim(), type: "other",
      phone: phone || undefined, upi_id: upi || undefined, gender: gender || undefined,
      rating, availability_notes: type,
    })
    if (!res.success) { setErr(res.error ?? "Failed to create"); setSaving(false); return }
    setSuccess(true); setSaving(false)
    onCreated()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div className="relative ml-auto h-full w-full max-w-[420px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">Add No-Login Freelancer</h2>
            {cfg && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full mt-0.5 inline-block" style={{ background: cfg.bg, color: cfg.color }}>{cfg.emoji} {cfg.label}</span>}
          </div>
          <button onClick={close} className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {success ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(16,185,129,0.1)" }}>
                <CheckCircle2 size={32} style={{ color: "#10b981" }} />
              </div>
              <p className="text-[16px] font-bold text-gray-900">Freelancer Added!</p>
              <p className="text-[13px] text-gray-500">{name} has been added. Manager can now enter their work.</p>
              <button onClick={reset} className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: "#F97316" }}>
                Add Another
              </button>
            </div>
          ) : step === "type" ? (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-gray-500">Select freelancer type to continue</p>
              <div className="grid grid-cols-2 gap-3">
                {FL_TYPES.map(t => (
                  <button key={t.key} type="button"
                    onClick={() => { setType(t.key); setStep("details") }}
                    className="flex flex-col items-center gap-3 p-5 rounded-2xl text-center transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{ border: `2px solid ${t.border}`, background: t.bg }}>
                    <span style={{ fontSize: 28 }}>{t.emoji}</span>
                    <span className="text-[12px] font-bold text-gray-800 leading-tight">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form id="fl-quick-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
              <button type="button" onClick={() => setStep("type")}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 hover:text-gray-600 -mt-1">
                ← Change type
              </button>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Full Name *</label>
                <input className={FIELD_CLS} placeholder="e.g. Ravi Kumar" value={name} onChange={e => setName(e.target.value)} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Gender</label>
                <div className="flex gap-2">
                  {["male","female"].map(g => (
                    <button key={g} type="button"
                      onClick={() => setGender(gender === g ? "" : g)}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-bold capitalize transition-all"
                      style={gender === g ? { background: "#F97316", color: "#fff", border: "2px solid #F97316" } : { background: "#F9FAFB", color: "#6B7280", border: "2px solid #E5E7EB" }}>
                      {g === "male" ? "Male" : "Female"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Phone</label>
                  <input className={FIELD_CLS} inputMode="numeric" placeholder="9876543210" value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">UPI ID</label>
                  <input className={FIELD_CLS} placeholder="name@upi" value={upi} onChange={e => setUpi(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Rating</label>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => setRating(rating === n ? 0 : n)}
                      className="p-1 transition-all">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill={n <= rating ? "#f59e0b" : "none"} stroke={n <= rating ? "#f59e0b" : "#d1d5db"} strokeWidth="1.5">
                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {err && (
                <p className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-xl">{err}</p>
              )}
            </form>
          )}
        </div>

        {!success && step === "details" && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button type="button" onClick={close} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all">Cancel</button>
            <button type="submit" form="fl-quick-form" disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
              style={{ background: saving ? "#fdba74" : "#F97316" }}>
              {saving ? "Adding…" : "Add Freelancer"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const FIELD_CLS = "w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[13px] text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] transition-all bg-white"
const SELECT_CLS = FIELD_CLS + " appearance-none cursor-pointer"
const FL_VOICE_TYPES = ["Commercial Tone", "Emotional Tone", "High Pitch", "Base Voice", "Warm & Friendly", "Deep & Authoritative", "Neutral", "Energetic", "Soft & Calm"]

// ── Assign Manager Sheet ──────────────────────────────────────────────────────

function AssignManagerSheet({
  open, onClose, members, assignedManagerIds: initialAssignedIds = [],
}: {
  open: boolean
  onClose: () => void
  members: Member[]
  assignedManagerIds?: string[]
}) {
  const router = useRouter()
  const [assigned, setAssigned]   = useState<string[]>(initialAssignedIds)
  const [selected, setSelected]   = useState<string[]>([])
  const [removing, setRemoving]   = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [removeErr, setRemoveErr] = useState<string | null>(null)
  const [assignErr, setAssignErr] = useState<string | null>(null)

  // Sync when modal opens with fresh server data
  useEffect(() => {
    if (open) {
      setAssigned(initialAssignedIds)
      setSelected([])
      setRemoving(null)
      setSaving(false)
      setRemoveErr(null)
      setAssignErr(null)
    }
  }, [open, initialAssignedIds.join(",")])

  function close() { onClose() }

  const idNum = (id: string) => { const m = id.match(/\d+/); return m ? parseInt(m[0]) : 99999 }

  const allMembers = [...members]
    .filter(m => m.role === "MEMBER")
    .sort((a, b) => idNum(a.employee_id) - idNum(b.employee_id))

  const assignedMembers   = allMembers.filter(m => assigned.includes(m.id))
  const availableMembers  = allMembers.filter(m => !assigned.includes(m.id))

  function toggleSelect(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleRemove(userId: string) {
    setRemoving(userId)
    setRemoveErr(null)
    const res = await removeManagerFromAllFreelancers(userId)
    setRemoving(null)
    if (!res.success) { setRemoveErr(res.error ?? "Failed to remove"); return }
    setAssigned(prev => prev.filter(id => id !== userId))
    router.refresh()
  }

  async function handleAssign() {
    if (selected.length === 0) return
    setSaving(true)
    setAssignErr(null)
    for (const userId of selected) {
      const res = await addManagerToAllFreelancers(userId)
      if (!res.success) { setAssignErr(res.error ?? "Failed to assign"); setSaving(false); return }
    }
    setAssigned(prev => [...prev, ...selected])
    setSelected([])
    setSaving(false)
    router.refresh()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div className="relative ml-auto h-full w-full max-w-[420px] bg-white shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">Assign Manager</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">Select who manages all freelancers</p>
          </div>
          <button onClick={close}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

          {/* ── Currently Assigned ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
              Currently Assigned <span className="normal-case font-normal text-gray-400">({assignedMembers.length})</span>
            </p>
            {assignedMembers.length === 0 ? (
              <p className="text-[12px] text-gray-400 italic px-1">No managers assigned yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {assignedMembers.map(m => (
                  <div key={m.id}
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl"
                    style={{ border: "2px solid rgba(249,115,22,0.35)", background: "rgba(249,115,22,0.04)" }}>
                    <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                      style={{ background: "#F97316" }}>
                      <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-gray-800 truncate">{m.name}</p>
                      <p className="text-[11px] text-gray-400">{m.employee_id} · {m.role}</p>
                    </div>
                    <button
                      onClick={() => handleRemove(m.id)}
                      disabled={removing === m.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50"
                      style={{ background: "rgba(239,68,68,0.08)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.2)" }}>
                      {removing === m.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <X size={11} />}
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {removeErr && (
              <p className="text-[11px] text-red-600 bg-red-50 px-3 py-2 rounded-xl mt-2">{removeErr}</p>
            )}
          </div>

          {/* ── Add Manager ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
              Add Manager <span className="normal-case font-normal text-gray-400">({selected.length} selected)</span>
            </p>
            {availableMembers.length === 0 ? (
              <p className="text-[12px] text-gray-400 italic px-1">All members are already assigned.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {availableMembers.map(m => {
                  const checked = selected.includes(m.id)
                  return (
                    <button key={m.id} type="button" onClick={() => toggleSelect(m.id)}
                      className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left transition-all"
                      style={{
                        border: checked ? "2px solid #F97316" : "2px solid #E5E7EB",
                        background: checked ? "rgba(249,115,22,0.05)" : "#FAFAFA",
                      }}>
                      <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
                        style={{ background: checked ? "#F97316" : "#E5E7EB" }}>
                        {checked && <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-gray-800 truncate">{m.name}</p>
                        <p className="text-[11px] text-gray-400">{m.employee_id} · {m.role}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {assignErr && (
              <p className="text-[11px] text-red-600 bg-red-50 px-3 py-2 rounded-xl mt-2">{assignErr}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={close}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all">
            Close
          </button>
          <button type="button" onClick={handleAssign}
            disabled={saving || selected.length === 0}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: saving ? "#fdba74" : "#F97316" }}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TeamClient({ members, pastMembers, freelancers: initFreelancers = [], initialSearch = "", assignedManagerIds = [] }: { members: Member[]; pastMembers: Member[]; freelancers?: FreelancerBasic[]; initialSearch?: string; assignedManagerIds?: string[] }) {
  const router = useRouter()
  const nextId = useMemo(() => computeNextEmployeeId(members), [members])
  const [search, setSearch] = useState(initialSearch)
  const [tabFilter, setTabFilter] = useState<"ALL" | "active" | "inactive">("ALL")
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "MEMBER" | "FREELANCER">("ALL")
  const [freelancers, setFreelancers] = useState(initFreelancers)
  const [flTypeFilter, setFlTypeFilter] = useState<"all" | "voice_over" | "video_editor" | "video_shooter" | "other">("all")
  const [assignSheetOpen, setAssignSheetOpen] = useState(false)
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
  const [resendingWA, setResendingWA] = useState<string | null>(null)
  const [resendWAResult, setResendWAResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const idNum = (id: string) => { const m = id.match(/\d+/); return m ? parseInt(m[0]) : 99999 }
    return members.filter((m) => {
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.employee_id.toLowerCase().includes(q) || (m.team ?? "").toLowerCase().includes(q)
      const matchStatus = tabFilter === "ALL" || m.status === tabFilter
      const matchRole = roleFilter === "ALL"
        || (roleFilter === "ADMIN" && ["ADMIN","FOUNDER","CEO"].includes(m.role))
        || (roleFilter === "MEMBER" && m.role === "MEMBER")
      return matchSearch && matchStatus && matchRole
    }).sort((a, b) => idNum(a.employee_id) - idNum(b.employee_id))
  }, [search, tabFilter, roleFilter, members])

  const stats = {
    total: members.length,
    admins: members.filter((m) => ["ADMIN","FOUNDER","CEO"].includes(m.role)).length,
    teamMembers: members.filter((m) => m.role === "MEMBER").length,
    freelancers: freelancers.length,
  }

  const filteredFreelancers = useMemo(() =>
    flTypeFilter === "all" ? freelancers : freelancers.filter(f => f.type === flTypeFilter),
    [freelancers, flTypeFilter]
  )

  const flTypeCounts = useMemo(() => ({
    all: freelancers.length,
    voice_over: freelancers.filter(f => f.type === "voice_over").length,
    video_editor: freelancers.filter(f => f.type === "video_editor").length,
    video_shooter: freelancers.filter(f => f.type === "video_shooter").length,
    other: freelancers.filter(f => f.type === "other").length,
  }), [freelancers])

  async function handleDeleteFreelancer(id: string, name: string) {
    if (!confirm(`Delete freelancer "${name}"? This cannot be undone.`)) return
    const res = await deleteFreelancer(id)
    if (res.success) {
      setFreelancers(prev => prev.filter(f => f.id !== id))
      startTransition(() => router.refresh())
    }
  }

  // Recent activity: last 6 members sorted by created_at desc
  const recentActivity = useMemo(() =>
    [...members].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 6),
    [members]
  )

  async function handleResendWhatsApp(member: Member) {
    setOpenDropdown(null)
    setResendingWA(member.id)
    setResendWAResult(null)
    const res = await resendOnboardingWhatsApp(member.id)
    setResendingWA(null)
    setResendWAResult({ id: member.id, ok: res.success, msg: res.success ? "WhatsApp sent!" : (res.error ?? "Failed to send") })
    setTimeout(() => setResendWAResult(null), 4000)
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

  const STAT_CARDS: Array<{ label: string; value: number; sub: string; img: string; bg: string; border: string; num: string; role: "ALL" | "ADMIN" | "MEMBER" | "FREELANCER" }> = [
    { label: "Total Members", value: stats.total, sub: "All accounts", img: "/brand/team-total-members.png", bg: "linear-gradient(135deg, #FDF2F8 0%, #FCE7F3 100%)", border: "rgba(236,72,153,0.15)", num: "#EC4899", role: "ALL" },
    { label: "Admin Accounts", value: stats.admins, sub: "Admin access", img: "/brand/team-admins.png", bg: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)", border: "rgba(139,92,246,0.15)", num: "#7C3AED", role: "ADMIN" },
    { label: "Team Members", value: stats.teamMembers, sub: "Member accounts", img: "/brand/team-active-members.png", bg: "linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)", border: "rgba(34,197,94,0.15)", num: "#16A34A", role: "MEMBER" },
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
          <div className="relative flex-1 min-w-[160px] sm:min-w-[220px] max-w-[380px] mx-auto">
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
        {STAT_CARDS.map((s) => {
          const isActive = roleFilter === s.role
          return (
            <div key={s.label}
              onClick={() => { setRoleFilter(isActive ? "ALL" : s.role); setSearch("") }}
              style={{
                background: s.bg, border: `2px solid ${isActive ? s.num : s.border}`, borderRadius: 18,
                padding: "20px 18px 0 22px", overflow: "hidden", position: "relative", minHeight: 148,
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: isActive ? `0 4px 20px ${s.num}33` : "none",
              }}>
              {/* Active indicator */}
              {isActive && (
                <div style={{ position: "absolute", top: 10, right: 10, zIndex: 2, background: s.num, color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 6, letterSpacing: "0.05em" }}>
                  FILTERED
                </div>
              )}
              {/* Illustration */}
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
          )
        })}

        {/* Freelancers card — filterable */}
        {(() => {
          const isActive = roleFilter === "FREELANCER"
          return (
            <div
              onClick={() => { setRoleFilter(isActive ? "ALL" : "FREELANCER"); setSearch("") }}
              style={{
                background: "linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)",
                border: `2px solid ${isActive ? "#F97316" : "rgba(249,115,22,0.18)"}`,
                borderRadius: 18, padding: "20px 18px 0 22px",
                overflow: "hidden", position: "relative", minHeight: 148,
                cursor: "pointer", transition: "all 0.15s",
                boxShadow: isActive ? "0 4px 20px rgba(249,115,22,0.33)" : "none",
              }}>
              {isActive && (
                <div style={{ position: "absolute", top: 10, right: 10, zIndex: 2, background: "#F97316", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 6, letterSpacing: "0.05em" }}>
                  FILTERED
                </div>
              )}
              <div className="absolute right-0 bottom-0 w-24 h-24 sm:w-36 sm:h-32 lg:w-[200px] lg:h-[175px] pointer-events-none">
                <Image src="/brand/team-freelancers.png" alt="Freelancers" fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
              </div>
              <div style={{ position: "relative", zIndex: 1 }}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#F97316", opacity: 0.85 }}>Freelancers</p>
                <p className="text-[42px] font-black leading-none mt-1" style={{ fontFamily: "var(--font-jakarta)", color: "#F97316" }}>{stats.freelancers}</p>
                <p className="text-[11px] mt-1.5 font-medium" style={{ color: "#6B7280" }}>Freelance team</p>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Main 2-column ── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] lg:grid-cols-[1fr_300px] gap-5">

        {/* LEFT: Table */}
        <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>

          {roleFilter === "FREELANCER" ? (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
                <div>
                  <h3 className="text-[15px] font-bold" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>Freelancers</h3>
                  <p className="text-[12px]" style={{ color: "#9CA3AF" }}>{filteredFreelancers.length} of {freelancers.length} freelancer{freelancers.length !== 1 ? "s" : ""}</p>
                </div>
                <button
                  onClick={() => setAssignSheetOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold transition-all"
                  style={{ background: "rgba(249,115,22,0.08)", color: "#F97316", border: "1.5px solid rgba(249,115,22,0.25)" }}>
                  <UserCheck size={13} /> Assign Manager
                </button>
              </div>
              {/* Type filter tabs */}
              <div className="flex items-center gap-1 px-5 py-3 overflow-x-auto" style={{ borderBottom: "1px solid #F3F4F6" }}>
                {([
                  { key: "all",          label: `All (${flTypeCounts.all})` },
                  { key: "voice_over",   label: `Voice Over (${flTypeCounts.voice_over})` },
                  { key: "video_editor", label: `Video Editor (${flTypeCounts.video_editor})` },
                  { key: "video_shooter",label: `Video Shooter (${flTypeCounts.video_shooter})` },
                  { key: "other",        label: `Other (${flTypeCounts.other})` },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setFlTypeFilter(key)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex-shrink-0"
                    style={flTypeFilter === key
                      ? { background: "#F97316", color: "#fff" }
                      : { background: "#F3F4F6", color: "#6B7280" }
                    }>
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="w-full" style={{ minWidth: 560 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }}>
                      {["Name", "Type", "Phone", "Rate", "Status", "Actions"].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#9CA3AF" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFreelancers.length === 0 ? (
                      <tr><td colSpan={6} className="px-5 py-10 text-center text-[13px]" style={{ color: "#9CA3AF" }}>
                        {freelancers.length === 0 ? "No freelancers added yet" : "No freelancers match this filter"}
                      </td></tr>
                    ) : filteredFreelancers.map((f, i) => {
                      const typeCfg = FL_TYPE_CFG[f.type] ?? { label: f.type, color: "#6B7280", bg: "rgba(107,114,128,0.08)" }
                      const rate = f.cost_per_minute ? `₹${f.cost_per_minute}/min`
                        : f.cost_per_video ? `₹${f.cost_per_video}/video`
                        : f.cost_per_hour ? `₹${f.cost_per_hour}/hr`
                        : "—"
                      return (
                        <tr key={f.id} style={{ borderBottom: i < filteredFreelancers.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                          <td className="px-5 py-3.5">
                            <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{f.name}</p>
                            {f.gender && <p className="text-[11px] capitalize" style={{ color: "#9CA3AF" }}>{f.gender}</p>}
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: typeCfg.bg, color: typeCfg.color }}>{typeCfg.label}</span>
                          </td>
                          <td className="px-5 py-3.5 text-[13px]" style={{ color: "#374151" }}>{f.phone ?? "—"}</td>
                          <td className="px-5 py-3.5 text-[13px] font-semibold" style={{ color: "#374151" }}>{rate}</td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                              style={f.status === "active" ? { background: "rgba(34,197,94,0.1)", color: "#16A34A" } : { background: "rgba(107,114,128,0.1)", color: "#6B7280" }}>
                              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: f.status === "active" ? "#16A34A" : "#9CA3AF" }} />
                              {f.status === "active" ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2">
                              <Link href={`/admin/freelancers/${f.id}`}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                                style={{ background: "rgba(249,115,22,0.08)", color: "#F97316", border: "1px solid rgba(249,115,22,0.2)" }}>
                                View <ArrowRight size={10} />
                              </Link>
                              <button
                                onClick={() => handleDeleteFreelancer(f.id, f.name)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                                style={{ background: "rgba(222,26,26,0.07)", color: "#DE1A1A", border: "1px solid rgba(222,26,26,0.18)" }}>
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
          <>
          {/* Table header row */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
            <div>
              <h3 className="text-[15px] font-bold" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>Employee Directory</h3>
              <p className="text-[12px]" style={{ color: "#9CA3AF" }}>{filtered.length} of {members.length} members</p>
            </div>
            <div className="flex items-center gap-2">
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
                          <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden"
                            style={{ background: "rgba(222,26,26,0.08)", border: "1px solid rgba(222,26,26,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {member.passport_photo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={member.passport_photo_url} alt={member.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : (
                              <span className="text-[11px] font-bold" style={{ color: "#de1a1a" }}>{getInitials(member.name)}</span>
                            )}
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold leading-tight" style={{ color: "#111111" }}>{member.name}</p>
                            <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>{member.position ?? member.email ?? "—"}</p>
                          </div>
                        </div>
                      </td>

                      {/* ID */}
                      <td className="px-5 py-3.5">
                        {["ADMIN","FOUNDER","CEO"].includes(member.role) ? (
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(124,58,237,0.08)", color: "#7C3AED" }}>Admin</span>
                        ) : member.role === "FREELANCER_MGR" ? (
                          <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(45,106,79,0.08)", color: "#2D6A4F" }}>Freelancer</span>
                        ) : (
                          <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg" style={{ background: "#F3F4F6", color: "#374151" }}>{member.employee_id}</span>
                        )}
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
                          style={
                            ["ADMIN","FOUNDER","CEO"].includes(member.role)
                              ? { background: "rgba(139,92,246,0.1)", color: "#7C3AED", border: "1px solid rgba(139,92,246,0.2)" }
                              : member.role === "FREELANCER_MGR"
                              ? { background: "rgba(45,106,79,0.1)", color: "#2D6A4F", border: "1px solid rgba(45,106,79,0.2)" }
                              : { background: "rgba(0,0,0,0.04)", color: "#6B7280", border: "1px solid #E5E7EB" }
                          }>
                          <Shield size={9} />
                          {["ADMIN","FOUNDER","CEO"].includes(member.role) ? "Admin"
                            : member.role === "FREELANCER_MGR" ? "Freelancer Mgr"
                            : "Member"}
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
                        {resendWAResult?.id === member.id && (
                          <div className="absolute right-16 z-50 text-[11px] font-bold px-3 py-1.5 rounded-lg shadow"
                            style={{ background: resendWAResult.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)", color: resendWAResult.ok ? "#16A34A" : "#EF4444", border: `1px solid ${resendWAResult.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`, whiteSpace: "nowrap", position: "fixed", bottom: 24, right: 24 }}>
                            {resendWAResult.msg}
                          </div>
                        )}
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

                          <button onClick={() => { setConfirmDelete(member); setOpenDropdown(null) }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            title="Delete member"
                            style={{ color: "#EF4444" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                            <Trash2 size={14} />
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
                              {member.status === "active" && member.role === "MEMBER" && (
                                <>
                                  <button
                                    onClick={() => { setOpenDropdown(null); startImpersonation(member.id) }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold transition-all"
                                    style={{ color: "#6366F1" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.06)"}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                    <LogIn size={12} /> Login as {member.name.split(" ")[0]}
                                  </button>
                                  <div style={{ borderTop: "1px solid #F3F4F6", margin: "2px 0" }} />
                                </>
                              )}
                              {member.drive_folder_id && (
                                <>
                                  <a href={`https://drive.google.com/drive/folders/${member.drive_folder_id}`} target="_blank" rel="noopener noreferrer"
                                    onClick={() => setOpenDropdown(null)}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold transition-all"
                                    style={{ color: "#16A34A", textDecoration: "none", display: "flex" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(22,163,74,0.06)"}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                    <FolderOpen size={12} /> Open Drive Folder
                                  </a>
                                  <div style={{ borderTop: "1px solid #F3F4F6", margin: "2px 0" }} />
                                </>
                              )}
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
                              {member.phone && (
                                <>
                                  <button onClick={() => handleResendWhatsApp(member)} disabled={resendingWA === member.id}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all disabled:opacity-50"
                                    style={{ color: "#22C55E" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(34,197,94,0.06)"}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                    {resendingWA === member.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                    {resendingWA === member.id ? "Sending…" : "Resend WhatsApp"}
                                  </button>
                                  <div style={{ borderTop: "1px solid #F3F4F6", margin: "2px 0" }} />
                                </>
                              )}
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
          </>
          )}
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
                { label: "Total Members", value: `${stats.total}`, icon: <UserCheck size={14} style={{ color: "#F9A8D4" }} />, color: "#F9A8D4" },
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

      <MemberSheet key={editMember?.id ?? "add"} open={sheetOpen} onClose={() => setSheetOpen(false)} member={editMember} nextId={nextId} />

      <AssignManagerSheet
        open={assignSheetOpen}
        onClose={() => setAssignSheetOpen(false)}
        members={members}
        assignedManagerIds={assignedManagerIds}
      />
    </div>
  )
}
