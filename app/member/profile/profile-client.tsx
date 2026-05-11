"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Mail, Phone, Briefcase, Calendar, Shield, Edit2, Check, X,
  Loader2, LogOut, KeyRound, Clock, Target, AlertCircle, TrendingUp,
  Zap, Camera, HeartPulse, MapPin, UserPlus, Landmark, CreditCard,
  FileText, Upload, CheckCircle2, AlertTriangle, ChevronDown,
  ChevronRight, Bell, Settings, Lock, FolderOpen, User,
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
  "Ujjivan Small Finance Bank", "India Post Payments Bank", "Post Office (IPPB)", "Other",
]

function relativeDate(d: string) {
  const t = new Date().toISOString().split("T")[0]
  if (d === t) return "Today"
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (d === y.toISOString().split("T")[0]) return "Yesterday"
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
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
    { label: "PAN card front",    done: !!k?.pan_front_url },
    { label: "PAN card back",     done: !!k?.pan_back_url },
    { label: "Ration card (1)",   done: !!k?.ration_card_url },
    { label: "Ration card (2)",   done: !!k?.ration_card_url2 },
  ]
  return { score: Math.round((items.filter(i => i.done).length / items.length) * 100), items }
}

// ── Week Bar Chart ──────────────────────────────────────────────────────────
function WeekChart({ data }: { data: ChartDay[] }) {
  const maxH  = Math.max(...data.map(d => d.hours), 1)
  const today = new Date().toISOString().split("T")[0]
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 70 }}>
      {data.map(day => {
        const h = (day.hours / maxH) * 100
        const isToday = day.date === today
        return (
          <div key={day.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%" }}>
            <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "flex-end" }}>
              <div style={{
                width: "100%", borderRadius: "4px 4px 0 0",
                height: `${Math.max(day.isFuture ? 0 : h, day.hours > 0 ? 12 : 5)}%`,
                background: isToday ? "#DE1A1A" : day.hours > 0 ? "rgba(222,26,26,0.25)" : "#F3F4F6",
              }}/>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: isToday ? "#DE1A1A" : "#9CA3AF", whiteSpace: "nowrap" }}>{day.label}</span>
          </div>
        )
      })}
    </div>
  )
}

const DOT_COLORS = ["#DE1A1A", "#F59E0B", "#3B82F6", "#22C55E", "#8B5CF6"]

export default function ProfileClient({
  profile, kyc, stats, chartData, recentUpdates, authEmail,
}: {
  profile: ProfileData | null; kyc: KYCData | null; stats: Stats
  chartData: ChartDay[]; recentUpdates: RecentUpdate[]; authEmail: string
}) {
  const router = useRouter()

  const [editing, setEditing]     = useState(false)
  const [editName, setEditName]   = useState(profile?.name ?? "")
  const [editPhone, setEditPhone] = useState(profile?.phone ?? "")
  const [editError, setEditError] = useState<string | null>(null)
  const [savePending, startSave]  = useTransition()

  const [editPersonal, setEditPersonal] = useState(false)
  const [personal, setPersonal] = useState({
    blood_group:             profile?.blood_group ?? "",
    address:                 profile?.address ?? "",
    emergency_contact_name:  profile?.emergency_contact_name ?? "",
    emergency_contact_phone: profile?.emergency_contact_phone ?? "",
  })
  const [personalPending, startPersonal] = useTransition()
  const [personalError, setPersonalError] = useState<string | null>(null)

  const [editKYC, setEditKYC]   = useState(false)
  const [kycForm, setKYCForm]   = useState({
    bank_name: kyc?.bank_name ?? "", bank_account: kyc?.bank_account ?? "",
    bank_ifsc: kyc?.bank_ifsc ?? "", aadhaar_number: kyc?.aadhaar_number ?? "",
    pan_number: kyc?.pan_number ?? "", govt_id_url: kyc?.govt_id_url ?? "",
    aadhaar_back_url: kyc?.aadhaar_back_url ?? "", pan_front_url: kyc?.pan_front_url ?? "",
    pan_back_url: kyc?.pan_back_url ?? "", ration_card_url: kyc?.ration_card_url ?? "",
    ration_card_url2: kyc?.ration_card_url2 ?? "",
  })
  const [kycPending, startKYC]      = useTransition()
  const [kycError, setKYCError]     = useState<string | null>(null)
  const [kycSuccess, setKycSuccess] = useState(false)
  const [uploadingField, setUploadingField] = useState<string | null>(null)

  const photoRef = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy]   = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [logoutPending, startLogout] = useTransition()

  const displayName = profile?.name ?? authEmail.split("@")[0]
  const initial     = displayName.charAt(0).toUpperCase()
  const initials    = displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
  const { score, items: completionItems } = completionScore(profile, kyc ?? kycForm as KYCData)
  const missing = completionItems.filter(i => !i.done)

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
      if (!kycForm.govt_id_url)      { setKYCError("Aadhaar front photo required"); return }
      if (!kycForm.aadhaar_back_url) { setKYCError("Aadhaar back photo required"); return }
      if (!kycForm.pan_front_url)    { setKYCError("PAN front photo required"); return }
      if (!kycForm.pan_back_url)     { setKYCError("PAN back photo required"); return }
      if (!kycForm.ration_card_url)  { setKYCError("Ration card image 1 required"); return }
      if (!kycForm.ration_card_url2) { setKYCError("Ration card image 2 required"); return }
      const res = await updateKYC({
        bank_name: kycForm.bank_name||null, bank_account: kycForm.bank_account||null,
        bank_ifsc: kycForm.bank_ifsc||null, aadhaar_number: kycForm.aadhaar_number||null,
        pan_number: kycForm.pan_number||null, govt_id_url: kycForm.govt_id_url||null,
        aadhaar_back_url: kycForm.aadhaar_back_url||null, pan_front_url: kycForm.pan_front_url||null,
        pan_back_url: kycForm.pan_back_url||null, ration_card_url: kycForm.ration_card_url||null,
        ration_card_url2: kycForm.ration_card_url2||null,
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
  async function handleDocUpload(
    field: "govt_id_url"|"aadhaar_back_url"|"pan_front_url"|"pan_back_url"|"ration_card_url"|"ration_card_url2",
    file: File
  ) {
    setUploadingField(field)
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "kyc")
      const res = await fetch("/api/upload-photo", { method: "POST", body: fd })
      const json = await res.json()
      if (res.ok && json.url) setKYCForm(p => ({ ...p, [field]: json.url }))
    } finally { setUploadingField(null) }
  }

  const circ = 2 * Math.PI * 42
  const arc  = (score / 100) * circ

  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh", padding: "24px 28px 48px" }}>
      <style>{`.pf-in::placeholder{color:rgba(0,0,0,0.25);}.pf-in:focus{border-color:rgba(222,26,26,0.5)!important;box-shadow:0 0 0 3px rgba(222,26,26,0.08)!important;}`}</style>

      {/* ── TOPBAR ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 4px", fontFamily: "var(--font-jakarta)" }}>
            <span style={{ color: "#111111" }}>My </span>
            <span style={{ color: "#DE1A1A" }}>Profile</span>
          </h1>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0 }}>Manage your identity, documents and account settings.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#fff", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <Bell size={16} style={{ color: "#374151" }}/>
            </div>
            <span style={{ position: "absolute", top: -3, right: -3, width: 17, height: 17, borderRadius: "50%", background: "#DE1A1A", fontSize: 8, fontWeight: 900, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #F8F9FC" }}>3</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 99, background: "#fff", border: "1px solid #EBEDF2", cursor: "pointer" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#DE1A1A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff" }}>{initials}</div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#111111" }}>{initials}</span>
            <ChevronDown size={12} style={{ color: "#9CA3AF" }}/>
          </div>
        </div>
      </div>

      {/* ── MAIN GRID ─────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, alignItems: "start" }}>

        {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* DARK COMPLETION BANNER */}
          <div style={{ background: "#111111", borderRadius: 20, overflow: "hidden", position: "relative", padding: "28px 32px", minHeight: 160 }}>
            {/* Subtle dot pattern */}
            <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "20px 20px", pointerEvents: "none" }}/>

            {/* Red decorative swirl SVG */}
            <svg style={{ position: "absolute", right: 0, top: 0, bottom: 0, height: "100%", width: "50%", opacity: 0.55, pointerEvents: "none" }} viewBox="0 0 400 160" preserveAspectRatio="xMaxYMid slice">
              <path d="M420,0 Q300,80 420,160" stroke="#DE1A1A" strokeWidth="90" fill="none"/>
              <path d="M380,0 Q260,80 380,160" stroke="#9B1C1C" strokeWidth="50" fill="none" opacity="0.5"/>
              <path d="M340,-20 Q220,80 340,180" stroke="#7F1D1D" strokeWidth="30" fill="none" opacity="0.3"/>
            </svg>

            {/* Boy illustration with dark vignette */}
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "54%", zIndex: 2 }}>
              <Image src="/brand/profile-boy.png" fill
                style={{ objectFit: "contain", objectPosition: "right bottom" }} alt="" priority/>
              {/* Vignette to blend edges */}
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 60% 50%, transparent 45%, #111111 80%)", pointerEvents: "none" }}/>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "30%", background: "linear-gradient(to right, #111111, transparent)", pointerEvents: "none" }}/>
            </div>

            {/* Completion content */}
            <div style={{ display: "flex", alignItems: "center", gap: 28, position: "relative", zIndex: 3 }}>
              {/* Ring */}
              <div style={{ position: "relative", width: 100, height: 100, flexShrink: 0 }}>
                <svg width={100} height={100} viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={50} cy={50} r={42} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={9}/>
                  <circle cx={50} cy={50} r={42} fill="none" stroke="#DE1A1A" strokeWidth={9}
                    strokeLinecap="round" strokeDasharray={`${arc} ${circ - arc}`}/>
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 21, fontWeight: 900, color: "#DE1A1A", fontFamily: "var(--font-jakarta)" }}>{score}%</span>
                </div>
              </div>
              {/* Text */}
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
                  Profile <span style={{ color: "#DE1A1A" }}>{score}%</span> complete
                </h2>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: "0 0 14px" }}>
                  Fill in your details to unlock full access
                </p>
                {missing.length > 0 ? (
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {missing.slice(0, 4).map(i => (
                      <span key={i.label} style={{ fontSize: 10, fontWeight: 600, padding: "4px 11px", borderRadius: 99, background: "rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.65)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        Missing: {i.label}
                      </span>
                    ))}
                    {missing.length > 4 && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 11px", borderRadius: 99, background: "rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.65)" }}>
                        + {missing.length - 4} more
                      </span>
                    )}
                  </div>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#22C55E", padding: "4px 12px", borderRadius: 99, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <CheckCircle2 size={11}/> All details filled in
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* PROFILE IDENTITY CARD */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "22px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            {/* Avatar + Name row */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 20 }}>
              {/* Avatar */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 78, height: 78, borderRadius: "50%", background: "#DE1A1A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: "var(--font-jakarta)", overflow: "hidden" }}>
                  {profile?.photo_url
                    ? <img src={profile.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                    : initials}
                </div>
                <button onClick={() => photoRef.current?.click()} disabled={photoBusy}
                  style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", width: 26, height: 26, borderRadius: "50%", background: "#fff", border: "2px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                  {photoBusy ? <Loader2 size={11} style={{ color: "#6B7280", animation: "spin 1s linear infinite" }}/> : <Camera size={11} style={{ color: "#6B7280" }}/>}
                </button>
                <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }}/>
              </div>

              {/* Name + badges + edit */}
              <div style={{ flex: 1 }}>
                {editing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input className="pf-in" style={{ ...IS, fontSize: "15px", fontWeight: "700" }} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name"/>
                    <input className="pf-in" style={IS} value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone number"/>
                    {editError && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{editError}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={handleSave} disabled={savePending} style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 10, background: "#DE1A1A", border: "none", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                        {savePending ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }}/> : <Check size={11}/>} Save
                      </button>
                      <button onClick={() => { setEditing(false); setEditName(profile?.name ?? ""); setEditPhone(profile?.phone ?? "") }}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 10, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
                        <X size={11}/> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111111", margin: "0 0 8px", fontFamily: "var(--font-jakarta)" }}>{displayName}</h2>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 99, background: "rgba(222,26,26,0.1)", color: "#DE1A1A", border: "1px solid rgba(222,26,26,0.18)", letterSpacing: "0.04em" }}>
                          {profile?.role ?? "MEMBER"}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "#F5F6FA", color: "#374151", border: "1px solid #EBEDF2" }}>
                          #{profile?.employee_id ?? "—"}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: profile?.status === "active" ? "#16A34A" : "#EF4444", display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: profile?.status === "active" ? "#16A34A" : "#EF4444", display: "inline-block" }}/>
                          {profile?.status === "active" ? "Active" : profile?.status ?? "Active"}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setEditing(true)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, background: "none", border: "1.5px solid rgba(222,26,26,0.3)", fontSize: 12, fontWeight: 700, color: "#DE1A1A", cursor: "pointer", flexShrink: 0 }}>
                      <Edit2 size={12}/> Edit Profile
                    </button>
                  </div>
                )}
                {photoError && <p style={{ fontSize: 11, color: "#DE1A1A", margin: "4px 0 0" }}>{photoError}</p>}
              </div>
            </div>

            {/* Stat tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderRadius: 14, border: "1px solid #EBEDF2" }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Zap size={20} style={{ color: "#DE1A1A" }}/>
                </div>
                <div>
                  <p style={{ fontSize: 28, fontWeight: 900, color: "#111111", margin: "0 0 2px", fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>
                    {stats.avgHoursPerDay > 0 ? `${stats.avgHoursPerDay}h` : "—"}
                  </p>
                  <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>Avg hours/day</p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderRadius: 14, border: "1px solid #EBEDF2" }}>
                <div style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Target size={20} style={{ color: "#DE1A1A" }}/>
                </div>
                <div>
                  <p style={{ fontSize: 28, fontWeight: 900, color: "#111111", margin: "0 0 2px", fontFamily: "var(--font-jakarta)", lineHeight: 1 }}>{stats.totalCompleted}</p>
                  <p style={{ fontSize: 11, color: "#6B7280", margin: 0 }}>Tasks completed</p>
                </div>
              </div>
            </div>
          </div>

          {/* PERSONAL DETAILS + KYC — side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* Personal Details */}
            <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <User size={16} style={{ color: "#374151" }}/>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#111111" }}>Personal Details</span>
                </div>
                {!editPersonal && (
                  <button onClick={() => setEditPersonal(true)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, background: "none", border: "1px solid rgba(222,26,26,0.25)", fontSize: 11, fontWeight: 700, color: "#DE1A1A", cursor: "pointer" }}>
                    <Edit2 size={10}/> Edit
                  </button>
                )}
              </div>

              {editPersonal ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", display: "block", marginBottom: 7 }}>Blood Group</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {BLOOD_GROUPS.map(bg => (
                        <button key={bg} onClick={() => setPersonal(p => ({ ...p, blood_group: bg }))}
                          style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", background: personal.blood_group === bg ? "#DE1A1A" : "#F5F6FA", color: personal.blood_group === bg ? "#fff" : "#6B7280" }}>
                          {bg}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#9CA3AF", display: "block", marginBottom: 5 }}>Address</label>
                    <textarea value={personal.address} onChange={e => setPersonal(p => ({ ...p, address: e.target.value }))} rows={2} className="pf-in" style={{ ...IS, resize: "none" }} placeholder="Full address…"/>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", display: "block", marginBottom: 5 }}>Emergency Name</label>
                      <input value={personal.emergency_contact_name} onChange={e => setPersonal(p => ({ ...p, emergency_contact_name: e.target.value }))} className="pf-in" style={IS} placeholder="Name"/>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", display: "block", marginBottom: 5 }}>Emergency Phone</label>
                      <input value={personal.emergency_contact_phone} onChange={e => setPersonal(p => ({ ...p, emergency_contact_phone: e.target.value }))} className="pf-in" style={IS} placeholder="Phone"/>
                    </div>
                  </div>
                  {personalError && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{personalError}</p>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handlePersonalSave} disabled={personalPending}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 18px", borderRadius: 10, background: "linear-gradient(135deg,#DE1A1A,#7F1D1D)", border: "none", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                      {personalPending ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }}/> : <Check size={11}/>} Save
                    </button>
                    <button onClick={() => setEditPersonal(false)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 10, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
                      <X size={11}/> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {[
                    { Icon: HeartPulse, label: "Blood Group",       value: profile?.blood_group || "—" },
                    { Icon: MapPin,     label: "Address",           value: profile?.address || "—" },
                    { Icon: UserPlus,   label: "Emergency Contact", value: profile?.emergency_contact_name ? `${profile.emergency_contact_name}${profile.emergency_contact_phone ? ` · ${profile.emergency_contact_phone}` : ""}` : "—" },
                  ].map(({ Icon, label, value }) => (
                    <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: "#F8F9FC", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                        <Icon size={13} style={{ color: value === "—" ? "#D1D5DB" : "#6B7280" }}/>
                      </div>
                      <div>
                        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", margin: "0 0 3px", fontWeight: 600 }}>{label}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: value === "—" ? "#D1D5DB" : "#111111", margin: 0, lineHeight: 1.5 }}>{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* KYC & Bank Details */}
            <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Landmark size={16} style={{ color: "#374151" }}/>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#111111" }}>KYC & Bank Details</span>
                </div>
                {!editKYC && (
                  <button onClick={() => { setEditKYC(true); setKycSuccess(false) }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, background: "none", border: "1px solid rgba(222,26,26,0.25)", fontSize: 11, fontWeight: 700, color: "#DE1A1A", cursor: "pointer" }}>
                    <Edit2 size={10}/> Edit
                  </button>
                )}
              </div>

              {kycSuccess && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", marginBottom: 12 }}>
                  <CheckCircle2 size={13} style={{ color: "#16A34A" }}/><p style={{ fontSize: 11, fontWeight: 600, color: "#16A34A", margin: 0 }}>KYC saved successfully</p>
                </div>
              )}

              {editKYC ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: "0 0 8px" }}>Bank Account</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      <select value={kycForm.bank_name} onChange={e => setKYCForm(p => ({ ...p, bank_name: e.target.value }))} className="pf-in" style={{ ...IS, appearance: "none" }}>
                        <option value="">Select bank…</option>
                        {INDIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                        <input value={kycForm.bank_account} onChange={e => setKYCForm(p => ({ ...p, bank_account: e.target.value }))} placeholder="Account number" className="pf-in" style={IS}/>
                        <input value={kycForm.bank_ifsc} onChange={e => setKYCForm(p => ({ ...p, bank_ifsc: e.target.value }))} placeholder="IFSC code" className="pf-in" style={IS}/>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    <div>
                      <label style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, display: "block", marginBottom: 4 }}>Aadhaar No.</label>
                      <input value={kycForm.aadhaar_number} onChange={e => setKYCForm(p => ({ ...p, aadhaar_number: e.target.value }))} placeholder="12-digit" maxLength={14} className="pf-in" style={IS}/>
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600, display: "block", marginBottom: 4 }}>PAN No.</label>
                      <input value={kycForm.pan_number} onChange={e => setKYCForm(p => ({ ...p, pan_number: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" maxLength={10} className="pf-in" style={IS}/>
                    </div>
                  </div>
                  {([
                    { title: "Aadhaar Card", fields: [{ f: "govt_id_url" as const, l: "Front" }, { f: "aadhaar_back_url" as const, l: "Back" }] },
                    { title: "PAN Card",     fields: [{ f: "pan_front_url" as const, l: "Front" }, { f: "pan_back_url" as const, l: "Back" }] },
                    { title: "Ration Card",  fields: [{ f: "ration_card_url" as const, l: "Img 1" }, { f: "ration_card_url2" as const, l: "Img 2" }] },
                  ]).map(sec => (
                    <div key={sec.title}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: "0 0 7px" }}>{sec.title} <span style={{ fontSize: 9, color: "#DE1A1A" }}>*both required</span></p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                        {sec.fields.map(({ f, l }) => (
                          <div key={f}>
                            <label style={{ fontSize: 9, color: "#9CA3AF", fontWeight: 600, display: "block", marginBottom: 4 }}>{l}</label>
                            <DocUploadButton label={`Upload ${l}`} url={kycForm[f]} loading={uploadingField === f} onFile={fl => handleDocUpload(f, fl)}/>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {kycError && <p style={{ fontSize: 11, color: "#DE1A1A", margin: 0 }}>{kycError}</p>}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleKYCSave} disabled={kycPending}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 18px", borderRadius: 10, background: "linear-gradient(135deg,#DE1A1A,#7F1D1D)", border: "none", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                      {kycPending ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }}/> : <Check size={11}/>} Save KYC
                    </button>
                    <button onClick={() => setEditKYC(false)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 10, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 700, color: "#6B7280", cursor: "pointer" }}>
                      <X size={11}/> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { Icon: Landmark,   label: "Bank",         value: kyc?.bank_name ? `${kyc.bank_name}${kyc.bank_ifsc ? ` · ${kyc.bank_ifsc}` : ""}` : "—" },
                    { Icon: CreditCard, label: "Account No.",  value: kyc?.bank_account ? `**** ${kyc.bank_account.slice(-4)}` : "—" },
                    { Icon: FileText,   label: "Aadhaar No.",  value: kyc?.aadhaar_number ?? "—" },
                    { Icon: FileText,   label: "PAN No.",      value: kyc?.pan_number ?? "—" },
                  ].map(({ Icon, label, value }) => (
                    <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: "#F8F9FC", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                        <Icon size={13} style={{ color: value === "—" ? "#D1D5DB" : "#6B7280" }}/>
                      </div>
                      <div>
                        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9CA3AF", margin: "0 0 3px", fontWeight: 600 }}>{label}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: value === "—" ? "#D1D5DB" : "#111111", margin: 0 }}>{value}</p>
                      </div>
                    </div>
                  ))}
                  <button
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", borderRadius: 12, background: "#F8F9FC", border: "1.5px solid #EBEDF2", fontSize: 12, fontWeight: 700, color: "#374151", cursor: "pointer", marginTop: 4 }}>
                    <FolderOpen size={14} style={{ color: "#DE1A1A" }}/> View All Documents
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ACCOUNT ACTIONS */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Settings size={16} style={{ color: "#374151" }}/>
              <span style={{ fontSize: 14, fontWeight: 800, color: "#111111" }}>Account Actions</span>
            </div>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>Manage your account security and preferences</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                { Icon: Lock,   title: "Change Password",       desc: "Update your password",    action: () => router.push("/change-password") },
                { Icon: Bell,   title: "Notification Settings", desc: "Manage alerts & updates",  action: () => {} },
                { Icon: Shield, title: "Privacy Settings",      desc: "Control your data",        action: () => {} },
              ].map(({ Icon, title, desc, action }) => (
                <button key={title} onClick={action}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, border: "1px solid #EBEDF2", background: "#F8F9FC", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: "#fff", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={15} style={{ color: "#374151" }}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#111111", margin: "0 0 2px" }}>{title}</p>
                    <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>{desc}</p>
                  </div>
                  <ChevronRight size={13} style={{ color: "#D1D5DB", flexShrink: 0 }}/>
                </button>
              ))}
            </div>
            {/* Sign Out */}
            <button onClick={() => startLogout(async () => { await logoutAction() })} disabled={logoutPending}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.04)", cursor: "pointer", textAlign: "left", width: "100%", marginTop: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(239,68,68,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {logoutPending ? <Loader2 size={15} style={{ color: "#DE1A1A", animation: "spin 1s linear infinite" }}/> : <LogOut size={15} style={{ color: "#DE1A1A" }}/>}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#DE1A1A", margin: "0 0 2px" }}>{logoutPending ? "Signing out…" : "Sign Out"}</p>
                <p style={{ fontSize: 10, color: "#9CA3AF", margin: 0 }}>End your current session</p>
              </div>
              <ChevronRight size={13} style={{ color: "#D1D5DB" }}/>
            </button>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* This Week */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#111111", margin: "0 0 16px" }}>This Week</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { Icon: Clock,       label: "Hours Worked",    value: stats.weekHours > 0 ? `${stats.weekHours}h` : "—", color: "#DE1A1A",   bg: "rgba(222,26,26,0.08)"   },
                { Icon: CheckCircle2,label: "Tasks Completed", value: stats.totalCompleted,                              color: "#22C55E",   bg: "rgba(34,197,94,0.08)"   },
                { Icon: AlertCircle, label: "Missed Updates",  value: stats.weekMissed,                                  color: stats.weekMissed > 0 ? "#F59E0B" : "#22C55E", bg: stats.weekMissed > 0 ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)" },
                { Icon: TrendingUp,  label: "Leave Requests",  value: stats.totalLeaves,                                 color: "#6366F1",   bg: "rgba(99,102,241,0.08)"  },
              ].map(({ Icon, label, value, color, bg }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} style={{ color }}/>
                  </div>
                  <p style={{ flex: 1, fontSize: 12, color: "#6B7280", margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 16, fontWeight: 900, color, margin: 0, fontFamily: "var(--font-jakarta)" }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Last 7 Days chart */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#111111", margin: "0 0 16px" }}>Last 7 Days</p>
            <WeekChart data={chartData}/>
          </div>

          {/* Recent Activity */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "#111111", margin: 0 }}>Recent Activity</p>
              <button style={{ fontSize: 11, fontWeight: 700, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer" }}>View All</button>
            </div>
            {recentUpdates.length === 0 ? (
              <p style={{ fontSize: 12, color: "#D1D5DB", textAlign: "center", padding: "12px 0", margin: 0 }}>No recent activity</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {recentUpdates.map((upd, i) => (
                  <div key={upd.date} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: DOT_COLORS[i % DOT_COLORS.length], marginTop: 4, flexShrink: 0 }}/>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: "#111111", margin: "0 0 2px" }}>{relativeDate(upd.date)}</p>
                      <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>
                        {upd.shoot_count && upd.shoot_count > 0
                          ? `Updated ${upd.shoot_count} shoot${upd.shoot_count !== 1 ? "s" : ""}`
                          : upd.working_hours != null
                            ? `${upd.working_hours}h worked`
                            : "Update submitted"}
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
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 10, border: `1.5px dashed ${url ? "#16A34A" : "#EBEDF2"}`, background: url ? "rgba(34,197,94,0.04)" : "#F8F9FC", fontSize: 11, fontWeight: 600, color: url ? "#16A34A" : "#6B7280", cursor: "pointer" }}>
        {loading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }}/> : url ? <CheckCircle2 size={12}/> : <Upload size={12}/>}
        {loading ? "Uploading…" : url ? "Uploaded ✓" : label}
      </button>
    </div>
  )
}
