"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Mail, Phone, Briefcase, Calendar, Shield,
  Edit2, Check, X, Loader2, LogOut, KeyRound,
  TrendingUp, Clock, Target, AlertCircle, Zap,
  Camera, HeartPulse, MapPin, UserPlus, Landmark,
  CreditCard, FileText, Upload, CheckCircle2, AlertTriangle,
} from "lucide-react"
import { updateOwnProfile } from "@/lib/actions/team"
import { updatePersonalDetails, updateKYC } from "@/lib/actions/profile"
import { logoutAction } from "@/lib/actions/auth"
import { createBrowserClient } from "@/lib/supabase/client"

interface ProfileData {
  id:          string
  name:        string
  employee_id: string
  role:        string
  email:       string
  phone:       string
  status:      string
  joined:      string
  photo_url:               string | null
  blood_group:             string | null
  address:                 string | null
  emergency_contact_name:  string | null
  emergency_contact_phone: string | null
}

interface KYCData {
  bank_name:       string | null
  bank_account:    string | null
  bank_ifsc:       string | null
  aadhaar_number:  string | null
  pan_number:      string | null
  govt_id_url:     string | null
  ration_card_url: string | null
}

interface Stats {
  weekHours:      number
  weekMissed:     number
  totalCompleted: number
  totalLeaves:    number
  avgHoursPerDay: number
}

interface ChartDay {
  date:     string
  label:    string
  hours:    number
  isFuture: boolean
}

interface RecentUpdate {
  date:          string
  working_hours: number | null
  shoot_count:   number | null
}

const IS: React.CSSProperties = {
  background: "#fbf5f7", border: "1px solid #E5E7EB", color: "#111111",
  borderRadius: "10px", padding: "10px 14px", fontSize: "13px",
  outline: "none", width: "100%",
}

const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"]
const GOVT_ID_TYPES = ["Aadhaar Card", "PAN Card", "Voter ID", "Passport", "Driving Licence"]
const INDIAN_BANKS = [
  // Public Sector Banks
  "State Bank of India (SBI)",
  "Bank of Baroda",
  "Bank of India",
  "Bank of Maharashtra",
  "Canara Bank",
  "Central Bank of India",
  "Indian Bank",
  "Indian Overseas Bank",
  "Punjab & Sind Bank",
  "Punjab National Bank",
  "UCO Bank",
  "Union Bank of India",
  // Private Sector Banks
  "Axis Bank",
  "Bandhan Bank",
  "City Union Bank",
  "CSB Bank (Catholic Syrian Bank)",
  "DCB Bank",
  "Dhanlaxmi Bank",
  "Federal Bank",
  "HDFC Bank",
  "ICICI Bank",
  "IDBI Bank",
  "IDFC First Bank",
  "IndusInd Bank",
  "Jammu & Kashmir Bank",
  "Karnataka Bank",
  "Karur Vysya Bank",
  "Kotak Mahindra Bank",
  "Lakshmi Vilas Bank",
  "Nainital Bank",
  "RBL Bank",
  "South Indian Bank",
  "Tamilnad Mercantile Bank",
  "YES Bank",
  // Small Finance Banks
  "AU Small Finance Bank",
  "Equitas Small Finance Bank",
  "ESAF Small Finance Bank",
  "Jana Small Finance Bank",
  "Suryoday Small Finance Bank",
  "Ujjivan Small Finance Bank",
  "Utkarsh Small Finance Bank",
  // Payments Banks
  "Airtel Payments Bank",
  "India Post Payments Bank",
  "Fino Payments Bank",
  "Jio Payments Bank",
  "Paytm Payments Bank",
  // Tamil Nadu Co-operative Banks
  "Tamil Nadu State Apex Co-operative Bank",
  "Thanjavur Central Co-operative Bank",
  "Madurai District Central Co-operative Bank",
  "Coimbatore District Central Co-operative Bank",
  "Salem District Central Co-operative Bank",
  "Tirunelveli District Central Co-operative Bank",
  "Erode District Central Co-operative Bank",
  "Vellore District Central Co-operative Bank",
  "Krishnagiri District Central Co-operative Bank",
  "Dharmapuri District Central Co-operative Bank",
  "Villupuram District Central Co-operative Bank",
  "Cuddalore District Central Co-operative Bank",
  "Tiruvannamalai District Central Co-operative Bank",
  "Kancheepuram District Central Co-operative Bank",
  "Tiruvallur District Central Co-operative Bank",
  "Chengalpattu District Central Co-operative Bank",
  // Other
  "Post Office (IPPB)",
  "Other",
]

function relativeDate(dateStr: string): string {
  const today = new Date().toISOString().split("T")[0]
  if (dateStr === today) return "Today"
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  if (dateStr === yesterday.toISOString().split("T")[0]) return "Yesterday"
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })
}

function WeekChart({ data }: { data: ChartDay[] }) {
  const maxH  = Math.max(...data.map(d => d.hours), 1)
  const today = new Date().toISOString().split("T")[0]
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-3" style={{ color: "#D1D5DB" }}>Last 7 Days</p>
      <div className="flex items-end gap-2 h-20">
        {data.map((day) => {
          const pct     = maxH > 0 ? (day.hours / maxH) * 100 : 0
          const isToday = day.date === today
          const hasHours = day.hours > 0
          return (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <div className="relative w-full group">
                {hasHours && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <span className="text-[10px] font-bold whitespace-nowrap px-1.5 py-0.5 rounded"
                      style={{ background: "#E5E7EB", color: "#de1a1a" }}>{day.hours}h</span>
                  </div>
                )}
                <div className="w-full rounded-t-sm" style={{ height: 64, display: "flex", alignItems: "flex-end" }}>
                  <div className="w-full rounded-sm transition-all" style={{
                    height: `${Math.max(pct, day.isFuture ? 0 : 3)}%`,
                    minHeight: !day.isFuture && hasHours ? 4 : 0,
                    background: day.isFuture ? "transparent" : isToday ? "#de1a1a" : hasHours ? "rgba(222,26,26,0.4)" : "rgba(0,0,0,0.05)",
                  }} />
                </div>
              </div>
              <span className="text-[10px] font-medium" style={{ color: isToday ? "#de1a1a" : "#83858c" }}>{day.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function completionScore(p: ProfileData | null, k: KYCData | null): { score: number; items: { label: string; done: boolean }[] } {
  const items = [
    { label: "Profile photo",        done: !!p?.photo_url },
    { label: "Phone number",         done: !!p?.phone },
    { label: "Blood group",          done: !!p?.blood_group },
    { label: "Emergency contact",    done: !!(p?.emergency_contact_name && p?.emergency_contact_phone) },
    { label: "Bank account",         done: !!(k?.bank_account && k?.bank_ifsc) },
    { label: "Government ID",        done: !!k?.govt_id_url },
  ]
  const done  = items.filter(i => i.done).length
  const score = Math.round((done / items.length) * 100)
  return { score, items }
}

export default function ProfileClient({
  profile, kyc, stats, chartData, recentUpdates, authEmail,
}: {
  profile:       ProfileData | null
  kyc:           KYCData | null
  stats:         Stats
  chartData:     ChartDay[]
  recentUpdates: RecentUpdate[]
  authEmail:     string
}) {
  const router = useRouter()

  // Basic edit
  const [editing, setEditing] = useState(false)
  const [editName, setEditName]   = useState(profile?.name ?? "")
  const [editPhone, setEditPhone] = useState(profile?.phone ?? "")
  const [editError, setEditError] = useState<string | null>(null)
  const [savePending, startSave]  = useTransition()

  // Personal details
  const [editPersonal, setEditPersonal] = useState(false)
  const [personal, setPersonal] = useState({
    blood_group:             profile?.blood_group ?? "",
    address:                 profile?.address ?? "",
    emergency_contact_name:  profile?.emergency_contact_name ?? "",
    emergency_contact_phone: profile?.emergency_contact_phone ?? "",
  })
  const [personalPending, startPersonal] = useTransition()
  const [personalError, setPersonalError] = useState<string | null>(null)

  // KYC
  const [editKYC, setEditKYC] = useState(false)
  const [kycForm, setKYCForm] = useState({
    bank_name:       kyc?.bank_name       ?? "",
    bank_account:    kyc?.bank_account    ?? "",
    bank_ifsc:       kyc?.bank_ifsc       ?? "",
    aadhaar_number:  kyc?.aadhaar_number  ?? "",
    pan_number:      kyc?.pan_number      ?? "",
    govt_id_url:     kyc?.govt_id_url     ?? "",
    ration_card_url: kyc?.ration_card_url ?? "",
  })
  const [kycPending, startKYC] = useTransition()
  const [kycError, setKYCError] = useState<string | null>(null)
  const [kycSuccess, setKycSuccess] = useState(false)
  const [uploadingField, setUploadingField] = useState<string | null>(null)

  // Photo
  const photoRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  const [logoutPending, startLogout] = useTransition()

  const initial = profile?.name?.charAt(0)?.toUpperCase() ?? authEmail?.charAt(0)?.toUpperCase() ?? "?"
  const { score, items: completionItems } = completionScore(profile, kyc ?? kycForm as KYCData)

  function handleSave() {
    setEditError(null)
    startSave(async () => {
      const res = await updateOwnProfile({ name: editName, phone: editPhone })
      if (res.success) { setEditing(false); router.refresh() }
      else setEditError(res.error ?? "Failed to save")
    })
  }

  function handlePersonalSave() {
    setPersonalError(null)
    startPersonal(async () => {
      const res = await updatePersonalDetails({
        blood_group:             personal.blood_group || null,
        address:                 personal.address || null,
        emergency_contact_name:  personal.emergency_contact_name || null,
        emergency_contact_phone: personal.emergency_contact_phone || null,
      })
      if (res.success) { setEditPersonal(false); router.refresh() }
      else setPersonalError(res.error ?? "Failed to save")
    })
  }

  function handleKYCSave() {
    setKYCError(null)
    setKycSuccess(false)
    startKYC(async () => {
      if (!kycForm.govt_id_url) {
        setKYCError("Aadhaar photo upload is required")
        return
      }
      const res = await updateKYC({
        bank_name:       kycForm.bank_name || null,
        bank_account:    kycForm.bank_account || null,
        bank_ifsc:       kycForm.bank_ifsc || null,
        aadhaar_number:  kycForm.aadhaar_number || null,
        pan_number:      kycForm.pan_number || null,
        govt_id_url:     kycForm.govt_id_url || null,
        ration_card_url: kycForm.ration_card_url || null,
      })
      if (res.success) { setEditKYC(false); setKycSuccess(true); router.refresh() }
      else setKYCError(res.error ?? "Failed to save")
    })
  }

  async function handlePhotoUpload(file: File) {
    setPhotoBusy(true)
    try {
      const supabase = createBrowserClient()
      const ext  = file.name.split(".").pop()
      const path = `photos/${profile?.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: true })
      if (upErr) { setPhotoBusy(false); return }
      const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(path)
      await updatePersonalDetails({ photo_url: publicUrl })
      router.refresh()
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleDocUpload(field: "govt_id_url" | "ration_card_url", file: File) {
    setUploadingField(field)
    try {
      const supabase = createBrowserClient()
      const ext  = file.name.split(".").pop()
      const path = `kyc/${profile?.id}/${field}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from("documents").upload(path, file, { upsert: true })
      if (upErr) { setUploadingField(null); return }
      const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(path)
      setKYCForm(prev => ({ ...prev, [field]: publicUrl }))
    } finally {
      setUploadingField(null)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-[1100px]">
      <style>{`.pf-in::placeholder{color:rgba(0,0,0,0.25);} .pf-in:focus{border-color:rgba(222,26,26,0.4)!important;}`}</style>

      {/* ── Page title ── */}
      <div className="mb-5">
        <h1 className="gradient-heading text-[30px] font-black leading-tight" style={{ fontFamily: "var(--font-jakarta)" }}>My Profile</h1>
        <p className="text-[13px] mt-1" style={{ color: "#83858c" }}>Your identity, documents, and account settings.</p>
      </div>

      {/* ── Profile Completion Banner ── */}
      {score < 100 && (
        <div className="rounded-2xl p-4 mb-5 flex items-center gap-4"
          style={{ background: score >= 60 ? "rgba(217,119,6,0.06)" : "rgba(222,26,26,0.06)", border: `1px solid ${score >= 60 ? "rgba(217,119,6,0.2)" : "rgba(222,26,26,0.2)"}` }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: score >= 60 ? "rgba(217,119,6,0.12)" : "rgba(222,26,26,0.12)" }}>
            <AlertTriangle size={16} style={{ color: score >= 60 ? "#D97706" : "#de1a1a" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold" style={{ color: "#111111" }}>
              Profile {score}% complete — fill in your details to unlock full access
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {completionItems.filter(i => !i.done).map(i => (
                <span key={i.label} className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>
                  Missing: {i.label}
                </span>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className="text-[28px] font-black" style={{ fontFamily: "var(--font-jakarta)", color: score >= 60 ? "#D97706" : "#de1a1a" }}>{score}%</p>
            <div className="w-20 h-1.5 rounded-full mt-1" style={{ background: "#E5E7EB" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: score >= 60 ? "#D97706" : "#de1a1a" }} />
            </div>
          </div>
        </div>
      )}

      {score === 100 && (
        <div className="rounded-2xl p-4 mb-5 flex items-center gap-3"
          style={{ background: "rgba(22,163,74,0.06)", border: "1px solid rgba(22,163,74,0.2)" }}>
          <CheckCircle2 size={18} style={{ color: "#16A34A" }} />
          <p className="text-[13px] font-semibold" style={{ color: "#16A34A" }}>Profile 100% complete — all details filled in</p>
        </div>
      )}

      {/* ── Main 2-column grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">

        {/* ── LEFT ── */}
        <div className="space-y-4">

          {/* Profile card */}
          <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
            <div className="flex items-start gap-4">
              {/* Photo avatar */}
              <div className="relative flex-shrink-0">
                <div className="w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center font-black text-[26px]"
                  style={{
                    background: profile?.photo_url ? "transparent" : "linear-gradient(135deg, rgba(222,26,26,0.2), rgba(222,26,26,0.06))",
                    border: "2px solid rgba(222,26,26,0.3)",
                    fontFamily: "var(--font-jakarta)",
                    color: "#de1a1a",
                  }}>
                  {profile?.photo_url
                    ? <img src={profile.photo_url} alt="photo" className="w-full h-full object-cover" />
                    : initial
                  }
                </div>
                <button
                  onClick={() => photoRef.current?.click()}
                  disabled={photoBusy}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                  style={{ background: "#de1a1a", border: "2px solid #FFFFFF" }}
                  title="Change photo"
                >
                  {photoBusy ? <Loader2 size={10} className="animate-spin" style={{ color: "#FFFFFF" }} /> : <Camera size={10} style={{ color: "#FFFFFF" }} />}
                </button>
                <input ref={photoRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }} />
              </div>

              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="space-y-2">
                    <input className="pf-in text-[15px] font-bold" style={IS} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name" />
                    <input className="pf-in" style={IS} value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone number" />
                    {editError && <p className="text-[12px]" style={{ color: "#de1a1a" }}>{editError}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleSave} disabled={savePending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                        style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}>
                        {savePending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
                      </button>
                      <button onClick={() => { setEditing(false); setEditName(profile?.name ?? ""); setEditPhone(profile?.phone ?? "") }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                        style={{ background: "rgba(0,0,0,0.03)", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                        <X size={11} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[20px] font-black truncate" style={{ fontFamily: "var(--font-jakarta)", color: "#111111" }}>
                        {profile?.name ?? authEmail.split("@")[0]}
                      </h2>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full" style={{ background: "rgba(222,26,26,0.1)", color: "#de1a1a" }}>
                          {profile?.role ?? "MEMBER"}
                        </span>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full" style={{ background: "rgba(222,26,26,0.1)", color: "#B91C1C" }}>
                          #{profile?.employee_id ?? "—"}
                        </span>
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full"
                          style={{ background: profile?.status === "active" ? "rgba(16,185,129,0.1)" : "rgba(255,107,87,0.1)", color: profile?.status === "active" ? "#10B981" : "#de1a1a" }}>
                          {profile?.status ?? "active"}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setEditing(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold flex-shrink-0"
                      style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}>
                      <Edit2 size={11} /> Edit
                    </button>
                  </div>
                )}
              </div>
            </div>

            {!editing && (
              <div className="grid grid-cols-2 gap-3 mt-4 pt-4" style={{ borderTop: "1px solid #F0F0F0" }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(222,26,26,0.08)" }}>
                    <Zap size={13} style={{ color: "#de1a1a" }} />
                  </div>
                  <div>
                    <p className="text-[16px] font-black leading-none" style={{ color: "#111111" }}>{stats.avgHoursPerDay > 0 ? `${stats.avgHoursPerDay}h` : "—"}</p>
                    <p className="text-[10px]" style={{ color: "#83858c" }}>Avg hours/day</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(222,26,26,0.08)" }}>
                    <Target size={13} style={{ color: "#de1a1a" }} />
                  </div>
                  <div>
                    <p className="text-[16px] font-black leading-none" style={{ color: "#111111" }}>{stats.totalCompleted}</p>
                    <p className="text-[10px]" style={{ color: "#83858c" }}>Tasks completed</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Account Details */}
          <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-4" style={{ color: "#83858c" }}>Account Details</p>
            <div className="space-y-2">
              {[
                { icon: Mail,      label: "Email",       value: profile?.email || authEmail },
                { icon: Phone,     label: "Phone",       value: profile?.phone || "—" },
                { icon: Briefcase, label: "Employee ID", value: `#${profile?.employee_id ?? "—"}` },
                { icon: Shield,    label: "Role",        value: profile?.role ?? "MEMBER" },
                { icon: Calendar,  label: "Joined",      value: profile?.joined ?? "—" },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.02)" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,0,0,0.03)" }}>
                    <Icon size={13} style={{ color: "#83858c" }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: "#83858c" }}>{label}</p>
                    <p className="text-[13px] font-semibold capitalize" style={{ color: "#111111" }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Personal Details */}
          <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: "#83858c" }}>Personal Details</p>
              {!editPersonal && (
                <button onClick={() => setEditPersonal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                  style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}>
                  <Edit2 size={11} /> Edit
                </button>
              )}
            </div>

            {editPersonal ? (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 block" style={{ color: "#83858c" }}>Blood Group</label>
                  <div className="flex flex-wrap gap-2">
                    {BLOOD_GROUPS.map(bg => (
                      <button key={bg} onClick={() => setPersonal(p => ({ ...p, blood_group: bg }))}
                        className="px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all"
                        style={personal.blood_group === bg
                          ? { background: "#de1a1a", color: "#FFFFFF", border: "1px solid #de1a1a" }
                          : { background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 block" style={{ color: "#83858c" }}>Residential Address</label>
                  <textarea value={personal.address} onChange={e => setPersonal(p => ({ ...p, address: e.target.value }))}
                    rows={2} placeholder="Full address..."
                    className="pf-in w-full px-3 py-2.5 rounded-xl text-[13px] outline-none resize-none"
                    style={IS} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 block" style={{ color: "#83858c" }}>Emergency Contact Name</label>
                    <input value={personal.emergency_contact_name} onChange={e => setPersonal(p => ({ ...p, emergency_contact_name: e.target.value }))}
                      placeholder="e.g. Mother's name" className="pf-in" style={IS} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 block" style={{ color: "#83858c" }}>Emergency Phone</label>
                    <input value={personal.emergency_contact_phone} onChange={e => setPersonal(p => ({ ...p, emergency_contact_phone: e.target.value }))}
                      placeholder="Phone number" className="pf-in" style={IS} />
                  </div>
                </div>
                {personalError && <p className="text-[12px]" style={{ color: "#de1a1a" }}>{personalError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={handlePersonalSave} disabled={personalPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold"
                    style={{ background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#FFFFFF" }}>
                    {personalPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
                  </button>
                  <button onClick={() => setEditPersonal(false)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold"
                    style={{ background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                    <X size={11} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  { icon: HeartPulse, label: "Blood Group",       value: profile?.blood_group || "—" },
                  { icon: MapPin,     label: "Address",           value: profile?.address || "—" },
                  { icon: UserPlus,   label: "Emergency Contact", value: profile?.emergency_contact_name ? `${profile.emergency_contact_name}${profile.emergency_contact_phone ? ` · ${profile.emergency_contact_phone}` : ""}` : "—" },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.02)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,0,0,0.03)" }}>
                      <Icon size={13} style={{ color: value === "—" ? "#D1D5DB" : "#83858c" }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: "#83858c" }}>{label}</p>
                      <p className="text-[13px] font-semibold" style={{ color: value === "—" ? "#D1D5DB" : "#111111" }}>{value}</p>
                    </div>
                    {value === "—" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>Missing</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* KYC Documents */}
          <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: "#83858c" }}>KYC &amp; Bank Details</p>
              {!editKYC && (
                <button onClick={() => { setEditKYC(true); setKycSuccess(false) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold"
                  style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a", border: "1px solid rgba(222,26,26,0.2)" }}>
                  <Edit2 size={11} /> Edit
                </button>
              )}
            </div>
            {kycSuccess && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3"
                style={{ background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.2)" }}>
                <CheckCircle2 size={14} style={{ color: "#16A34A" }} />
                <p className="text-[12px] font-semibold" style={{ color: "#16A34A" }}>KYC details saved successfully</p>
              </div>
            )}

            {editKYC ? (
              <div className="space-y-4">
                {/* Bank details */}
                <div>
                  <p className="text-[11px] font-bold mb-2" style={{ color: "#374151" }}>Bank Account</p>
                  <div className="space-y-2">
                    <select value={kycForm.bank_name} onChange={e => setKYCForm(p => ({ ...p, bank_name: e.target.value }))}
                      className="pf-in" style={{ ...IS, appearance: "none" }}>
                      <option value="">Select bank…</option>
                      {INDIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={kycForm.bank_account} onChange={e => setKYCForm(p => ({ ...p, bank_account: e.target.value }))}
                        placeholder="Account number" className="pf-in" style={IS} />
                      <input value={kycForm.bank_ifsc} onChange={e => setKYCForm(p => ({ ...p, bank_ifsc: e.target.value }))}
                        placeholder="IFSC code" className="pf-in" style={IS} />
                    </div>
                  </div>
                </div>

                {/* Aadhaar & PAN */}
                <div>
                  <p className="text-[11px] font-bold mb-2" style={{ color: "#374151" }}>Identity Details</p>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 block" style={{ color: "#83858c" }}>Aadhaar Number</label>
                      <input value={kycForm.aadhaar_number} onChange={e => setKYCForm(p => ({ ...p, aadhaar_number: e.target.value }))}
                        placeholder="12-digit Aadhaar number" maxLength={14} className="pf-in" style={IS} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 block" style={{ color: "#83858c" }}>PAN Number</label>
                      <input value={kycForm.pan_number} onChange={e => setKYCForm(p => ({ ...p, pan_number: e.target.value.toUpperCase() }))}
                        placeholder="e.g. ABCDE1234F" maxLength={10} className="pf-in" style={IS} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-[0.15em] mb-1.5 block" style={{ color: "#83858c" }}>Aadhaar Photo <span style={{ color: "#de1a1a" }}>*</span></label>
                      <DocUploadButton
                        label="Upload Aadhaar Photo (required)"
                        url={kycForm.govt_id_url}
                        loading={uploadingField === "govt_id_url"}
                        onFile={f => handleDocUpload("govt_id_url", f)}
                      />
                    </div>
                  </div>
                </div>

                {/* Ration card */}
                <div>
                  <p className="text-[11px] font-bold mb-2" style={{ color: "#374151" }}>Ration Card</p>
                  <DocUploadButton
                    label="Upload Ration Card"
                    url={kycForm.ration_card_url}
                    loading={uploadingField === "ration_card_url"}
                    onFile={f => handleDocUpload("ration_card_url", f)}
                  />
                </div>

                {kycError && <p className="text-[12px]" style={{ color: "#de1a1a" }}>{kycError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={handleKYCSave} disabled={kycPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold"
                    style={{ background: "linear-gradient(135deg, #de1a1a, #7F1D1D)", color: "#FFFFFF" }}>
                    {kycPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
                  </button>
                  <button onClick={() => setEditKYC(false)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold"
                    style={{ background: "#F9FAFB", color: "#6B7280", border: "1px solid #E5E7EB" }}>
                    <X size={11} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {[
                  { icon: Landmark,   label: "Bank",           value: kyc?.bank_name ? `${kyc.bank_name}${kyc.bank_ifsc ? ` · ${kyc.bank_ifsc}` : ""}` : "—", url: null },
                  { icon: CreditCard, label: "Account No.",    value: kyc?.bank_account ? `****${kyc.bank_account.slice(-4)}` : "—", url: null },
                  { icon: FileText,   label: "Aadhaar No.",    value: kyc?.aadhaar_number ?? "—", url: null },
                  { icon: FileText,   label: "PAN No.",        value: kyc?.pan_number ?? "—", url: null },
                  { icon: FileText,   label: "Aadhaar Photo",  value: kyc?.govt_id_url ? "Uploaded" : "—", url: kyc?.govt_id_url ?? null },
                  { icon: FileText,   label: "Ration Card",    value: kyc?.ration_card_url ? "Uploaded" : "—", url: kyc?.ration_card_url ?? null },
                ].map(({ icon: Icon, label, value, url }) => (
                  <div key={label} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.02)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(0,0,0,0.03)" }}>
                      <Icon size={13} style={{ color: value === "—" ? "#D1D5DB" : "#83858c" }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: "#83858c" }}>{label}</p>
                      <p className="text-[13px] font-semibold" style={{ color: value === "—" ? "#D1D5DB" : "#111111" }}>{value}</p>
                    </div>
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg flex-shrink-0"
                        style={{ background: "rgba(22,163,74,0.08)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.2)", textDecoration: "none" }}>
                        <CheckCircle2 size={11} /> View
                      </a>
                    )}
                    {!url && value === "—" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(222,26,26,0.08)", color: "#de1a1a" }}>Missing</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Account Actions */}
          <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-4" style={{ color: "#83858c" }}>Account Actions</p>
            <div className="space-y-2">
              <button onClick={() => router.push("/change-password")}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                style={{ background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.15)" }}>
                <KeyRound size={15} style={{ color: "#B91C1C" }} />
                <span className="text-[13px] font-semibold" style={{ color: "#B91C1C" }}>Change Password</span>
              </button>
              <button onClick={() => startLogout(async () => { await logoutAction() })} disabled={logoutPending}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                style={{ background: "rgba(255,107,87,0.06)", border: "1px solid rgba(255,107,87,0.15)" }}>
                {logoutPending ? <Loader2 size={15} className="animate-spin" style={{ color: "#de1a1a" }} /> : <LogOut size={15} style={{ color: "#de1a1a" }} />}
                <span className="text-[13px] font-semibold" style={{ color: "#de1a1a" }}>{logoutPending ? "Signing out…" : "Sign Out"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="space-y-4">
          <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-4" style={{ color: "#D1D5DB" }}>This Week</p>
            <div className="space-y-3">
              {[
                { icon: Clock,       label: "Hours Worked",    value: stats.weekHours > 0 ? `${stats.weekHours}h` : "—", color: "#de1a1a", bg: "rgba(222,26,26,0.08)" },
                { icon: Target,      label: "Tasks Completed", value: stats.totalCompleted, color: "#de1a1a", bg: "rgba(222,26,26,0.08)" },
                { icon: AlertCircle, label: "Missed Updates",  value: stats.weekMissed, color: stats.weekMissed > 0 ? "#F59E0B" : "#10B981", bg: stats.weekMissed > 0 ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.08)" },
                { icon: TrendingUp,  label: "Leave Requests",  value: stats.totalLeaves, color: "#6B7280", bg: "rgba(0,0,0,0.03)" },
              ].map(({ icon: Icon, label, value, color, bg }) => (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: bg }}>
                    <Icon size={13} style={{ color }} />
                  </div>
                  <div className="flex-1"><p className="text-[11px]" style={{ color: "#83858c" }}>{label}</p></div>
                  <p className="text-[16px] font-black" style={{ fontFamily: "var(--font-jakarta)", color }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
            <WeekChart data={chartData} />
          </div>

          <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", border: "1px solid #F0F0F0" }}>
            <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-4" style={{ color: "#D1D5DB" }}>Recent Activity</p>
            {recentUpdates.length === 0 ? (
              <p className="text-[13px] text-center py-4" style={{ color: "rgba(0,0,0,0.1)" }}>No updates yet</p>
            ) : (
              <div className="space-y-2.5">
                {recentUpdates.map((upd) => (
                  <div key={upd.date} className="flex items-start gap-3">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: "#de1a1a" }} />
                    <div className="flex-1">
                      <p className="text-[12px] font-semibold" style={{ color: "#111111" }}>{relativeDate(upd.date)}</p>
                      <p className="text-[11px]" style={{ color: "#83858c" }}>
                        {upd.working_hours != null ? `${upd.working_hours}h worked` : "Update submitted"}
                        {upd.shoot_count && upd.shoot_count > 0 ? ` · ${upd.shoot_count} shoot${upd.shoot_count !== 1 ? "s" : ""}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DocUploadButton({ label, url, loading, onFile }: {
  label: string; url: string; loading: boolean; onFile: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      <button onClick={() => ref.current?.click()} disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-[13px] font-medium transition-all"
        style={{ borderColor: url ? "#16A34A" : "#E5E7EB", color: url ? "#16A34A" : "#83858c", background: url ? "rgba(22,163,74,0.04)" : "#F9FAFB" }}>
        {loading ? <Loader2 size={14} className="animate-spin" /> : url ? <CheckCircle2 size={14} /> : <Upload size={14} />}
        {loading ? "Uploading…" : url ? "Uploaded — click to replace" : label}
      </button>
    </div>
  )
}
