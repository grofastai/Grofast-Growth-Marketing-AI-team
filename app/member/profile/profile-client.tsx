"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Mail, Phone, Briefcase, Calendar, Shield,
  Edit2, Check, X, Loader2, LogOut, KeyRound,
  Clock, Target, AlertCircle, TrendingUp, Zap,
  Camera, HeartPulse, MapPin, UserPlus, Landmark,
  CreditCard, FileText, Upload, CheckCircle2, AlertTriangle,
  ChevronRight,
} from "lucide-react"
import { updateOwnProfile } from "@/lib/actions/team"
import { updatePersonalDetails, updateKYC } from "@/lib/actions/profile"
import { logoutAction } from "@/lib/actions/auth"

interface ProfileData {
  id: string; name: string; employee_id: string; role: string
  email: string; phone: string; status: string; joined: string
  photo_url: string | null; position: string | null
  blood_group: string | null; address: string | null
  emergency_contact_name: string | null; emergency_contact_phone: string | null
}
interface KYCData {
  bank_name: string | null; bank_account: string | null; bank_ifsc: string | null
  aadhaar_number: string | null; pan_number: string | null
  govt_id_url: string | null; aadhaar_back_url: string | null
  pan_front_url: string | null; pan_back_url: string | null
  ration_card_url: string | null; ration_card_url2: string | null
}
interface Stats {
  weekHours: number; weekMissed: number
  totalCompleted: number; totalLeaves: number; avgHoursPerDay: number
}
interface ChartDay { date: string; label: string; hours: number; isFuture: boolean }
interface RecentUpdate { date: string; working_hours: number | null; shoot_count: number | null }

const IS: React.CSSProperties = {
  background: "#F8F9FC", border: "1px solid #EBEDF2", color: "#111111",
  borderRadius: "12px", padding: "11px 14px", fontSize: "13px", outline: "none", width: "100%",
}
const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"]
const INDIAN_BANKS = [
  "State Bank of India (SBI)", "Bank of Baroda", "Bank of India", "Canara Bank",
  "Punjab National Bank", "Union Bank of India", "Axis Bank", "HDFC Bank",
  "ICICI Bank", "IDBI Bank", "IDFC First Bank", "IndusInd Bank", "Kotak Mahindra Bank",
  "YES Bank", "Federal Bank", "South Indian Bank", "RBL Bank", "AU Small Finance Bank",
  "Ujjivan Small Finance Bank", "Airtel Payments Bank", "India Post Payments Bank",
  "Paytm Payments Bank", "Post Office (IPPB)", "Other",
]

function relativeDate(d: string) {
  const t = new Date().toISOString().split("T")[0]
  if (d === t) return "Today"
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (d === y.toISOString().split("T")[0]) return "Yesterday"
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" })
}

function completionScore(p: ProfileData | null, k: KYCData | null) {
  const items = [
    { label: "Profile photo",     done: !!p?.photo_url },
    { label: "Phone number",      done: !!p?.phone },
    { label: "Blood group",       done: !!p?.blood_group },
    { label: "Emergency contact", done: !!(p?.emergency_contact_name && p?.emergency_contact_phone) },
    { label: "Bank account",      done: !!(k?.bank_account && k?.bank_ifsc) },
    { label: "Aadhaar front",     done: !!k?.govt_id_url },
    { label: "Aadhaar back",      done: !!k?.aadhaar_back_url },
    { label: "PAN front",         done: !!k?.pan_front_url },
    { label: "PAN back",          done: !!k?.pan_back_url },
    { label: "Ration card (1)",   done: !!k?.ration_card_url },
    { label: "Ration card (2)",   done: !!k?.ration_card_url2 },
  ]
  return { score: Math.round((items.filter(i => i.done).length / items.length) * 100), items }
}

// ── Mini Completion Ring ────────────────────────────────────────────────────
function CompletionRing({ pct }: { pct: number }) {
  const r = 44, cx = 52, cy = 52, circ = 2 * Math.PI * r
  const arc = (pct / 100) * circ
  const col = pct >= 80 ? "#22C55E" : pct >= 50 ? "#F59E0B" : "#DE1A1A"
  return (
    <div style={{ position: "relative", width: 104, height: 104 }}>
      <svg width={104} height={104} viewBox="0 0 104 104" style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={9}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={col} strokeWidth={9}
          strokeLinecap="round" strokeDasharray={`${arc} ${circ - arc}`}
          style={{ transition: "stroke-dasharray 0.7s ease" }}/>
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 18, fontWeight: 900, color: "#111111", lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontSize: 9, color: col, fontWeight: 700, marginTop: 2 }}>
          {pct >= 80 ? "Great" : pct >= 50 ? "Good" : "Low"}
        </span>
      </div>
    </div>
  )
}

// ── Week Bar Chart ──────────────────────────────────────────────────────────
function WeekChart({ data }: { data: ChartDay[] }) {
  const maxH = Math.max(...data.map(d => d.hours), 1)
  const today = new Date().toISOString().split("T")[0]
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 64 }}>
        {data.map(day => {
          const pct = (day.hours / maxH) * 100
          const isToday = day.date === today
          return (
            <div key={day.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
              <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
                <div style={{
                  width: "100%", borderRadius: 4,
                  height: `${Math.max(day.isFuture ? 0 : pct, day.hours > 0 ? 10 : 3)}%`,
                  background: isToday ? "#DE1A1A" : day.hours > 0 ? "rgba(222,26,26,0.3)" : "#F3F4F6",
                  transition: "height 0.4s ease",
                }}/>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: isToday ? "#DE1A1A" : "#9CA3AF" }}>{day.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ProfileClient({
  profile, kyc, stats, chartData, recentUpdates, authEmail,
}: {
  profile: ProfileData | null; kyc: KYCData | null; stats: Stats
  chartData: ChartDay[]; recentUpdates: RecentUpdate[]; authEmail: string
}) {
  const router = useRouter()

  const [editing, setEditing]       = useState(false)
  const [editName, setEditName]     = useState(profile?.name ?? "")
  const [editPhone, setEditPhone]   = useState(profile?.phone ?? "")
  const [editError, setEditError]   = useState<string | null>(null)
  const [savePending, startSave]    = useTransition()

  const [editPersonal, setEditPersonal] = useState(false)
  const [personal, setPersonal] = useState({
    blood_group:             profile?.blood_group ?? "",
    address:                 profile?.address ?? "",
    emergency_contact_name:  profile?.emergency_contact_name ?? "",
    emergency_contact_phone: profile?.emergency_contact_phone ?? "",
  })
  const [personalPending, startPersonal] = useTransition()
  const [personalError, setPersonalError] = useState<string | null>(null)

  const [editKYC, setEditKYC]     = useState(false)
  const [kycForm, setKYCForm]     = useState({
    bank_name: kyc?.bank_name ?? "", bank_account: kyc?.bank_account ?? "",
    bank_ifsc: kyc?.bank_ifsc ?? "", aadhaar_number: kyc?.aadhaar_number ?? "",
    pan_number: kyc?.pan_number ?? "", govt_id_url: kyc?.govt_id_url ?? "",
    aadhaar_back_url: kyc?.aadhaar_back_url ?? "", pan_front_url: kyc?.pan_front_url ?? "",
    pan_back_url: kyc?.pan_back_url ?? "", ration_card_url: kyc?.ration_card_url ?? "",
    ration_card_url2: kyc?.ration_card_url2 ?? "",
  })
  const [kycPending, startKYC]        = useTransition()
  const [kycError, setKYCError]       = useState<string | null>(null)
  const [kycSuccess, setKycSuccess]   = useState(false)
  const [uploadingField, setUploadingField] = useState<string | null>(null)

  const photoRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy]   = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
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
        blood_group: personal.blood_group || null,
        address: personal.address || null,
        emergency_contact_name: personal.emergency_contact_name || null,
        emergency_contact_phone: personal.emergency_contact_phone || null,
      })
      if (res.success) { setEditPersonal(false); router.refresh() }
      else setPersonalError(res.error ?? "Failed to save")
    })
  }
  function handleKYCSave() {
    setKYCError(null); setKycSuccess(false)
    startKYC(async () => {
      if (!kycForm.govt_id_url)      { setKYCError("Aadhaar front photo is required"); return }
      if (!kycForm.aadhaar_back_url) { setKYCError("Aadhaar back photo is required"); return }
      if (!kycForm.pan_front_url)    { setKYCError("PAN card front photo is required"); return }
      if (!kycForm.pan_back_url)     { setKYCError("PAN card back photo is required"); return }
      if (!kycForm.ration_card_url)  { setKYCError("Ration card image 1 is required"); return }
      if (!kycForm.ration_card_url2) { setKYCError("Ration card image 2 is required"); return }
      const res = await updateKYC({
        bank_name: kycForm.bank_name || null, bank_account: kycForm.bank_account || null,
        bank_ifsc: kycForm.bank_ifsc || null, aadhaar_number: kycForm.aadhaar_number || null,
        pan_number: kycForm.pan_number || null, govt_id_url: kycForm.govt_id_url || null,
        aadhaar_back_url: kycForm.aadhaar_back_url || null, pan_front_url: kycForm.pan_front_url || null,
        pan_back_url: kycForm.pan_back_url || null, ration_card_url: kycForm.ration_card_url || null,
        ration_card_url2: kycForm.ration_card_url2 || null,
      })
      if (res.success) { setEditKYC(false); setKycSuccess(true); router.refresh() }
      else setKYCError(res.error ?? "Failed to save")
    })
  }
  async function handlePhotoUpload(file: File) {
    setPhotoBusy(true); setPhotoError(null)
    try {
      const fd = new FormData(); fd.append("file", file)
      const res = await fetch("/api/upload-photo", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok || json.error) { setPhotoError(json.error ?? "Upload failed"); return }
      await updatePersonalDetails({ photo_url: json.url }); router.refresh()
    } catch { setPhotoError("Upload failed") } finally { setPhotoBusy(false) }
  }
  async function handleDocUpload(field: "govt_id_url"|"aadhaar_back_url"|"pan_front_url"|"pan_back_url"|"ration_card_url"|"ration_card_url2", file: File) {
    setUploadingField(field)
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "kyc")
      const res = await fetch("/api/upload-photo", { method: "POST", body: fd })
      const json = await res.json()
      if (res.ok && json.url) setKYCForm(prev => ({ ...prev, [field]: json.url }))
    } finally { setUploadingField(null) }
  }

  const statusColor = profile?.status === "active" ? "#22C55E" : "#EF4444"

  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh" }}>
      <style>{`.pf-in::placeholder{color:rgba(0,0,0,0.25);}.pf-in:focus{border-color:rgba(222,26,26,0.5)!important;box-shadow:0 0 0 3px rgba(222,26,26,0.08)!important;}`}</style>

      {/* ── HERO PROFILE CARD ────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #EBEDF2", position: "relative", overflow: "hidden" }}>

        {/* Cover gradient strip */}
        <div style={{ height: 150, background: "linear-gradient(110deg, #1C0808 0%, #7F1D1D 45%, #C0392B 75%, #DE1A1A 100%)", position: "relative", overflow: "hidden" }}>
          {/* Dot pattern overlay */}
          <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1.5px, transparent 1.5px)", backgroundSize: "22px 22px" }}/>
          {/* Warm right fade for illustration */}
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "45%", background: "linear-gradient(to left, rgba(255,235,235,0.18) 0%, transparent 100%)" }}/>

          {/* Boy illustration */}
          <div style={{ position: "absolute", right: 24, bottom: 0, width: 260, height: 200, zIndex: 2 }}>
            <Image
              src="/brand/profile-boy.png"
              fill
              style={{ objectFit: "contain", objectPosition: "bottom center" }}
              priority
              alt=""
            />
          </div>

          {/* Cover text */}
          <div style={{ position: "absolute", left: 32, top: "50%", transform: "translateY(-50%)", zIndex: 3 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.6)", margin: "0 0 4px", letterSpacing: "0.08em", textTransform: "uppercase" }}>Member Portal</p>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: "#fff", margin: 0, fontFamily: "var(--font-jakarta)" }}>My Profile</h1>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "4px 0 0" }}>Identity · Documents · Settings</p>
          </div>

          {/* Profile completion badge top-right */}
          <div style={{ position: "absolute", top: 16, right: 300, zIndex: 4, display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 20, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)" }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: "#fff" }}>{score}%</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>Profile Complete</span>
          </div>
        </div>

        {/* Identity row */}
        <div style={{ padding: "0 32px 24px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginTop: -40 }}>

            {/* Avatar */}
            <div style={{ position: "relative", flexShrink: 0, zIndex: 4 }}>
              <div style={{ width: 88, height: 88, borderRadius: "50%", overflow: "hidden", border: "4px solid #fff", boxShadow: "0 4px 20px rgba(0,0,0,0.15)", background: "linear-gradient(135deg, rgba(222,26,26,0.15), rgba(222,26,26,0.05))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, color: "#DE1A1A", fontFamily: "var(--font-jakarta)" }}>
                {profile?.photo_url
                  ? <img src={profile.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : initial}
              </div>
              {/* Status dot */}
              <div style={{ position: "absolute", bottom: 6, right: 4, width: 16, height: 16, borderRadius: "50%", background: statusColor, border: "3px solid #fff" }}/>
              {/* Camera button */}
              <button onClick={() => photoRef.current?.click()} disabled={photoBusy}
                style={{ position: "absolute", bottom: -2, left: -2, width: 26, height: 26, borderRadius: "50%", background: "#DE1A1A", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                {photoBusy ? <Loader2 size={11} style={{ color: "#fff", animation: "spin 1s linear infinite" }}/> : <Camera size={11} style={{ color: "#fff" }}/>}
              </button>
              <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }}/>
            </div>

            {/* Name + badges */}
            <div style={{ flex: 1, paddingBottom: 4 }}>
              {editing ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input className="pf-in" style={{ ...IS, width: 200, padding: "8px 12px" }} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name"/>
                  <input className="pf-in" style={{ ...IS, width: 160, padding: "8px 12px" }} value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone"/>
                  {editError && <p style={{ fontSize: 11, color: "#DE1A1A", width: "100%", margin: 0 }}>{editError}</p>}
                  <button onClick={handleSave} disabled={savePending} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 10, background: "#DE1A1A", border: "none", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                    {savePending ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }}/> : <Check size={11}/>} Save
                  </button>
                  <button onClick={() => { setEditing(false); setEditName(profile?.name ?? ""); setEditPhone(profile?.phone ?? "") }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 10, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
                    <X size={11}/> Cancel
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111111", margin: "0 0 6px", fontFamily: "var(--font-jakarta)" }}>
                      {profile?.name ?? authEmail.split("@")[0]}
                    </h2>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ padding: "4px 12px", borderRadius: 99, background: "rgba(222,26,26,0.1)", fontSize: 11, fontWeight: 700, color: "#DE1A1A" }}>
                        {profile?.role ?? "MEMBER"}
                      </span>
                      <span style={{ padding: "4px 12px", borderRadius: 99, background: "#F5F6FA", fontSize: 11, fontWeight: 700, color: "#374151", border: "1px solid #EBEDF2" }}>
                        #{profile?.employee_id ?? "—"}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 99, background: profile?.status === "active" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", fontSize: 11, fontWeight: 700, color: statusColor }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor }}/>
                        {profile?.status ?? "active"}
                      </span>
                      {profile?.position && (
                        <span style={{ fontSize: 12, color: "#6B7280", fontWeight: 500 }}>{profile.position}</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setEditing(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 12, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 13, fontWeight: 700, color: "#374151", cursor: "pointer", flexShrink: 0 }}>
                    <Edit2 size={13}/> Edit Profile
                  </button>
                </div>
              )}
              {photoError && <p style={{ fontSize: 11, color: "#DE1A1A", marginTop: 4 }}>{photoError}</p>}
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginTop: 20, paddingTop: 20, borderTop: "1px solid #EBEDF2" }}>
            {[
              { emoji: "🕐", value: stats.weekHours > 0 ? `${stats.weekHours}h` : "—", label: "Week Hours",      color: "#DE1A1A", bg: "rgba(222,26,26,0.07)"  },
              { emoji: "🎯", value: stats.totalCompleted,                               label: "Tasks Done",       color: "#6366F1", bg: "rgba(99,102,241,0.07)" },
              { emoji: "📋", value: stats.totalLeaves,                                  label: "Leave Requests",   color: "#F59E0B", bg: "rgba(245,158,11,0.07)" },
              { emoji: "⚡", value: stats.avgHoursPerDay > 0 ? `${stats.avgHoursPerDay}h` : "—", label: "Avg / Day", color: "#22C55E", bg: "rgba(34,197,94,0.07)"  },
              { emoji: "⚠️", value: stats.weekMissed,                                   label: "Missed Updates",   color: stats.weekMissed > 0 ? "#F59E0B" : "#22C55E", bg: stats.weekMissed > 0 ? "rgba(245,158,11,0.07)" : "rgba(34,197,94,0.07)" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: s.bg, border: `1px solid ${s.bg.replace("0.07", "0.15")}` }}>
                <span style={{ fontSize: 20 }}>{s.emoji}</span>
                <div>
                  <p style={{ fontSize: 20, fontWeight: 900, color: "#111111", margin: 0, lineHeight: 1, fontFamily: "var(--font-jakarta)" }}>{s.value}</p>
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: "3px 0 0", fontWeight: 500 }}>{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 28px 48px", display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>

        {/* ── LEFT COLUMN ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Profile completion banner */}
          {score < 100 && (
            <div style={{ background: "#fff", borderRadius: 18, border: "1px solid #EBEDF2", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: score >= 60 ? "rgba(245,158,11,0.1)" : "rgba(222,26,26,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <AlertTriangle size={18} style={{ color: score >= 60 ? "#F59E0B" : "#DE1A1A" }}/>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: "#111111", margin: "0 0 8px" }}>
                  Profile {score}% complete — fill in remaining details
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {completionItems.filter(i => !i.done).map(i => (
                    <span key={i.label} style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(222,26,26,0.07)", color: "#DE1A1A" }}>
                      {i.label}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: 28, fontWeight: 900, color: score >= 60 ? "#F59E0B" : "#DE1A1A", margin: "0 0 4px", fontFamily: "var(--font-jakarta)" }}>{score}%</p>
                <div style={{ width: 80, height: 5, borderRadius: 99, background: "#F3F4F6", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 99, width: `${score}%`, background: score >= 60 ? "#F59E0B" : "#DE1A1A", transition: "width 0.6s" }}/>
                </div>
              </div>
            </div>
          )}
          {score === 100 && (
            <div style={{ background: "rgba(34,197,94,0.06)", borderRadius: 18, border: "1px solid rgba(34,197,94,0.2)", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
              <CheckCircle2 size={18} style={{ color: "#16A34A" }}/>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#16A34A", margin: 0 }}>Profile 100% complete — all details filled in</p>
            </div>
          )}

          {/* Account Details */}
          <SectionCard title="Account Details" icon="👤">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                { Icon: Mail,      label: "Email",       value: profile?.email || authEmail },
                { Icon: Phone,     label: "Phone",       value: profile?.phone || "—" },
                { Icon: Briefcase, label: "Employee ID", value: `#${profile?.employee_id ?? "—"}` },
                { Icon: Shield,    label: "Role",        value: profile?.role ?? "MEMBER" },
                { Icon: Zap,       label: "Position",    value: profile?.position || "—" },
                { Icon: Calendar,  label: "Joined",      value: profile?.joined ?? "—" },
              ].map(({ Icon, label, value }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, background: "#F8F9FC" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} style={{ color: "#6B7280" }}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", margin: "0 0 2px", fontWeight: 600 }}>{label}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: value === "—" ? "#D1D5DB" : "#111111", margin: 0, textTransform: "capitalize" }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Personal Details */}
          <SectionCard title="Personal Details" icon="🧬" action={!editPersonal ? (
            <button onClick={() => setEditPersonal(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 10, background: "rgba(222,26,26,0.07)", border: "1px solid rgba(222,26,26,0.15)", fontSize: 12, fontWeight: 700, color: "#DE1A1A", cursor: "pointer" }}>
              <Edit2 size={11}/> Edit
            </button>
          ) : null}>
            {editPersonal ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", display: "block", marginBottom: 8 }}>Blood Group</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {BLOOD_GROUPS.map(bg => (
                      <button key={bg} onClick={() => setPersonal(p => ({ ...p, blood_group: bg }))}
                        style={{ padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "none", background: personal.blood_group === bg ? "#DE1A1A" : "#F5F6FA", color: personal.blood_group === bg ? "#fff" : "#6B7280" }}>
                        {bg}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", display: "block", marginBottom: 6 }}>Residential Address</label>
                  <textarea value={personal.address} onChange={e => setPersonal(p => ({ ...p, address: e.target.value }))}
                    rows={2} placeholder="Full address…" className="pf-in"
                    style={{ ...IS, resize: "none" }}/>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", display: "block", marginBottom: 6 }}>Emergency Contact Name</label>
                    <input value={personal.emergency_contact_name} onChange={e => setPersonal(p => ({ ...p, emergency_contact_name: e.target.value }))}
                      placeholder="e.g. Mother" className="pf-in" style={IS}/>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", display: "block", marginBottom: 6 }}>Emergency Phone</label>
                    <input value={personal.emergency_contact_phone} onChange={e => setPersonal(p => ({ ...p, emergency_contact_phone: e.target.value }))}
                      placeholder="Phone number" className="pf-in" style={IS}/>
                  </div>
                </div>
                {personalError && <p style={{ fontSize: 12, color: "#DE1A1A", margin: 0 }}>{personalError}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handlePersonalSave} disabled={personalPending}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 12, background: "linear-gradient(135deg,#DE1A1A,#7F1D1D)", border: "none", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                    {personalPending ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }}/> : <Check size={12}/>} Save Changes
                  </button>
                  <button onClick={() => setEditPersonal(false)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 13, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
                    <X size={12}/> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { Icon: HeartPulse, label: "Blood Group",       value: profile?.blood_group || "—" },
                  { Icon: MapPin,     label: "Address",           value: profile?.address || "—" },
                  { Icon: UserPlus,   label: "Emergency Contact", value: profile?.emergency_contact_name ? `${profile.emergency_contact_name}${profile.emergency_contact_phone ? ` · ${profile.emergency_contact_phone}` : ""}` : "—" },
                ].map(({ Icon, label, value }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, background: "#F8F9FC" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={14} style={{ color: value === "—" ? "#D1D5DB" : "#6B7280" }}/>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", margin: "0 0 2px", fontWeight: 600 }}>{label}</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: value === "—" ? "#D1D5DB" : "#111111", margin: 0 }}>{value}</p>
                    </div>
                    {value === "—" && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: "rgba(222,26,26,0.07)", color: "#DE1A1A" }}>Missing</span>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* KYC & Bank */}
          <SectionCard title="KYC & Bank Details" icon="🏦" action={!editKYC ? (
            <button onClick={() => { setEditKYC(true); setKycSuccess(false) }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 10, background: "rgba(222,26,26,0.07)", border: "1px solid rgba(222,26,26,0.15)", fontSize: 12, fontWeight: 700, color: "#DE1A1A", cursor: "pointer" }}>
              <Edit2 size={11}/> Edit
            </button>
          ) : null}>
            {kycSuccess && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 12, background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", marginBottom: 12 }}>
                <CheckCircle2 size={14} style={{ color: "#16A34A" }}/><p style={{ fontSize: 12, fontWeight: 600, color: "#16A34A", margin: 0 }}>KYC saved successfully</p>
              </div>
            )}
            {editKYC ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {/* Bank */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}><Landmark size={13}/> Bank Account</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <select value={kycForm.bank_name} onChange={e => setKYCForm(p => ({ ...p, bank_name: e.target.value }))}
                      className="pf-in" style={{ ...IS, appearance: "none" }}>
                      <option value="">Select bank…</option>
                      {INDIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <input value={kycForm.bank_account} onChange={e => setKYCForm(p => ({ ...p, bank_account: e.target.value }))} placeholder="Account number" className="pf-in" style={IS}/>
                      <input value={kycForm.bank_ifsc} onChange={e => setKYCForm(p => ({ ...p, bank_ifsc: e.target.value }))} placeholder="IFSC code" className="pf-in" style={IS}/>
                    </div>
                  </div>
                </div>
                {/* Identity numbers */}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}><CreditCard size={13}/> Identity Numbers</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>Aadhaar Number</label>
                      <input value={kycForm.aadhaar_number} onChange={e => setKYCForm(p => ({ ...p, aadhaar_number: e.target.value }))} placeholder="12-digit number" maxLength={14} className="pf-in" style={IS}/>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>PAN Number</label>
                      <input value={kycForm.pan_number} onChange={e => setKYCForm(p => ({ ...p, pan_number: e.target.value.toUpperCase() }))} placeholder="e.g. ABCDE1234F" maxLength={10} className="pf-in" style={IS}/>
                    </div>
                  </div>
                </div>
                {/* Documents */}
                {([
                  { title: "Aadhaar Card", fields: [{ field: "govt_id_url" as const, label: "Front" }, { field: "aadhaar_back_url" as const, label: "Back" }] },
                  { title: "PAN Card",     fields: [{ field: "pan_front_url" as const, label: "Front" }, { field: "pan_back_url" as const, label: "Back" }] },
                  { title: "Ration Card",  fields: [{ field: "ration_card_url" as const, label: "Image 1" }, { field: "ration_card_url2" as const, label: "Image 2" }] },
                ]).map(section => (
                  <div key={section.title}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                      <FileText size={13}/> {section.title}
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: "rgba(222,26,26,0.07)", color: "#DE1A1A" }}>Both sides required</span>
                    </p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {section.fields.map(({ field, label }) => (
                        <div key={field}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label} <span style={{ color: "#DE1A1A" }}>*</span></label>
                          <DocUploadButton label={`Upload ${label}`} url={kycForm[field]} loading={uploadingField === field} onFile={f => handleDocUpload(field, f)}/>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {kycError && <p style={{ fontSize: 12, color: "#DE1A1A", margin: 0 }}>{kycError}</p>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleKYCSave} disabled={kycPending}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 12, background: "linear-gradient(135deg,#DE1A1A,#7F1D1D)", border: "none", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                    {kycPending ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }}/> : <Check size={12}/>} Save KYC
                  </button>
                  <button onClick={() => setEditKYC(false)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 13, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
                    <X size={12}/> Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { Icon: Landmark,   label: "Bank",            value: kyc?.bank_name ? `${kyc.bank_name}${kyc.bank_ifsc ? ` · ${kyc.bank_ifsc}` : ""}` : "—", url: null },
                  { Icon: CreditCard, label: "Account No.",     value: kyc?.bank_account ? `****${kyc.bank_account.slice(-4)}` : "—", url: null },
                  { Icon: FileText,   label: "Aadhaar No.",     value: kyc?.aadhaar_number ?? "—", url: null },
                  { Icon: FileText,   label: "PAN No.",         value: kyc?.pan_number ?? "—", url: null },
                  { Icon: FileText,   label: "Aadhaar Front",   value: kyc?.govt_id_url ? "Uploaded ✓" : "—", url: kyc?.govt_id_url ?? null },
                  { Icon: FileText,   label: "Aadhaar Back",    value: kyc?.aadhaar_back_url ? "Uploaded ✓" : "—", url: kyc?.aadhaar_back_url ?? null },
                  { Icon: FileText,   label: "PAN Front",       value: kyc?.pan_front_url ? "Uploaded ✓" : "—", url: kyc?.pan_front_url ?? null },
                  { Icon: FileText,   label: "PAN Back",        value: kyc?.pan_back_url ? "Uploaded ✓" : "—", url: kyc?.pan_back_url ?? null },
                  { Icon: FileText,   label: "Ration Card (1)", value: kyc?.ration_card_url ? "Uploaded ✓" : "—", url: kyc?.ration_card_url ?? null },
                  { Icon: FileText,   label: "Ration Card (2)", value: kyc?.ration_card_url2 ? "Uploaded ✓" : "—", url: kyc?.ration_card_url2 ?? null },
                ].map(({ Icon, label, value, url }) => (
                  <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, background: "#F8F9FC" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "#fff", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon size={14} style={{ color: value.includes("✓") ? "#16A34A" : value === "—" ? "#D1D5DB" : "#6B7280" }}/>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", margin: "0 0 2px", fontWeight: 600 }}>{label}</p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: value.includes("✓") ? "#16A34A" : value === "—" ? "#D1D5DB" : "#111111", margin: 0 }}>{value}</p>
                    </div>
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer"
                        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 12px", borderRadius: 99, background: "rgba(34,197,94,0.08)", color: "#16A34A", fontSize: 11, fontWeight: 700, textDecoration: "none", border: "1px solid rgba(34,197,94,0.2)", flexShrink: 0 }}>
                        <CheckCircle2 size={11}/> View
                      </a>
                    )}
                    {!url && value === "—" && <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: "rgba(222,26,26,0.07)", color: "#DE1A1A", flexShrink: 0 }}>Missing</span>}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Account Actions */}
          <SectionCard title="Account Actions" icon="⚙️">
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={() => router.push("/change-password")}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 14, background: "rgba(222,26,26,0.05)", border: "1px solid rgba(222,26,26,0.15)", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(222,26,26,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <KeyRound size={16} style={{ color: "#DE1A1A" }}/>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#B91C1C", margin: "0 0 2px" }}>Change Password</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Update your account password</p>
                </div>
                <ChevronRight size={16} style={{ color: "#D1D5DB" }}/>
              </button>
              <button onClick={() => startLogout(async () => { await logoutAction() })} disabled={logoutPending}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 14, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", cursor: "pointer", textAlign: "left" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {logoutPending ? <Loader2 size={16} style={{ color: "#DE1A1A", animation: "spin 1s linear infinite" }}/> : <LogOut size={16} style={{ color: "#DE1A1A" }}/>}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#DE1A1A", margin: "0 0 2px" }}>{logoutPending ? "Signing out…" : "Sign Out"}</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>End your current session</p>
                </div>
                <ChevronRight size={16} style={{ color: "#D1D5DB" }}/>
              </button>
            </div>
          </SectionCard>
        </div>

        {/* ── RIGHT COLUMN ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Completion Ring */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#111111" }}>Profile Completion</span>
              <span style={{ fontSize: 10, fontWeight: 600, color: "#9CA3AF" }}>{completionItems.filter(i => i.done).length}/{completionItems.length} filled</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <CompletionRing pct={score}/>
              <div style={{ flex: 1 }}>
                {completionItems.slice(0, 5).map(item => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: item.done ? "rgba(34,197,94,0.1)" : "rgba(222,26,26,0.07)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {item.done
                        ? <Check size={9} style={{ color: "#16A34A" }}/>
                        : <X size={9} style={{ color: "#DE1A1A" }}/>}
                    </div>
                    <span style={{ fontSize: 11, color: item.done ? "#374151" : "#9CA3AF", fontWeight: item.done ? 600 : 400 }}>{item.label}</span>
                  </div>
                ))}
                {completionItems.length > 5 && (
                  <p style={{ fontSize: 10, color: "#9CA3AF", margin: "4px 0 0" }}>+{completionItems.length - 5} more items</p>
                )}
              </div>
            </div>
          </div>

          {/* This Week Stats */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#111111", margin: "0 0 14px" }}>This Week</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { Icon: Clock,       label: "Hours Worked",    value: stats.weekHours > 0 ? `${stats.weekHours}h` : "—", color: "#DE1A1A", bg: "rgba(222,26,26,0.08)" },
                { Icon: Target,      label: "Tasks Completed", value: stats.totalCompleted, color: "#6366F1", bg: "rgba(99,102,241,0.08)" },
                { Icon: AlertCircle, label: "Missed Updates",  value: stats.weekMissed, color: stats.weekMissed > 0 ? "#F59E0B" : "#22C55E", bg: stats.weekMissed > 0 ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)" },
                { Icon: TrendingUp,  label: "Leave Requests",  value: stats.totalLeaves, color: "#6B7280", bg: "rgba(0,0,0,0.04)" },
              ].map(({ Icon, label, value, color, bg }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} style={{ color }}/>
                  </div>
                  <p style={{ fontSize: 12, color: "#6B7280", flex: 1, margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 16, fontWeight: 900, color, margin: 0, fontFamily: "var(--font-jakarta)" }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 7-day chart */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#111111", margin: "0 0 14px" }}>Last 7 Days</p>
            <WeekChart data={chartData}/>
          </div>

          {/* Recent Activity */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#111111", margin: "0 0 14px" }}>Recent Activity</p>
            {recentUpdates.length === 0 ? (
              <p style={{ fontSize: 13, color: "#D1D5DB", textAlign: "center", padding: "16px 0", margin: 0 }}>No updates yet</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recentUpdates.map(upd => (
                  <div key={upd.date} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#DE1A1A", marginTop: 5, flexShrink: 0 }}/>
                    <div>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#111111", margin: "0 0 2px" }}>{relativeDate(upd.date)}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
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

// ── Section Card wrapper ────────────────────────────────────────────────────
function SectionCard({ title, icon, children, action }: {
  title: string; icon: string; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px 22px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>{icon}</span>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#111111" }}>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

// ── Doc Upload Button ───────────────────────────────────────────────────────
function DocUploadButton({ label, url, loading, onFile }: {
  label: string; url: string; loading: boolean; onFile: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }}/>
      <button onClick={() => ref.current?.click()} disabled={loading}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px", borderRadius: 12, border: `2px dashed ${url ? "#16A34A" : "#EBEDF2"}`, background: url ? "rgba(34,197,94,0.04)" : "#F8F9FC", fontSize: 12, fontWeight: 600, color: url ? "#16A34A" : "#6B7280", cursor: "pointer" }}>
        {loading ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }}/> : url ? <CheckCircle2 size={13}/> : <Upload size={13}/>}
        {loading ? "Uploading…" : url ? "Uploaded — click to replace" : label}
      </button>
    </div>
  )
}
