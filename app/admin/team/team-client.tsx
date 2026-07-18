"use client"

import { useState, useMemo, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {
  Search, Plus, Shield, UserCheck,
  MoreVertical, Phone, CalendarDays, X, Pencil,
  Ban, RotateCcw, User, Loader2, Trash2, AlertTriangle, ChevronDown, KeyRound,
  ClipboardList, CheckCircle2, Send, TrendingUp, Star, Clock, Camera, LogIn, Clapperboard, ArrowRight, FolderOpen, LifeBuoy, Check, Users, Sparkles,
} from "lucide-react"
import { createMember, updateMember, toggleMemberStatus, deleteMember, resetMemberPassword, assignTask, uploadPassportPhoto, resendOnboardingWhatsApp } from "@/lib/actions/team"
import { startImpersonation } from "@/lib/actions/impersonate"
import { setSupportHandler } from "@/lib/actions/support"
import { todayIST } from "@/lib/utils/ist-date"
import { createFreelancer, updateFreelancer, toggleFreelancerStatus, assignAllFreelancersToMembers, deleteFreelancer } from "@/lib/actions/freelancers"
import { addManagerToAllFreelancers, removeManagerFromAllFreelancers } from "@/lib/actions/freelancer-manager"
import { useConfirm } from "@/components/ui/ConfirmDialog"

type FreelancerBasic = {
  id: string; name: string; type: string; team: string | null; phone: string | null; upi_id: string | null
  rating: number; status: "active" | "inactive"
  cost_per_minute: number | null; cost_per_video: number | null; cost_per_hour: number | null
  voice_type: string | null; editing_software: string[]; gender: string | null; title: string | null
  created_at: string
  first_work_date?: string | null
}

const FL_TYPE_CFG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  // New 9-team system (team column)
  rj_voiceover:      { label: "RJ Voiceover",    color: "#8B5CF6", bg: "rgba(139,92,246,0.08)",  emoji: "🎙️" },
  video_editor:      { label: "Video Editor",    color: "#0EA5E9", bg: "rgba(14,165,233,0.08)",  emoji: "🎬" },
  video_shooter:     { label: "Video Shooter",   color: "#10B981", bg: "rgba(16,185,129,0.08)",  emoji: "📹" },
  graphics_designer: { label: "Graphics Design", color: "#F97316", bg: "rgba(249,115,22,0.08)",  emoji: "🎨" },
  content_writer:    { label: "Content Writer",  color: "#14B8A6", bg: "rgba(20,184,166,0.08)",  emoji: "✍️" },
  dev_automation:    { label: "Dev & Automation",color: "#6366F1", bg: "rgba(99,102,241,0.08)",  emoji: "💻" },
  nkts_reels:        { label: "NKTS Reels",      color: "#EF4444", bg: "rgba(239,68,68,0.08)",   emoji: "🎞️" },
  voiceover_poster:  { label: "VO & Poster",     color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  emoji: "🖼️" },
  marketing_ops:     { label: "Marketing & Ops", color: "#EC4899", bg: "rgba(236,72,153,0.08)",  emoji: "📊" },
  // Legacy type column fallbacks
  voice_over:        { label: "Voice Over",      color: "#8B5CF6", bg: "rgba(139,92,246,0.08)",  emoji: "🎙️" },
  video_shoot:       { label: "Video Shooter",   color: "#10B981", bg: "rgba(16,185,129,0.08)",  emoji: "📹" },
  other:             { label: "Other",            color: "#6B7280", bg: "rgba(107,114,128,0.08)", emoji: "👤" },
  // Old "Freelance X" format stored in availability_notes / team column
  "Freelance RJ Voiceover":             { label: "RJ Voiceover",    color: "#8B5CF6", bg: "rgba(139,92,246,0.08)",  emoji: "🎙️" },
  "Freelance Video Editor":             { label: "Video Editor",    color: "#0EA5E9", bg: "rgba(14,165,233,0.08)",  emoji: "🎬" },
  "Freelance Video Shooter":            { label: "Video Shooter",   color: "#10B981", bg: "rgba(16,185,129,0.08)",  emoji: "📹" },
  "Freelance Graphics Designer":        { label: "Graphics Design", color: "#F97316", bg: "rgba(249,115,22,0.08)",  emoji: "🎨" },
  "Freelance Content Writer":           { label: "Content Writer",  color: "#14B8A6", bg: "rgba(20,184,166,0.08)",  emoji: "✍️" },
  "Freelance Software Development & Automation": { label: "SW Dev & Automation",color: "#6366F1", bg: "rgba(99,102,241,0.08)",  emoji: "💻" },
  "Freelance Marketing & Operations":   { label: "Marketing & Ops", color: "#EC4899", bg: "rgba(236,72,153,0.08)",  emoji: "📊" },
  "Freelance AI Development & Creative Production": { label: "AI & Creative Production", color: "#8B5CF6", bg: "rgba(139,92,246,0.08)",  emoji: "🖥️" },
  "Freelance Media Production":         { label: "Media Production", color: "#EC4899", bg: "rgba(236,72,153,0.08)",  emoji: "🎥" },
}

function getFreelancerTeamKey(f: FreelancerBasic): string {
  return f.team || f.type || "other"
}

const FULL_TIME_TEAMS = [
  "Media Production Team",
  "Creative Studio",
  "Software Development & Automation",
  "Performance Marketing & Operations",
  "AI Development & Creative Production",
] as const

const FREELANCER_TEAMS = [
  "Freelance Media Production",
  "Freelance Video Editing",
  "Freelance Videography",
  "Freelance RJ Voiceover",
  "Freelance Graphics Designer",
  "Freelance Content Writer",
  "Freelance Software Development & Automation",
  "Freelance Marketing & Operations",
  "Freelance AI Development & Creative Production",
] as const

// Shared column widths for the Login Members and No-Login Freelancers tables —
// they're two separate <table> elements, so without matching fixed widths each
// one auto-sizes its columns independently and they drift out of alignment
// even though the column headers (Member/Freelancer, Department, Phone, Status,
// Joined, Actions) are otherwise identical.
const FREELANCER_TABLE_COL_WIDTHS = ["20%", "28%", "14%", "12%", "15%", "11%"]

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
  is_support_handler?: boolean | null
  work_layout?: 'media' | 'non_media' | 'freelance_media' | null
  is_management?: boolean | null
  is_freelancer_login?: boolean | null
  enabled_blocks?: string[] | null
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

// Strips a leading +91/91 country code so numbers display as the plain 10-digit
// mobile number — only when the number is longer than 10 digits, so a genuine
// 10-digit number that happens to start with 91 (a valid Indian mobile prefix) is left alone.
function formatPhoneDisplay(phone?: string | null): string {
  if (!phone) return "—"
  let p = phone.trim()
  if (p.startsWith("+91") && p.length > 13) p = p.slice(3)
  else if (p.startsWith("91") && p.length > 10) p = p.slice(2)
  return p
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
  if (team === "Software Development & Automation" || team === "Freelance Software Development & Automation") return { bg: "rgba(99,102,241,0.1)", color: "#6366F1" }
  if (team === "Performance Marketing & Operations" || team === "Freelance Marketing & Operations" || team === "Technology & Operation Team" || team.includes("Tech & Ops")) return { bg: "rgba(16,185,129,0.1)", color: "#10B981" }
  if (team === "AI Development & Creative Production" || team === "Freelance AI Development & Creative Production" || team.includes("Media & Tech")) return { bg: "rgba(139,92,246,0.1)", color: "#8B5CF6" }
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
  if (team === "Software Development & Automation") return "SW Dev & Auto"
  if (team === "Performance Marketing & Operations" || team.includes("Tech & Ops") || team === "Technology & Operation Team") return "Perf. Marketing"
  if (team === "AI Development & Creative Production" || team.includes("Media & Tech")) return "AI & Creative Prod"
  if (team === "Freelance Media Production") return "FL Media"
  if (team === "Freelance Video Editing") return "FL Editing"
  if (team === "Freelance Videography") return "FL Videography"
  if (team === "Freelance RJ Voiceover") return "FL Voiceover"
  if (team === "Freelance Graphics Designer") return "FL Graphics"
  if (team === "Freelance Content Writer") return "FL Content"
  if (team === "Freelance Software Development & Automation") return "FL SW Dev & Auto"
  if (team === "Freelance Marketing & Operations") return "FL Marketing"
  if (team === "Freelance AI Development & Creative Production") return "FL AI & Creative"
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
  "Freelance Video Editing",
  "Freelance Videography",
  "Freelance RJ Voiceover",
  "Freelance Graphics Designer",
  "Freelance Content Writer",
  "Freelance Software Development & Automation",
  "Freelance Marketing & Operations",
  "Freelance AI Development & Creative Production",
])

// Non-media work-block checklist — controls which "+ Add" entry sections a person sees.
// Values must exactly match the real task_type strings used in daily_updates.work_entries.
const NON_MEDIA_BLOCK_OPTIONS: { value: string; label: string }[] = [
  { value: "other",       label: "Technical" },
  { value: "edit",        label: "Basic Editing" },
  { value: "poster",      label: "Posters" },
  { value: "voiceover",   label: "Voiceover" },
  { value: "development", label: "Development" },
  { value: "scripting",   label: "Scripting" },
]
const ALL_NON_MEDIA_BLOCKS = NON_MEDIA_BLOCK_OPTIONS.map(o => o.value)

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
    joined_at: member?.joined_at ?? todayIST(),
    gender: (member?.gender ?? "male") as "male" | "female",
    work_layout: (member?.work_layout ?? "non_media") as "media" | "non_media" | "freelance_media",
    is_management: member?.is_management ?? false,
    enabled_blocks: (member?.enabled_blocks && member.enabled_blocks.length > 0) ? member.enabled_blocks : ALL_NON_MEDIA_BLOCKS,
    salary_effective_month: (() => {
      const d = new Date(); d.setMonth(d.getMonth() + 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    })(),
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
          position: form.position || undefined,
          email: form.email || undefined,
          date_of_birth: form.date_of_birth || null,
          joined_at: form.joined_at || null,
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
      const salaryChanged = isEdit && form.monthly_salary !== (member?.monthly_salary?.toString() ?? "")
      const salaryEffectiveFrom = salaryChanged ? `${form.salary_effective_month}-01` : undefined
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
        const result = await updateMember({ id: member!.id, name: form.name, email: form.email, phone: form.phone, role: form.role, team: form.team, position: form.position || null, gender: form.gender, work_layout: form.work_layout, is_management: form.is_management, enabled_blocks: form.work_layout === "non_media" ? form.enabled_blocks : null, ...salaryFields, ...dateFields, salaryEffectiveFrom })
        if (result.success) { router.refresh(); onClose() }
        else setError(result.error ?? "Something went wrong")
      } else {
        const isAdminCreate = form.role === "ADMIN" || form.role === "FOUNDER" || form.role === "CEO" || form.role === "FREELANCER_MGR"
        const nameForCreate = form.name.trim() || (isAdminCreate ? form.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "")
        const result = await createMember({ name: nameForCreate, employee_id: form.employee_id, email: form.email, phone: form.phone, role: form.role, team: form.team, position: form.position || null, password: form.password, gender: form.gender, work_layout: form.work_layout, is_management: form.is_management, enabled_blocks: form.work_layout === "non_media" ? form.enabled_blocks : null, ...salaryFields, ...dateFields })
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
                <ChevronDown size={13} style={{ color: "#5C3D1F", transform: "rotate(90deg)" }} />
              </button>
            )}
            <div>
              <h2 className="text-[17px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                {isEdit ? "Edit Member" : step === "type" ? "Select Account Type" : `New ${selectedType.label}`}
              </h2>
              <p className="text-[12px] mt-0.5" style={{ color: "#5C3D1F" }}>
                {isEdit ? "Update member details" : step === "type" ? "Choose the type of account to create" : selectedType.desc}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:bg-gray-100"
            style={{ border: "1px solid #E5E7EB" }}>
            <X size={14} style={{ color: "#5C3D1F" }} />
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
                      <p className="text-[12px] mt-0.5" style={{ color: "#5C3D1F" }}>{type.desc}</p>
                    </div>
                    <ChevronDown size={14} style={{ color: "#5C3D1F", transform: "rotate(-90deg)", flexShrink: 0 }} />
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
                  <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Passport Photo</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 64, height: 80, borderRadius: 10, overflow: "hidden", flexShrink: 0, border: "2px solid #E5E7EB", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {(photoPreview ?? member?.passport_photo_url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photoPreview ?? member?.passport_photo_url ?? ""} alt="Passport" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <User size={22} style={{ color: "#5C3D1F" }} />
                      )}
                    </div>
                    <label style={{ flex: 1, cursor: "pointer" }}>
                      <div style={{ padding: "12px", borderRadius: 10, border: "1.5px dashed #E5E7EB", background: "#FAFAFA", textAlign: "center" }}>
                        <Camera size={16} style={{ color: "#5C3D1F", margin: "0 auto 5px" }} />
                        <p style={{ fontSize: 12, fontWeight: 600, color: "#5C3D1F" }}>{(photoPreview ?? member?.passport_photo_url) ? "Change Photo" : "Upload Photo"}</p>
                        <p style={{ fontSize: 10, color: "#5C3D1F", marginTop: 2 }}>JPG or PNG · Max 2MB</p>
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
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Email Address *</label>
                    <input type="email" className="sheet-input" value={form.email} onChange={set("email")} placeholder="e.g. manager@gmail.com" style={FIELD} />
                    <p className="text-[11px] mt-1.5" style={{ color: "#5C3D1F" }}>Logs in with this email + password directly.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Password *</label>
                    <input type="text" className="sheet-input" value={form.password} onChange={set("password")} placeholder="Min 6 characters" style={FIELD} />
                  </div>
                </>
              ) : isFreelancerMgr && isEdit ? (
                /* Freelancer Mgr edit — name + email */
                <>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Name *</label>
                    <input className="sheet-input" value={form.name} onChange={set("name")} placeholder="e.g. Karthik R" style={FIELD} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Email Address *</label>
                    <input type="email" className="sheet-input" value={form.email} onChange={set("email")} placeholder="e.g. karthik@gmail.com" style={FIELD} />
                  </div>
                </>
              ) : isAdmin && !isEdit ? (
                /* Admin create — Email + Password only */
                <>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Gmail Address *</label>
                    <input type="email" className="sheet-input" value={form.email} onChange={set("email")} placeholder="e.g. admin@gmail.com" style={FIELD} />
                    <p className="text-[11px] mt-1.5" style={{ color: "#5C3D1F" }}>Admin logs in with this Gmail + password directly.</p>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Password *</label>
                    <input type="text" className="sheet-input" value={form.password} onChange={set("password")} placeholder="Min 6 characters" style={FIELD} />
                  </div>
                </>
              ) : (
                /* Member / Admin edit — full fields */
                <>
                  {/* Employment Type toggle — Full Time / Part Time */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Employment Type *</label>
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
                            : { background: "rgba(0,0,0,0.03)", color: "#5C3D1F", border: "1px solid #E5E7EB" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Team — filtered by employment type */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Team *</label>
                    <div className="relative">
                      <select className="sheet-input" value={form.team}
                        onChange={e => {
                          const t = e.target.value
                          const autoLayout: "media" | "non_media" | "freelance_media" =
                            t === "Media Production Team" || t === "Media Team" ? "media"
                            : t === "Freelance Media Production" ? "freelance_media"
                            : "non_media"
                          setForm(prev => ({ ...prev, team: t, work_layout: autoLayout }))
                        }}
                        style={{ ...FIELD, appearance: "none", paddingRight: "36px" }}>
                        <option value="">Select a team…</option>
                        {form.employment_type === "regular" ? (
                          FULL_TIME_TEAMS.map(t => <option key={t} value={t}>{t}</option>)
                        ) : (
                          <>
                            <optgroup label="── Login (has app access)">
                              {(["Freelance Media Production"] as const).map(t => <option key={t} value={t}>{t}</option>)}
                            </optgroup>
                            <optgroup label="── No Login (manager enters work)">
                              {(["Freelance Video Editing","Freelance Videography","Freelance RJ Voiceover","Freelance Graphics Designer","Freelance Content Writer","Freelance Software Development & Automation","Freelance Marketing & Operations","Freelance AI Development & Creative Production"] as const).map(t => <option key={t} value={t}>{t}</option>)}
                            </optgroup>
                          </>
                        )}
                      </select>
                      <ChevronDown size={13} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#5C3D1F" }} />
                    </div>
                    {isNoLoginTeam && (
                      <p className="text-[11px] mt-1.5 font-semibold" style={{ color: "#F97316" }}>
                        No-login — only name &amp; phone needed.
                      </p>
                    )}
                  </div>

                  {/* Work Layout — shown for members with login */}
                  {!isNoLoginTeam && form.team && (() => {
                    const isFreelanceTeam = form.team === "Freelance Media Production"
                    const layoutOptions = isFreelanceTeam
                      ? [{ value: "freelance_media" as const, label: "FREELANCE MEDIA" }]
                      : [
                          { value: "media"    as const, label: "MEDIA" },
                          { value: "non_media" as const, label: "NON MEDIA" },
                        ]
                    return (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Layout *</label>
                      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${layoutOptions.length}, 1fr)` }}>
                        {layoutOptions.map(({ value, label }) => (
                          <button key={value} type="button"
                            onClick={() => setForm(prev => ({ ...prev, work_layout: value }))}
                            style={{
                              padding: "10px 8px", borderRadius: 10, fontSize: 12, fontWeight: 800,
                              border: "1.5px solid", cursor: "pointer", transition: "all 0.15s", textAlign: "center",
                              background: form.work_layout === value ? "rgba(222,26,26,0.08)" : "rgba(0,0,0,0.03)",
                              borderColor: form.work_layout === value ? "#DE1A1A" : "#E5E7EB",
                              color: form.work_layout === value ? "#DE1A1A" : "#5C3D1F",
                            }}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    )
                  })()}

                  {/* Enabled Work Blocks — non-media only, controls which "+ Add" sections this person sees */}
                  {!isNoLoginTeam && form.team && form.work_layout === "non_media" && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>
                        Daily Update Blocks
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {NON_MEDIA_BLOCK_OPTIONS.map(({ value, label }) => {
                          const checked = form.enabled_blocks.includes(value)
                          return (
                            <button key={value} type="button"
                              onClick={() => setForm(prev => ({
                                ...prev,
                                enabled_blocks: checked
                                  ? prev.enabled_blocks.filter(v => v !== value)
                                  : [...prev.enabled_blocks, value],
                              }))}
                              style={{
                                padding: "9px 10px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                                border: "1.5px solid", cursor: "pointer", transition: "all 0.15s", textAlign: "left",
                                display: "flex", alignItems: "center", gap: 8,
                                background: checked ? "rgba(222,26,26,0.08)" : "rgba(0,0,0,0.03)",
                                borderColor: checked ? "#DE1A1A" : "#E5E7EB",
                                color: checked ? "#DE1A1A" : "#6B7280",
                              }}>
                              <span style={{
                                width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                                border: "1.5px solid", borderColor: checked ? "#DE1A1A" : "#D1D5DB",
                                background: checked ? "#DE1A1A" : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}>
                                {checked && <Check size={11} style={{ color: "#FFFFFF" }} />}
                              </span>
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Full Name — always shown */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Full Name *</label>
                    <input className="sheet-input" value={form.name} onChange={set("name")} placeholder="e.g. Priya Sharma" style={FIELD} />
                  </div>

                  {/* Gender — always shown */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Gender *</label>
                    <div style={{ display: "flex", gap: 10 }}>
                      {(["male", "female"] as const).map(g => (
                        <button key={g} type="button" onClick={() => setForm(p => ({ ...p, gender: g }))}
                          style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 700, border: "1.5px solid", cursor: "pointer", transition: "all 0.15s",
                            background: form.gender === g ? (g === "male" ? "rgba(59,130,246,0.08)" : "rgba(236,72,153,0.08)") : "#F9FAFB",
                            borderColor: form.gender === g ? (g === "male" ? "#3B82F6" : "#EC4899") : "#E5E7EB",
                            color: form.gender === g ? (g === "male" ? "#2563EB" : "#DB2777") : "#5C3D1F",
                          }}>
                          {g === "male" ? "👦 Male" : "👧 Female"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Phone — always shown */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>WhatsApp Number</label>
                    <input className="sheet-input" value={form.phone} onChange={set("phone")} placeholder="e.g. 919876543210" style={FIELD} />
                    {!isNoLoginTeam && <p className="text-[11px] mt-1.5" style={{ color: "#5C3D1F" }}>Credentials will be sent here after account creation.</p>}
                  </div>

                  {/* Position — shown for all (full time + login + no-login) */}
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Position / Designation</label>
                    <input className="sheet-input" value={form.position} onChange={set("position")} placeholder="e.g. Voice Artist, Video Editor…" style={FIELD} />
                  </div>

                  {/* Employee ID — full time + login freelancers only */}
                  {!isNoLoginTeam && !isEdit && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>
                        Employee ID * <span style={{ color: "#22C55E", fontWeight: 700, textTransform: "none", letterSpacing: 0 }}>· Auto-generated</span>
                      </label>
                      <input className="sheet-input" value={form.employee_id} onChange={set("employee_id")} placeholder="e.g. GF001" style={{ ...FIELD, fontFamily: "monospace", fontWeight: 700 }} />
                      <p className="text-[11px] mt-1.5" style={{ color: "#5C3D1F" }}>Auto-filled — you can change it. Cannot be edited after creation.</p>
                    </div>
                  )}

                  {/* Email — hidden for no-login teams */}
                  {!isNoLoginTeam && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Email Address *</label>
                      <input type="email" className="sheet-input" value={form.email} onChange={set("email")} placeholder="e.g. priya@gmail.com" style={FIELD} />
                    </div>
                  )}

                  {/* Salary fields — Full Time only */}
                  {!isNoLoginTeam && form.employment_type === "regular" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Monthly Salary (₹)</label>
                        <input type="number" min="0" step="500" className="sheet-input" style={FIELD}
                          placeholder="e.g. 15000" value={form.monthly_salary}
                          onChange={(e) => setForm((prev) => ({ ...prev, monthly_salary: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Paid Leave/Month</label>
                        <input type="number" min="0" max="30" step="1" className="sheet-input" style={FIELD}
                          placeholder="5" value={form.paid_leave_days}
                          onChange={(e) => setForm((prev) => ({ ...prev, paid_leave_days: e.target.value }))} />
                      </div>
                    </div>
                  )}

                  {/* Effective From — only appears once the salary value is actually changed */}
                  {isEdit && form.employment_type === "regular" &&
                    form.monthly_salary !== (member?.monthly_salary?.toString() ?? "") && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#6B7280" }}>Effective From (salary change)</label>
                      <input type="month" className="sheet-input" style={{ ...FIELD, colorScheme: "light" }}
                        value={form.salary_effective_month}
                        onChange={(e) => setForm((prev) => ({ ...prev, salary_effective_month: e.target.value }))} />
                      <p className="text-[10px] mt-1.5" style={{ color: "#9CA3AF" }}>Past months stay locked at the old salary.</p>
                    </div>
                  )}

                  {/* DOB — hidden for no-login teams; Work Start — always shown */}
                  <div className={isNoLoginTeam ? "" : "grid grid-cols-1 md:grid-cols-2 gap-3"}>
                    {!isNoLoginTeam && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Date of Birth</label>
                        <input type="date" max="2099-12-31" className="sheet-input" style={{ ...FIELD, colorScheme: "light" }} value={form.date_of_birth} onChange={set("date_of_birth")} />
                      </div>
                    )}
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>Work Start Date</label>
                      <input type="date" className="sheet-input" style={{ ...FIELD, colorScheme: "light" }} value={form.joined_at} onChange={set("joined_at")} max={todayIST()} />
                    </div>
                  </div>

                  {/* Password — login accounts only */}
                  {!isNoLoginTeam && !isEdit && (
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-2" style={{ color: "#5C3D1F" }}>
                        {isAdmin ? "Password *" : "Temporary Password *"}
                      </label>
                      <input type="text" className="sheet-input" value={form.password} onChange={set("password")} placeholder="Min 6 characters" style={FIELD} />
                      {!isAdmin && <p className="text-[11px] mt-1.5" style={{ color: "#5C3D1F" }}>Will be sent via WhatsApp.</p>}
                    </div>
                  )}
                </>
              )}

              {/* Management Member toggle — shown for regular team members only */}
              {!isNoLoginTeam && form.role === "MEMBER" && (
                <div
                  onClick={() => setForm(p => ({ ...p, is_management: !p.is_management }))}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 14px", borderRadius: 12, cursor: "pointer",
                    background: form.is_management ? "rgba(99,102,241,0.06)" : "rgba(0,0,0,0.02)",
                    border: `1.5px solid ${form.is_management ? "rgba(99,102,241,0.3)" : "#E5E7EB"}`,
                    transition: "all 0.15s",
                  }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: form.is_management ? "#6366F1" : "#5C3D1F", margin: 0 }}>
                      Management Member
                    </p>
                    <p style={{ fontSize: 11, color: "#5C3D1F", margin: "2px 0 0" }}>
                      No attendance or daily update required
                    </p>
                  </div>
                  <div style={{
                    width: 36, height: 20, borderRadius: 10, position: "relative", flexShrink: 0,
                    background: form.is_management ? "#6366F1" : "#D1D5DB",
                    transition: "background 0.2s",
                  }}>
                    <div style={{
                      position: "absolute", top: 2, left: form.is_management ? 18 : 2,
                      width: 16, height: 16, borderRadius: "50%", background: "#FFFFFF",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 0.2s",
                    }} />
                  </div>
                </div>
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
              style={{ background: "rgba(0,0,0,0.03)", color: "#5C3D1F", border: "1px solid #E5E7EB" }}>
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
                <p className="text-[12px] mt-0.5" style={{ color: "#5C3D1F" }}>
                  To <strong style={{ color: "#111111" }}>{member.name}</strong>
                  {member.team ? <span style={{ color: "#5C3D1F" }}> · {member.team}</span> : null}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: "1px solid #E5E7EB" }}>
              <X size={13} style={{ color: "#5C3D1F" }} />
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
                  <p className="text-[12px] mt-1.5" style={{ color: "#5C3D1F" }}>
                    {member.phone ? "WhatsApp notification failed — task still created." : "No phone number — task created without notification."}
                  </p>
                )}
              </div>
              <button onClick={onClose} className="mt-2 px-6 py-2.5 rounded-xl text-[13px] font-semibold"
                style={{ background: "rgba(0,0,0,0.04)", color: "#5C3D1F", border: "1px solid #E5E7EB" }}>
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
                <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: "#5C3D1F" }}>Task Title *</label>
                <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Upload shoot clips to Drive"
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111", fontFamily: "inherit" }} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: "#5C3D1F" }}>Description <span style={{ color: "#5C3D1F", fontWeight: 600 }}>(optional)</span></label>
                <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="Add context, links, or instructions…"
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none resize-none"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111", fontFamily: "inherit" }} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: "#5C3D1F" }}>Due Date <span style={{ color: "#5C3D1F", fontWeight: 600 }}>(optional)</span></label>
                <input type="date" min={todayIST()} max="2099-12-31" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  className="w-full rounded-xl px-4 py-2.5 text-[13px] outline-none"
                  style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111", colorScheme: "light", fontFamily: "inherit" }} />
              </div>
              {error && (
                <p className="text-[12px] rounded-xl px-4 py-2.5"
                  style={{ background: "rgba(222,26,26,0.06)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.15)" }}>{error}</p>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                  style={{ background: "rgba(0,0,0,0.03)", color: "#5C3D1F", border: "1px solid #E5E7EB" }}>
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
  { key: "rj_voiceover",      label: "RJ Voiceover",    emoji: "🎙️", color: "#8B5CF6", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.3)" },
  { key: "video_editor",      label: "Video Editor",    emoji: "🎬", color: "#0EA5E9", bg: "rgba(14,165,233,0.08)",  border: "rgba(14,165,233,0.3)" },
  { key: "video_shooter",     label: "Video Shooter",   emoji: "📹", color: "#10B981", bg: "rgba(16,185,129,0.08)",  border: "rgba(16,185,129,0.3)" },
  { key: "graphics_designer", label: "Graphics Design", emoji: "🎨", color: "#F97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.3)" },
  { key: "content_writer",    label: "Content Writer",  emoji: "✍️", color: "#14B8A6", bg: "rgba(20,184,166,0.08)",  border: "rgba(20,184,166,0.3)" },
  { key: "dev_automation",    label: "Dev & Automation",emoji: "💻", color: "#6366F1", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.3)" },
  { key: "nkts_reels",        label: "NKTS Reels",      emoji: "🎞️", color: "#EF4444", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.3)" },
  { key: "voiceover_poster",  label: "VO & Poster",     emoji: "🖼️", color: "#F59E0B", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.3)" },
  { key: "marketing_ops",     label: "Marketing & Ops", emoji: "📊", color: "#EC4899", bg: "rgba(236,72,153,0.08)",  border: "rgba(236,72,153,0.3)" },
]

// No-login freelancers — keys match NO_LOGIN_TEAMS and FREELANCER_TEAMS exactly
const NO_LOGIN_FL_TYPES = [
  { key: "Freelance Video Editing",            label: "Video Editing",   emoji: "🎬", color: "#6366F1", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.3)" },
  { key: "Freelance Videography",              label: "Videography",     emoji: "📹", color: "#0EA5E9", bg: "rgba(14,165,233,0.08)",   border: "rgba(14,165,233,0.3)" },
  { key: "Freelance RJ Voiceover",             label: "RJ Voiceover",    emoji: "🎙️", color: "#8B5CF6", bg: "rgba(139,92,246,0.08)", border: "rgba(139,92,246,0.3)" },
  { key: "Freelance Graphics Designer",        label: "Graphics Design", emoji: "🎨", color: "#F97316", bg: "rgba(249,115,22,0.08)",  border: "rgba(249,115,22,0.3)" },
  { key: "Freelance Content Writer",           label: "Content Writer",  emoji: "✍️", color: "#14B8A6", bg: "rgba(20,184,166,0.08)",  border: "rgba(20,184,166,0.3)" },
  { key: "Freelance Software Development & Automation", label: "SW Dev & Auto",   emoji: "💻", color: "#6366F1", bg: "rgba(99,102,241,0.08)",  border: "rgba(99,102,241,0.3)" },
  { key: "Freelance Marketing & Operations",   label: "Marketing & Ops", emoji: "📊", color: "#EC4899", bg: "rgba(236,72,153,0.08)",  border: "rgba(236,72,153,0.3)" },
  { key: "Freelance AI Development & Creative Production", label: "AI & Creative", emoji: "🖥️", color: "#8B5CF6", bg: "rgba(139,92,246,0.08)",  border: "rgba(139,92,246,0.3)" },
]

function FreelancerQuickSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<"type" | "details">("type")
  const [type, setType] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [gender, setGender] = useState("")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")
  const [success, setSuccess] = useState(false)

  function reset() {
    setStep("type"); setType(""); setName(""); setPhone(""); setGender(""); setSaving(false); setErr(""); setSuccess(false)
  }
  function close() { reset(); onClose() }

  const cfg = NO_LOGIN_FL_TYPES.find(t => t.key === type)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr("Name is required"); return }
    setSaving(true); setErr("")
    const res = await createFreelancer({
      name: name.trim(), type: "other", team: type,
      phone: phone || undefined, gender: gender || undefined,
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
          <button onClick={close} className="w-8 h-8 rounded-full flex items-center justify-center text-[#5C3D1F] font-semibold hover:text-gray-600 hover:bg-gray-100 transition-all">
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
              <p className="text-[13px] text-[#5C3D1F] font-semibold">{name} has been added. Manager can now enter their work.</p>
              <button onClick={reset} className="px-4 py-2.5 rounded-xl text-[13px] font-bold text-white" style={{ background: "#F97316" }}>
                Add Another
              </button>
            </div>
          ) : step === "type" ? (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-[#5C3D1F] font-semibold">Select freelancer type to continue</p>
              <div className="grid grid-cols-2 gap-3">
                {NO_LOGIN_FL_TYPES.map(t => (
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
                className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5C3D1F] font-semibold hover:text-gray-600 -mt-1">
                ← Change type
              </button>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#5C3D1F] font-semibold mb-1.5">Full Name *</label>
                <input className={FIELD_CLS} placeholder="e.g. Ravi Kumar" value={name} onChange={e => setName(e.target.value)} />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#5C3D1F] font-semibold mb-2">Gender</label>
                <div className="flex gap-2">
                  {["male","female"].map(g => (
                    <button key={g} type="button"
                      onClick={() => setGender(gender === g ? "" : g)}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-bold capitalize transition-all"
                      style={gender === g ? { background: "#F97316", color: "#fff", border: "2px solid #F97316" } : { background: "#F9FAFB", color: "#5C3D1F", border: "2px solid #E5E7EB" }}>
                      {g === "male" ? "Male" : "Female"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#5C3D1F] font-semibold mb-1.5">Phone</label>
                <input className={FIELD_CLS} inputMode="numeric" placeholder="9876543210" value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))} />
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

// ── Freelancer Edit Sheet ────────────────────────────────────────────────────

function FreelancerEditSheet({ freelancer, open, onClose, onSaved }: {
  freelancer: FreelancerBasic | null; open: boolean
  onClose: () => void; onSaved: (updated: FreelancerBasic) => void
}) {
  const [team, setTeam] = useState(freelancer?.team ?? "")
  const [name, setName] = useState(freelancer?.name ?? "")
  const [phone, setPhone] = useState(freelancer?.phone ?? "")
  const [gender, setGender] = useState(freelancer?.gender ?? "")
  const [status, setStatus] = useState<"active" | "inactive">(freelancer?.status ?? "active")
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => {
    if (freelancer) {
      setTeam(freelancer.team ?? ""); setName(freelancer.name); setPhone(freelancer.phone ?? "")
      setGender(freelancer.gender ?? ""); setStatus(freelancer.status); setErr("")
    }
  }, [freelancer])

  if (!open || !freelancer) return null
  const cfg = NO_LOGIN_FL_TYPES.find(t => t.key === team)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setErr("Name is required"); return }
    if (!team) { setErr("Team is required"); return }
    setSaving(true); setErr("")
    const res = await updateFreelancer(freelancer!.id, {
      name: name.trim(), type: "other", team, phone: phone || undefined,
      gender: gender || undefined, status,
    })
    if (!res.success) { setErr(res.error ?? "Failed to save"); setSaving(false); return }
    onSaved({ ...freelancer!, name: name.trim(), team, phone: phone || null, gender: gender || null, status })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto h-full w-full max-w-[420px] bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-[16px] font-bold text-gray-900">Edit Freelancer</h2>
            {cfg && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full mt-0.5 inline-block" style={{ background: cfg.bg, color: cfg.color }}>{cfg.emoji} {cfg.label}</span>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[#5C3D1F] font-semibold hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X size={16} />
          </button>
        </div>
        <form id="fl-edit-form" onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {/* Team picker */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#5C3D1F] font-semibold mb-2">Team *</label>
            <div className="grid grid-cols-3 gap-2">
              {NO_LOGIN_FL_TYPES.map(t => (
                <button key={t.key} type="button" onClick={() => setTeam(t.key)}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all"
                  style={team === t.key ? { background: t.color, border: `2px solid ${t.color}` } : { background: t.bg, border: `2px solid ${t.border}` }}>
                  <span style={{ fontSize: 20 }}>{t.emoji}</span>
                  <span className="text-[10px] font-bold leading-tight" style={{ color: team === t.key ? "#fff" : "#5C3D1F" }}>{t.label}</span>
                </button>
              ))}
            </div>
          </div>
          {/* Name */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#5C3D1F] font-semibold mb-1.5">Full Name *</label>
            <input className={FIELD_CLS} placeholder="e.g. Ravi Kumar" value={name} onChange={e => setName(e.target.value)} />
          </div>
          {/* Gender */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#5C3D1F] font-semibold mb-2">Gender</label>
            <div className="flex gap-2">
              {["male", "female"].map(g => (
                <button key={g} type="button" onClick={() => setGender(gender === g ? "" : g)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold capitalize transition-all"
                  style={gender === g ? { background: "#F97316", color: "#fff", border: "2px solid #F97316" } : { background: "#F9FAFB", color: "#5C3D1F", border: "2px solid #E5E7EB" }}>
                  {g === "male" ? "Male" : "Female"}
                </button>
              ))}
            </div>
          </div>
          {/* Phone */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#5C3D1F] font-semibold mb-1.5">Phone</label>
            <input className={FIELD_CLS} inputMode="numeric" placeholder="9876543210" value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))} />
          </div>
          {/* Status */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#5C3D1F] font-semibold mb-2">Status</label>
            <div className="flex gap-2">
              {(["active", "inactive"] as const).map(s => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-bold capitalize transition-all"
                  style={status === s
                    ? { background: s === "active" ? "#16A34A" : "#6B7280", color: "#fff", border: `2px solid ${s === "active" ? "#16A34A" : "#6B7280"}` }
                    : { background: "#F9FAFB", color: "#5C3D1F", border: "2px solid #E5E7EB" }}>
                  {s === "active" ? "Active" : "Inactive"}
                </button>
              ))}
            </div>
          </div>
          {err && <p className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-xl">{err}</p>}
        </form>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-all">Cancel</button>
          <button type="submit" form="fl-edit-form" disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
            style={{ background: saving ? "#fdba74" : "#F97316" }}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
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
    .filter(m => m.role === "MEMBER" && !m.is_freelancer_login)
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
            <p className="text-[12px] text-[#5C3D1F] font-semibold mt-0.5">Select who manages all freelancers</p>
          </div>
          <button onClick={close}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#5C3D1F] font-semibold hover:text-gray-600 hover:bg-gray-100 transition-all">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">

          {/* ── Currently Assigned ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#5C3D1F] font-semibold mb-2">
              Currently Assigned <span className="normal-case font-normal text-[#5C3D1F] font-semibold">({assignedMembers.length})</span>
            </p>
            {assignedMembers.length === 0 ? (
              <p className="text-[12px] text-[#5C3D1F] font-semibold italic px-1">No managers assigned yet.</p>
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
                      <p className="text-[11px] text-[#5C3D1F] font-semibold">{m.employee_id} · {m.role}</p>
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
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#5C3D1F] font-semibold mb-2">
              Add Manager <span className="normal-case font-normal text-[#5C3D1F] font-semibold">({selected.length} selected)</span>
            </p>
            {availableMembers.length === 0 ? (
              <p className="text-[12px] text-[#5C3D1F] font-semibold italic px-1">All members are already assigned.</p>
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
                        <p className="text-[11px] text-[#5C3D1F] font-semibold">{m.employee_id} · {m.role}</p>
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

export default function TeamClient({ members, pastMembers, freelancers: initFreelancers = [], pastFreelancers: initPastFreelancers = [], initialSearch = "", assignedManagerIds = [] }: { members: Member[]; pastMembers: Member[]; freelancers?: FreelancerBasic[]; pastFreelancers?: FreelancerBasic[]; initialSearch?: string; assignedManagerIds?: string[] }) {
  const router = useRouter()
  const confirm = useConfirm()
  const nextId = useMemo(() => computeNextEmployeeId(members), [members])
  const [search, setSearch] = useState(initialSearch)
  const [tabFilter, setTabFilter] = useState<"ALL" | "active" | "inactive">("ALL")
  const [roleFilter, setRoleFilter] = useState<"ALL" | "ADMIN" | "MEMBER" | "FREELANCER">("ALL")
  const [freelancers, setFreelancers] = useState(initFreelancers)
  const [pastFreelancers, setPastFreelancers] = useState(initPastFreelancers)
  const [showPastFreelancers, setShowPastFreelancers] = useState(false)
  const [flTypeFilter, setFlTypeFilter] = useState<string>("all")
  const [editingFreelancer, setEditingFreelancer] = useState<FreelancerBasic | null>(null)
  const [assignSheetOpen, setAssignSheetOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editMember, setEditMember] = useState<Member | null>(null)

  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const [dropdownAnchor, setDropdownAnchor] = useState<{ top: number; right: number } | null>(null)
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

  const loginFreelancerMembers = useMemo(() => members.filter(m => m.is_freelancer_login === true), [members])
  const regularMembers = useMemo(() => members.filter(m => !m.is_freelancer_login), [members])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const idNum = (id: string) => { const m = id.match(/\d+/); return m ? parseInt(m[0]) : 99999 }
    return regularMembers.filter((m) => {
      const matchSearch = !q || m.name.toLowerCase().includes(q) || m.employee_id.toLowerCase().includes(q) || (m.team ?? "").toLowerCase().includes(q)
      const matchStatus = tabFilter === "ALL" || m.status === tabFilter
      const matchRole = roleFilter === "ALL"
        || (roleFilter === "ADMIN" && ["ADMIN","FOUNDER","CEO"].includes(m.role))
        || (roleFilter === "MEMBER" && m.role === "MEMBER")
      return matchSearch && matchStatus && matchRole
    }).sort((a, b) => idNum(a.employee_id) - idNum(b.employee_id))
  }, [search, tabFilter, roleFilter, regularMembers])

  const stats = {
    total: regularMembers.length,
    admins: regularMembers.filter((m) => ["ADMIN","FOUNDER","CEO"].includes(m.role)).length,
    teamMembers: regularMembers.filter((m) => m.role === "MEMBER").length,
    freelancers: freelancers.length + loginFreelancerMembers.length,
  }

  const filteredFreelancers = freelancers

  async function handleDeleteFreelancer(id: string, name: string) {
    if (!(await confirm(`Delete freelancer "${name}"? This cannot be undone.`))) return
    const res = await deleteFreelancer(id)
    if (res.success) {
      setFreelancers(prev => prev.filter(f => f.id !== id))
      startTransition(() => router.refresh())
    }
  }

  async function handleDeactivateFreelancer(f: FreelancerBasic) {
    if (!(await confirm(`Move "${f.name}" to Past Freelancers? All their data stays safe. You can reactivate anytime.`))) return
    const res = await toggleFreelancerStatus(f.id, 'inactive')
    if (res.success) {
      setFreelancers(prev => prev.filter(x => x.id !== f.id))
      setPastFreelancers(prev => [{ ...f, status: 'inactive' }, ...prev])
    }
  }

  async function handleReactivateFreelancer(f: FreelancerBasic) {
    const res = await toggleFreelancerStatus(f.id, 'active')
    if (res.success) {
      setPastFreelancers(prev => prev.filter(x => x.id !== f.id))
      setFreelancers(prev => [...prev, { ...f, status: 'active' }])
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

  function handleToggleSupportHandler(member: Member) {
    setOpenDropdown(null)
    startTransition(async () => { await setSupportHandler(member.id, !member.is_support_handler) })
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

  const STAT_CARDS: Array<{ label: string; value: number; sub: string; img: string; bg: string; border: string; num: string; role: "ALL" | "ADMIN" | "MEMBER" | "FREELANCER"; imgClass?: string }> = [
    // Total Members' art is a wide group shot, not a single character, so `contain`
    // fits it to the box width and it sprawls left over the count. Give it a smaller
    // box so it reads the same size as the single-character cards beside it.
    { label: "Total Members", value: stats.total, sub: "All accounts", img: "/brand/team-total-members.png", bg: "linear-gradient(135deg, #FDF2F8 0%, #FCE7F3 100%)", border: "rgba(236,72,153,0.15)", num: "#EC4899", role: "ALL", imgClass: "w-[62px] h-[62px] sm:w-28 sm:h-24 lg:w-[155px] lg:h-[135px]" },
    { label: "Admin Accounts", value: stats.admins, sub: "Admin access", img: "/brand/team-admins.png", bg: "linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)", border: "rgba(139,92,246,0.15)", num: "#7C3AED", role: "ADMIN" },
    { label: "Team Members", value: stats.teamMembers, sub: "Member accounts", img: "/brand/team-active-members.png", bg: "linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)", border: "rgba(34,197,94,0.15)", num: "#16A34A", role: "MEMBER" },
  ]

  return (
    <div className="p-4 md:p-6 xl:p-8 space-y-6 max-w-[1600px]">

      {/* ── Header ── */}
      <div style={{
        borderRadius: 24, overflow: "hidden", position: "relative",
        background: "linear-gradient(135deg, #DE1A1A 0%, #9B1C1C 60%, #450A0A 100%)",
        boxShadow: "0 8px 32px rgba(222,26,26,0.35)",
      }}>
        {/* Decorative circles */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />
        <div style={{ position: "absolute", bottom: -30, right: 220, width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.04)" }} />
        <div style={{ position: "absolute", top: 10, right: 380, width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />

        <div className="flex items-center flex-nowrap gap-3 sm:gap-4" style={{ padding: "22px 20px", position: "relative", zIndex: 1 }}>
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div className="hidden sm:flex" style={{ alignItems: "center", gap: 10, marginBottom: 8 }}>
              <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "6px 8px", display: "flex", alignItems: "center" }}>
                <Sparkles size={16} style={{ color: "#FFD700" }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Admin Dashboard</span>
            </div>
            <h1 className="text-[26px] sm:text-[32px] font-black text-white leading-tight truncate" style={{ fontFamily: "var(--font-jakarta)" }}>Team</h1>
            <p className="text-[13px] mt-1 truncate" style={{ color: "rgba(255,255,255,0.65)" }}>Manage your employees and their access</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 sm:gap-3" style={{ flexShrink: 0 }}>
            <button
              onClick={() => { setEditMember(null); setSheetOpen(true) }}
              className="flex items-center gap-2 px-3.5 sm:px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap"
              style={{ background: "#FFFFFF", color: "#DE1A1A", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
              <Plus size={14} /> <span className="hidden sm:inline">Add Member</span>
            </button>

            {/* Illustration — fixed flex item (not absolutely positioned) so it never overlaps the button; stacks in the same order on every breakpoint. Sized in the space freed up by removing the search bar (moved to the table header below) */}
            <div style={{ position: "relative", width: "clamp(64px,11vw,150px)", height: "clamp(82px,14vw,192px)", flexShrink: 0, filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.3))" }}>
              <Image src="/brand/team-admin-hero.png" alt="" fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
            </div>
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
                padding: "20px 18px 0 22px", overflow: "hidden", position: "relative", minHeight: 154,
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
              <div className={`absolute right-0 bottom-0 pointer-events-none ${s.imgClass ?? "w-[72px] h-[72px] sm:w-36 sm:h-32 lg:w-[200px] lg:h-[175px]"}`}>
                <Image src={s.img} alt={s.label} fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
              </div>
              {/* Text */}
              <div style={{ position: "relative", zIndex: 1 }} className="max-w-[50%] sm:max-w-[60%] lg:max-w-[55%]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: s.num, opacity: 0.85 }}>{s.label}</p>
                <p className="text-[42px] font-black leading-none mt-1" style={{ fontFamily: "var(--font-jakarta)", color: s.num }}>{s.value}</p>
                <p className="text-[11px] mt-1.5 font-medium" style={{ color: "#5C3D1F" }}>{s.sub}</p>
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
              <div className="absolute right-0 bottom-0 w-[72px] h-[72px] sm:w-36 sm:h-32 lg:w-[200px] lg:h-[175px] pointer-events-none">
                <Image src="/brand/team-freelancers.png" alt="Freelancers" fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
              </div>
              <div style={{ position: "relative", zIndex: 1 }} className="max-w-[50%] sm:max-w-[60%] lg:max-w-[55%]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#F97316", opacity: 0.85 }}>Freelancers</p>
                <p className="text-[42px] font-black leading-none mt-1" style={{ fontFamily: "var(--font-jakarta)", color: "#F97316" }}>{stats.freelancers}</p>
                <p className="text-[11px] mt-1.5 font-medium" style={{ color: "#5C3D1F" }}>Freelance team</p>
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
                  <p className="text-[12px]" style={{ color: "#5C3D1F" }}>{freelancers.length + loginFreelancerMembers.length} freelancer{freelancers.length + loginFreelancerMembers.length !== 1 ? "s" : ""}</p>
                </div>
                <button
                  onClick={() => setAssignSheetOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-bold transition-all"
                  style={{ background: "rgba(249,115,22,0.08)", color: "#F97316", border: "1.5px solid rgba(249,115,22,0.25)" }}>
                  <UserCheck size={13} /> Assign Manager
                </button>
              </div>
              {/* Login Freelancer Members (e.g. ARUN) */}
              {loginFreelancerMembers.length > 0 && (
                <div style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <div className="px-5 py-2.5 flex items-center gap-2" style={{ background: "#FAFAFA" }}>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: "rgba(249,115,22,0.1)", color: "#F97316" }}>
                      <LogIn size={11} /> Login Members
                    </span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                  <table className="w-full" style={{ minWidth: 560, tableLayout: "fixed" }}>
                    <colgroup>
                      {FREELANCER_TABLE_COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
                    </colgroup>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #F9FAFB", background: "#FAFAFA" }}>
                        {["Member", "Department", "Phone", "Status", "Joined", "Actions"].map(h => (
                          <th key={h} className="text-left px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#5C3D1F" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {loginFreelancerMembers.map((m, i) => {
                        const initials = m.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                        const teamKey = m.team ?? "other"
                        const teamCfg = FL_TYPE_CFG[teamKey] ?? { label: teamKey, color: "#6B7280", bg: "rgba(107,114,128,0.08)", emoji: "👤" }
                        return (
                          <tr key={m.id} style={{ borderBottom: i < loginFreelancerMembers.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(249,115,22,0.1)", border: "1.5px solid rgba(249,115,22,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                  <span style={{ fontSize: 11, fontWeight: 800, color: "#F97316" }}>{initials}</span>
                                </div>
                                <div>
                                  <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{m.name}</p>
                                  <p className="text-[11px]" style={{ color: "#5C3D1F" }}>{m.employee_id}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3" style={{ whiteSpace: "nowrap" }}>
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold" style={{ background: teamCfg.bg, color: teamCfg.color }}>
                                {teamCfg.emoji} {teamCfg.label}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-[13px]" style={{ color: "#5C3D1F" }}>{formatPhoneDisplay(m.phone)}</td>
                            <td className="px-5 py-3">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                                style={m.status === "active" ? { background: "rgba(34,197,94,0.1)", color: "#16A34A" } : { background: "rgba(107,114,128,0.1)", color: "#5C3D1F" }}>
                                <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: m.status === "active" ? "#16A34A" : "#9CA3AF" }} />
                                {m.status === "active" ? "Active" : "Deactivated"}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-[12px]" style={{ color: "#5C3D1F", whiteSpace: "nowrap" }}>{formatDate(m.joined_at ?? m.created_at)}</td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1.5 relative">
                                <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (openDropdown === m.id) { setOpenDropdown(null); setDropdownAnchor(null) } else { setOpenDropdown(m.id); setDropdownAnchor({ top: r.bottom + 4, right: window.innerWidth - r.right }) } }}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                  style={{ color: "#5C3D1F" }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F3F4F6"}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                  <MoreVertical size={12} />
                                </button>
                                {openDropdown === m.id && dropdownAnchor && (
                                  <div className="w-44 rounded-xl shadow-2xl overflow-hidden py-1"
                                    style={{ position: "fixed", top: dropdownAnchor.top, right: dropdownAnchor.right, background: "#FFFFFF", border: "1px solid #E5E7EB", zIndex: 9999 }}>
                                    <button
                                      onClick={() => { setEditMember(m); setSheetOpen(true); setOpenDropdown(null) }}
                                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold transition-all"
                                      style={{ color: "#5C3D1F" }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F9FAFB"}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                      <Pencil size={12} /> Edit
                                    </button>
                                    <div style={{ borderTop: "1px solid #F3F4F6", margin: "2px 0" }} />
                                    {m.status === "active" && (
                                      <>
                                        <button onClick={() => { setOpenDropdown(null); startImpersonation(m.id) }}
                                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold transition-all"
                                          style={{ color: "#6366F1" }}
                                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.06)"}
                                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                          <LogIn size={12} /> Login as {m.name.split(" ")[0]}
                                        </button>
                                        <div style={{ borderTop: "1px solid #F3F4F6", margin: "2px 0" }} />
                                      </>
                                    )}
                                    <button onClick={() => { handleToggleStatus(m); setOpenDropdown(null) }} disabled={isPending}
                                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all"
                                      style={{ color: m.status === "active" ? "#F59E0B" : "#22C55E" }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F9FAFB"}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                      {m.status === "active" ? <><Ban size={12} /> Deactivate</> : <><RotateCcw size={12} /> Reactivate</>}
                                    </button>
                                    <button onClick={() => { setResetTarget(m); setResetPassword(""); setResetError(""); setResetSuccess(false); setOpenDropdown(null) }}
                                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all"
                                      style={{ color: "#6366F1" }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F9FAFB"}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                      <KeyRound size={12} /> Reset Password
                                    </button>
                                    <div style={{ borderTop: "1px solid #F3F4F6", margin: "2px 0" }} />
                                    <button onClick={() => { setConfirmDelete(m); setOpenDropdown(null); setDropdownAnchor(null) }}
                                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] transition-all"
                                      style={{ color: "#EF4444" }}
                                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.06)"}
                                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                      <Trash2 size={12} /> Delete Member
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}

              {/* Sub-header for no-login freelancers */}
              {loginFreelancerMembers.length > 0 && freelancers.length > 0 && (
                <div className="px-5 py-2.5 flex items-center gap-2" style={{ background: "#FAFAFA", borderBottom: "1px solid #F3F4F6" }}>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.1em]" style={{ background: "rgba(107,114,128,0.1)", color: "#5C3D1F" }}>
                    <Users size={11} /> No-Login Freelancers
                  </span>
                </div>
              )}

              <div style={{ overflowX: "auto" }}>
                <table className="w-full" style={{ minWidth: 560, tableLayout: "fixed" }}>
                  <colgroup>
                    {FREELANCER_TABLE_COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w }} />)}
                  </colgroup>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }}>
                      {["Freelancer", "Department", "Phone", "Status", "Joined", "Actions"].map(h => (
                        <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#5C3D1F" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {freelancers.length === 0 ? (
                      <tr><td colSpan={6} className="px-5 py-10 text-center text-[13px]" style={{ color: "#5C3D1F" }}>
                        No freelancers added yet
                      </td></tr>
                    ) : freelancers.map((f, i) => {
                      const teamKey = getFreelancerTeamKey(f)
                      const teamCfg = FL_TYPE_CFG[teamKey] ?? { label: teamKey, color: "#6B7280", bg: "rgba(107,114,128,0.08)", emoji: "👤" }
                      const joinedSource = f.first_work_date ?? f.created_at
                      const added = joinedSource
                        ? new Date(joinedSource).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                        : "—"
                      const initials = f.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
                      return (
                        <tr key={f.id} style={{ borderBottom: i < freelancers.length - 1 ? "1px solid #F9FAFB" : "none" }}>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div style={{ width: 34, height: 34, borderRadius: 10, background: teamCfg.bg, border: `1.5px solid ${teamCfg.color}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <span style={{ fontSize: 11, fontWeight: 800, color: teamCfg.color }}>{initials}</span>
                              </div>
                              <div>
                                <p className="text-[13px] font-semibold" style={{ color: "#111111" }}>{f.name}</p>
                                {f.gender && <p className="text-[11px] capitalize" style={{ color: "#5C3D1F" }}>{f.gender}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3.5" style={{ whiteSpace: "nowrap" }}>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold" style={{ background: teamCfg.bg, color: teamCfg.color }}>
                              {teamCfg.emoji} {teamCfg.label}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-[13px]" style={{ color: "#5C3D1F" }}>{formatPhoneDisplay(f.phone)}</td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
                              style={f.status === "active" ? { background: "rgba(34,197,94,0.1)", color: "#16A34A" } : { background: "rgba(107,114,128,0.1)", color: "#5C3D1F" }}>
                              <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: f.status === "active" ? "#16A34A" : "#9CA3AF" }} />
                              {f.status === "active" ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-[12px]" style={{ color: "#5C3D1F" }}>{added}</td>
                          <td className="px-5 py-3.5">
                            <div className="relative flex items-center gap-1.5">
                              <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (openDropdown === f.id) { setOpenDropdown(null); setDropdownAnchor(null) } else { setOpenDropdown(f.id); setDropdownAnchor({ top: r.bottom + 4, right: window.innerWidth - r.right }) } }}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                                style={{ color: "#5C3D1F" }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F3F4F6"}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                <MoreVertical size={12} />
                              </button>
                              {openDropdown === f.id && dropdownAnchor && (
                                <div className="w-44 rounded-xl shadow-2xl overflow-hidden py-1"
                                  style={{ position: "fixed", top: dropdownAnchor.top, right: dropdownAnchor.right, background: "#FFFFFF", border: "1px solid #E5E7EB", zIndex: 9999 }}>
                                  <button
                                    onClick={() => { setEditingFreelancer(f); setOpenDropdown(null) }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold transition-all"
                                    style={{ color: "#6366F1" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(99,102,241,0.06)"}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                    <Pencil size={12} /> Edit
                                  </button>
                                  <div style={{ borderTop: "1px solid #F3F4F6", margin: "2px 0" }} />
                                  <button
                                    onClick={() => { handleDeactivateFreelancer(f); setOpenDropdown(null) }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold transition-all"
                                    style={{ color: "#D97706" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(245,158,11,0.06)"}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                    <Ban size={12} /> Deactivate
                                  </button>
                                  <div style={{ borderTop: "1px solid #F3F4F6", margin: "2px 0" }} />
                                  <button
                                    onClick={() => { handleDeleteFreelancer(f.id, f.name); setOpenDropdown(null) }}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold transition-all"
                                    style={{ color: "#DE1A1A" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.06)"}
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
                  </tbody>
                </table>
              </div>
            </>
          ) : (
          <>
          {/* Table header row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid #F3F4F6" }}>
            <div>
              <h3 className="text-[15px] font-bold" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>Employee Directory</h3>
              <p className="text-[12px]" style={{ color: "#5C3D1F" }}>{filtered.length} of {regularMembers.length} members</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
            {/* Search — moved out of the header banner */}
            <div className="relative flex-1 sm:flex-none sm:w-[200px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full rounded-lg pl-8 pr-3 py-2 text-[12px] outline-none"
                style={{ background: "#F9FAFB", border: "1px solid #E5E7EB", color: "#111111" }}
              />
            </div>
            {/* Tab filters */}
            <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: "#F9FAFB", border: "1px solid #F3F4F6" }}>
              {([
                { key: "ALL", label: "All" },
                { key: "active", label: "Active" },
                { key: "inactive", label: "Deactivated" },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setTabFilter(key)}
                  className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                  style={tabFilter === key
                    ? { background: "#FFFFFF", color: "#111111", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }
                    : { color: "#5C3D1F" }
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
                      style={{ color: "#5C3D1F" }}>{h}</th>
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
                            <p className="text-[11px] mt-0.5" style={{ color: "#5C3D1F" }}>{member.position ?? member.email ?? "—"}</p>
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
                          <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg" style={{ background: "#F3F4F6", color: "#5C3D1F" }}>{member.employee_id}</span>
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
                              : { background: "rgba(0,0,0,0.04)", color: "#5C3D1F", border: "1px solid #E5E7EB" }
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
                            : { background: "#F3F4F6", color: "#5C3D1F", border: "1px solid #E5E7EB" }
                          }>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: member.status === "active" ? "#22C55E" : "#D1D5DB" }} />
                          {member.status === "active" ? "Active" : "Deactivated"}
                        </span>
                      </td>

                      {/* Joined */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <CalendarDays size={10} style={{ color: "#5C3D1F" }} />
                          <span className="text-[12px]" style={{ color: "#5C3D1F" }}>{formatDate(member.joined_at ?? member.created_at)}</span>
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
                          <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (openDropdown === member.id) { setOpenDropdown(null); setDropdownAnchor(null) } else { setOpenDropdown(member.id); setDropdownAnchor({ top: r.bottom + 4, right: window.innerWidth - r.right }) } }}
                            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                            style={{ color: "#5C3D1F" }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F3F4F6"}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                            <MoreVertical size={14} />
                          </button>

                          {openDropdown === member.id && dropdownAnchor && (
                            <div className="w-44 rounded-xl shadow-2xl overflow-hidden py-1"
                              style={{ position: "fixed", top: dropdownAnchor.top, right: dropdownAnchor.right, background: "#FFFFFF", border: "1px solid #E5E7EB", zIndex: 9999 }}>
                              <button onClick={() => { setEditMember(member); setSheetOpen(true); setOpenDropdown(null) }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold transition-all"
                                style={{ color: "#de1a1a" }}
                                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(222,26,26,0.06)"}
                                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                <Pencil size={12} /> Edit
                              </button>
                              <div style={{ borderTop: "1px solid #F3F4F6", margin: "2px 0" }} />
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
                              {member.status === "active" && member.role !== "ADMIN" && (
                                <>
                                  <button onClick={() => handleToggleSupportHandler(member)} disabled={isPending}
                                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold transition-all whitespace-nowrap"
                                    style={{ color: member.is_support_handler ? "#DE1A1A" : "#0EA5E9" }}
                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#F9FAFB"}
                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>
                                    <LifeBuoy size={12} className="flex-shrink-0" /> {member.is_support_handler ? "Remove Support" : "Support Handler"}
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
                          <Search size={18} style={{ color: "#5C3D1F" }} />
                        </div>
                        <p className="text-[13px] font-medium" style={{ color: "#5C3D1F" }}>No members found</p>
                        <p className="text-[12px]" style={{ color: "#5C3D1F" }}>Try adjusting your search or filters</p>
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
            <div className="absolute right-0 bottom-0 pointer-events-none w-[220px] h-[230px] md:w-[160px] md:h-[170px]">
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
                <p className="text-[11px]" style={{ color: "#5C3D1F" }}>Recent additions</p>
              </div>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(222,26,26,0.08)" }}>
                <Clock size={14} style={{ color: "#de1a1a" }} />
              </div>
            </div>
            <div className="px-5 py-3 space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-center text-[12px] py-6" style={{ color: "#5C3D1F" }}>No team members yet</p>
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
                        <p className="text-[10px]" style={{ color: "#5C3D1F" }}>{formatDateShort(m.joined_at ?? m.created_at)}</p>
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={m.status === "active"
                            ? { background: "rgba(34,197,94,0.1)", color: "#16A34A" }
                            : { background: "#F3F4F6", color: "#5C3D1F" }}>
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
            style={{ color: "#5C3D1F" }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
              style={{ background: "#F3F4F6" }}>
              {showPast ? "▲" : "▼"}
            </span>
            Past Members
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#5C3D1F" }}>
              {pastMembers.length}
            </span>
          </button>

          {showPast && (
            <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }}>
                    {["Employee", "ID", "Team", "Role", "Left On", ""].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em]"
                        style={{ color: "#5C3D1F" }}>{h}</th>
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
                            <span className="text-[10px] font-bold" style={{ color: "#5C3D1F" }}>{getInitials(m.name)}</span>
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold" style={{ color: "#5C3D1F" }}>{m.name}</p>
                            <p className="text-[11px]" style={{ color: "#5C3D1F" }}>{m.email ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><span className="text-[12px] font-mono px-2 py-0.5 rounded" style={{ background: "#F3F4F6", color: "#5C3D1F" }}>{m.employee_id}</span></td>
                      <td className="px-5 py-3"><span className="text-[12px]" style={{ color: "#5C3D1F" }}>{m.team ?? "—"}</span></td>
                      <td className="px-5 py-3"><span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#5C3D1F" }}>{m.role}</span></td>
                      <td className="px-5 py-3"><span className="text-[12px]" style={{ color: "#5C3D1F" }}>{m.deleted_at ? formatDate(m.deleted_at) : "—"}</span></td>
                      <td className="px-5 py-3">
                        <button onClick={() => handleToggleStatus(m)} disabled={isPending}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-50"
                          style={{ background: "rgba(34,197,94,0.08)", color: "#16A34A", border: "1px solid rgba(34,197,94,0.2)" }}>
                          <RotateCcw size={10} /> Reactivate
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Past Freelancers ── */}
      {pastFreelancers.length > 0 && (
        <div>
          <button onClick={() => setShowPastFreelancers(v => !v)}
            className="flex items-center gap-2 text-[13px] font-semibold mb-3"
            style={{ color: "#5C3D1F" }}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ background: "#F3F4F6" }}>
              {showPastFreelancers ? "▲" : "▼"}
            </span>
            Past Freelancers
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F3F4F6", color: "#5C3D1F" }}>
              {pastFreelancers.length}
            </span>
          </button>
          {showPastFreelancers && (
            <div style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", borderRadius: 18, overflow: "hidden" }}>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: "1px solid #F3F4F6", background: "#FAFAFA" }}>
                    {["Freelancer", "Team", "Phone", "Deactivated", ""].map(h => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: "#5C3D1F" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pastFreelancers.map((f, i) => {
                    const teamKey = getFreelancerTeamKey(f)
                    const teamCfg = FL_TYPE_CFG[teamKey] ?? { label: teamKey, color: "#6B7280", bg: "rgba(107,114,128,0.08)", emoji: "👤" }
                    const initials = f.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()
                    return (
                      <tr key={f.id} style={{ borderBottom: i < pastFreelancers.length - 1 ? "1px solid #F9FAFB" : "none", opacity: 0.65 }}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div style={{ width: 32, height: 32, borderRadius: 9, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: "#5C3D1F" }}>{initials}</span>
                            </div>
                            <div>
                              <p className="text-[13px] font-semibold" style={{ color: "#5C3D1F" }}>{f.name}</p>
                              {f.gender && <p className="text-[11px] capitalize" style={{ color: "#5C3D1F" }}>{f.gender}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold" style={{ background: "#F3F4F6", color: "#5C3D1F" }}>
                            {teamCfg.emoji} {teamCfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[12px]" style={{ color: "#5C3D1F" }}>{formatPhoneDisplay(f.phone)}</td>
                        <td className="px-5 py-3 text-[12px]" style={{ color: "#5C3D1F" }}>
                          {(() => { const d = f.first_work_date ?? f.created_at; return d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—" })()}
                        </td>
                        <td className="px-5 py-3">
                          <button onClick={() => handleReactivateFreelancer(f)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all"
                            style={{ background: "rgba(34,197,94,0.08)", color: "#16A34A", border: "1px solid rgba(34,197,94,0.2)" }}>
                            <RotateCcw size={10} /> Reactivate
                          </button>
                        </td>
                      </tr>
                    )
                  })}
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

        {/* Boy with laptop illustration — visible at every width, shrinks on mobile */}
        <div className="absolute right-4 bottom-0 pointer-events-none w-[140px] h-[130px] sm:w-[200px] sm:h-[185px] lg:w-[240px] lg:h-[220px]">
          <Image src="/brand/boy-laptop.png" alt="Productivity" fill style={{ objectFit: "contain", objectPosition: "right bottom" }} />
        </div>

        <div style={{ position: "relative", zIndex: 1, padding: "24px 28px" }}>
          <div className="flex items-start gap-6 flex-wrap pr-[160px] sm:pr-[220px] lg:pr-64 xl:pr-72">
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

      {openDropdown && <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenDropdown(null); setDropdownAnchor(null) }} />}

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
                  <p className="text-[13px] mt-1.5 leading-relaxed" style={{ color: "#5C3D1F" }}>
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
                  style={{ background: "#F9FAFB", color: "#5C3D1F", border: "1px solid #E5E7EB" }}>
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
                  <p className="text-[13px] mt-1" style={{ color: "#5C3D1F" }}>
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
                    style={{ background: "#F9FAFB", color: "#5C3D1F", border: "1px solid #E5E7EB" }}>
                    Close
                  </button>
                </div>
              ) : (
                <div className="px-6 pb-6 space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5" style={{ color: "#5C3D1F" }}>New Password</label>
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
                      style={{ background: "#F9FAFB", color: "#5C3D1F", border: "1px solid #E5E7EB" }}>
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

      <FreelancerEditSheet
        freelancer={editingFreelancer}
        open={editingFreelancer !== null}
        onClose={() => setEditingFreelancer(null)}
        onSaved={updated => {
          setFreelancers(prev => prev.map(f => f.id === updated.id ? updated : f))
          setEditingFreelancer(null)
        }}
      />
    </div>
  )
}
