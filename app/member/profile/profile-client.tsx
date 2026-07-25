"use client"

import { useState, useTransition, useRef, RefObject } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import {
  Mail, Phone, Briefcase, Calendar, Shield, Edit2, Check, X,
  Loader2, LogOut, KeyRound, Clock, Target, AlertCircle, TrendingUp,
  Zap, Camera, HeartPulse, MapPin, UserPlus, Landmark, CreditCard,
  FileText, Upload, CheckCircle2, AlertTriangle, ChevronDown,
  ChevronRight, Bell, Settings, Lock, User, Download,
} from "lucide-react"
import { updateOwnProfile } from "@/lib/actions/team"
import { updatePersonalDetails, updateKYC, deleteKYCDocument, type KYCDocField } from "@/lib/actions/profile"
import { logoutAction } from "@/lib/actions/auth"
import { todayIST, toISTDateString } from "@/lib/utils/ist-date"
import { createBrowserClient } from "@/lib/supabase/client"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { INDIAN_BANKS } from "@/lib/constants/banks"

interface ProfileData {
  id: string; name: string; employee_id: string; role: string
  email: string; phone: string; status: string; joined: string
  photo_url: string | null; passport_photo_url: string | null; position: string | null
  blood_group: string | null; address: string | null
  emergency_contact_name: string | null; emergency_contact_phone: string | null
}
interface KYCData {
  bank_name: string | null; bank_account: string | null; bank_ifsc: string | null
  aadhaar_number: string | null; pan_number: string | null
  govt_id_url: string | null; aadhaar_back_url: string | null
  pan_front_url: string | null; pan_back_url: string | null
  ration_card_url: string | null; ration_card_url2: string | null
  signature_url: string | null
}
interface Stats {
  weekHours: number; weekMissed: number
  totalCompleted: number; weekCompleted: number; weekLeaves: number; avgHoursPerDay: number
}
interface ChartDay { date: string; label: string; hours: number; isFuture: boolean }
interface RecentUpdate { date: string; working_hours: number | null; shoot_count: number | null }

const IS: React.CSSProperties = {
  background: "#F8F9FC", border: "1px solid #EBEDF2", color: "#111111",
  borderRadius: "12px", padding: "11px 14px", fontSize: "13px", outline: "none", width: "100%",
}
const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"]

const PRESET_AVATARS = [
  "05f8b5d9-ed48-4767-88c6-5bac8b8d9cc5.png",
  "0d9bd260-0cfe-49b8-8c37-5773d470e45f.png",
  "0e87e658-ed9f-4675-a92c-f2a041c25886.png",
  "209e5f6f-71bb-4806-81e9-008bf921aaae.png",
  "24cde950-ed9b-4bb2-b4cc-538f22fc7ec6.png",
  "5fb955e2-67a6-4a1f-a9d6-3ea664905322.png",
  "6eeead5b-d837-42fb-9280-8fbc3f789994.png",
  "80fa7552-bd09-43dc-b29b-4b9f4e669183.png",
  "88b5177b-3ec7-497c-9e05-7d51f7666137.png",
  "9dc55831-67ca-4ba1-a139-ae8ba097cb15.png",
  "a40250ec-2222-4931-ab8e-fcdb8fc2bfe2.png",
  "adf5c6b8-3103-4ddf-9226-4941cc6455d9.png",
  "bc2f72a9-bb25-4a12-9fcd-bcb642ec1dae.png",
  "c7e758a3-5814-46ee-93a5-92357b73954d.png",
  "cab3853a-1828-4082-bfea-12c933661ceb.png",
  "cade6005-91da-4c8f-98c6-d099fa6c52c1.png",
  "d31c649b-a6e9-4940-8230-417d829d60ed.png",
  "f7abb8d4-b9e1-45b6-a849-b1911437db5f.png",
].map(f => `/brand/profiles/${f}`)

function relativeDate(d: string) {
  const t = todayIST()
  if (d === t) return "Today"
  if (d === toISTDateString(Date.now() - 86400000)) return "Yesterday"
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
    { label: "Ration card",        done: !!(k?.ration_card_url || k?.ration_card_url2) },
  ]
  return { score: Math.round((items.filter(i => i.done).length / items.length) * 100), items }
}

// ── Week Bar Chart ──────────────────────────────────────────────────────────
function WeekChart({ data }: { data: ChartDay[] }) {
  const maxH  = Math.max(...data.map(d => d.hours), 1)
  const today = todayIST()
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
  profile, kyc, stats, chartData, recentUpdates, authEmail, payslipHistory,
}: {
  profile: ProfileData | null; kyc: KYCData | null; stats: Stats
  chartData: ChartDay[]; recentUpdates: RecentUpdate[]; authEmail: string
  payslipHistory: { month: string; is_paid: boolean; paid_at: string | null }[]
}) {
  const router = useRouter()
  const confirm = useConfirm()

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
    ration_card_url2: kyc?.ration_card_url2 ?? "", signature_url: kyc?.signature_url ?? "",
  })
  const [kycPending, startKYC]      = useTransition()
  const [kycError, setKYCError]     = useState<string | null>(null)
  const [kycSuccess, setKycSuccess] = useState(false)
  const [uploadingField, setUploadingField] = useState<string | null>(null)

  const photoRef    = useRef<HTMLInputElement>(null)
  const profPhotoRef = useRef<HTMLInputElement>(null)
  const docRefs: Record<KYCDocField, RefObject<HTMLInputElement | null>> = {
    govt_id_url:      useRef<HTMLInputElement>(null),
    aadhaar_back_url: useRef<HTMLInputElement>(null),
    pan_front_url:    useRef<HTMLInputElement>(null),
    pan_back_url:     useRef<HTMLInputElement>(null),
    ration_card_url:  useRef<HTMLInputElement>(null),
    ration_card_url2: useRef<HTMLInputElement>(null),
    signature_url:    useRef<HTMLInputElement>(null),
  }
  const [photoBusy, setPhotoBusy]         = useState(false)
  const [photoError, setPhotoError]       = useState<string | null>(null)
  const [profPhotoBusy, setProfPhotoBusy] = useState(false)
  const [profPhotoError, setProfPhotoError] = useState<string | null>(null)
  const [profPhotoUrl, setProfPhotoUrl]   = useState<string | null>(profile?.passport_photo_url ?? null)
  const [showPicker, setShowPicker] = useState(false)
  const [logoutPending, startLogout] = useTransition()

  const [showPwdModal, setShowPwdModal]   = useState(false)
  const [pwdNew, setPwdNew]               = useState("")
  const [pwdConfirm, setPwdConfirm]       = useState("")
  const [pwdError, setPwdError]           = useState<string | null>(null)
  const [pwdSuccess, setPwdSuccess]       = useState(false)
  const [pwdPending, startPwd]            = useTransition()
  const [showComingSoon, setShowComingSoon] = useState<string | null>(null)


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
      const res = await updateKYC({
        bank_name: kycForm.bank_name||null, bank_account: kycForm.bank_account||null,
        bank_ifsc: kycForm.bank_ifsc||null, aadhaar_number: kycForm.aadhaar_number||null,
        pan_number: kycForm.pan_number||null, govt_id_url: kycForm.govt_id_url||null,
        aadhaar_back_url: kycForm.aadhaar_back_url||null, pan_front_url: kycForm.pan_front_url||null,
        pan_back_url: kycForm.pan_back_url||null, ration_card_url: kycForm.ration_card_url||null,
        ration_card_url2: kycForm.ration_card_url2||null, signature_url: kycForm.signature_url||null,
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
  async function handleProfPhotoUpload(file: File) {
    setProfPhotoBusy(true); setProfPhotoError(null)
    try {
      if (file.size > 4 * 1024 * 1024) { setProfPhotoError("File too large (max 4MB)"); return }
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "passport-photos")
      const res = await fetch("/api/upload-photo", { method: "POST", body: fd })
      if (!res.ok) { setProfPhotoError("Upload failed — try a smaller image"); return }
      const { url } = await res.json()
      if (!url) { setProfPhotoError("Upload failed"); return }
      await updatePersonalDetails({ passport_photo_url: url })
      setProfPhotoUrl(url)
      router.refresh()
    } catch { setProfPhotoError("Upload failed") } finally { setProfPhotoBusy(false) }
  }

  async function handlePresetPick(url: string) {
    setShowPicker(false); setPhotoBusy(true); setPhotoError(null)
    try {
      await updatePersonalDetails({ photo_url: url }); router.refresh()
    } catch { setPhotoError("Failed to save photo") } finally { setPhotoBusy(false) }
  }
  function handleChangePassword() {
    setPwdError(null)
    if (pwdNew.length < 6) { setPwdError("Password must be at least 6 characters"); return }
    if (pwdNew !== pwdConfirm) { setPwdError("Passwords do not match"); return }
    startPwd(async () => {
      const supabase = createBrowserClient()
      const { error } = await supabase.auth.updateUser({ password: pwdNew })
      if (error) { setPwdError(error.message); return }
      setPwdSuccess(true)
      setTimeout(() => { setShowPwdModal(false); setPwdNew(""); setPwdConfirm(""); setPwdSuccess(false) }, 1800)
    })
  }

  async function handleDocUpload(
    field: KYCDocField,
    file: File
  ) {
    setUploadingField(field)
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "kyc")
      const res = await fetch("/api/upload-photo", { method: "POST", body: fd })
      const json = await res.json()
      if (res.ok && json.url) { setKYCForm(p => ({ ...p, [field]: json.url })); return json.url as string }
      return null
    } finally { setUploadingField(null) }
  }

  async function handleDocReplace(
    field: KYCDocField,
    file: File
  ) {
    const url = await handleDocUpload(field, file)
    if (url) await updateKYC({ [field]: url })
    router.refresh()
  }

  const circ = 2 * Math.PI * 42
  const arc  = (score / 100) * circ

  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh", padding: "16px 16px 48px" }} className="md:!p-[24px_28px_48px]">
      <style>{`.pf-in::placeholder{color:rgba(0,0,0,0.25);}.pf-in:focus{border-color:rgba(222,26,26,0.5)!important;box-shadow:0 0 0 3px rgba(222,26,26,0.08)!important;}`}</style>

      {/* ── HERO BANNER ─────────────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius: 20, marginBottom: 20, position: "relative", overflow: "hidden", padding: "22px 24px", boxShadow: "0 8px 32px rgba(180,0,0,0.4)" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }}/>
        <div style={{ position: "absolute", bottom: -30, left: 60, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }}/>
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "rgba(255,255,255,0.15)", color: "#fff", marginBottom: 10, border: "1px solid rgba(255,255,255,0.2)", letterSpacing: "0.04em" }}>
              ⭐ My Profile
            </span>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 4px", fontFamily: "var(--font-jakarta)", color: "#fff" }}>
              Manage Your Identity
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0 }}>Documents, account settings, and personal details.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px 6px 6px", borderRadius: 99, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#DE1A1A" }}>
              {profile?.photo_url
                ? <img src={profile.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : initials}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{displayName.split(" ")[0]}</span>
          </div>
        </div>
      </div>

      {/* ── MAIN GRID ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-[18px] items-start">

        {/* ── LEFT COLUMN ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* COMPLETION BANNER */}
          <div style={{ background: "linear-gradient(135deg, #DE1A1A 0%, #C01010 50%, #9B1212 100%)", borderRadius: 20, overflow: "hidden", position: "relative", padding: "28px 32px", minHeight: 160, boxShadow: "0 8px 32px rgba(180,0,0,0.4)" }}>
            {/* Decorative circles */}
            <div style={{ position: "absolute", top: -40, right: 100, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }}/>
            <div style={{ position: "absolute", bottom: -30, right: -20, width: 140, height: 140, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }}/>
            <div style={{ position: "absolute", top: -20, left: 200, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }}/>

            {/* Boy illustration — blends into red; narrower on mobile so it can't collide with the text column below */}
            <div className="w-[30%] sm:w-[36%] md:w-1/2" style={{ position: "absolute", right: 0, top: 0, bottom: 0, zIndex: 2 }}>
              <Image src="/brand/profile-boy.png" fill
                style={{ objectFit: "contain", objectPosition: "right bottom" }} alt="" priority/>
              {/* Red fade on left edge so illustration blends seamlessly */}
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "50%", background: "linear-gradient(to right, #C01010, transparent)", pointerEvents: "none" }}/>
            </div>

            {/* Completion content — max-width kept a few points narrower than the illustration's reserved space at every breakpoint so text can never run under the character.
                Ring + gap also shrink on mobile: at the fixed 100px/28px sizing, the ring+gap alone ate ~65% of the already-narrow mobile
                text budget, squeezing the "Missing: …" pills into a sliver that overflowed into the illustration. */}
            <div className="max-w-[68%] sm:max-w-[62%] md:max-w-[48%] gap-3 sm:gap-5 md:gap-7" style={{ display: "flex", alignItems: "center", position: "relative", zIndex: 3, minWidth: 0 }}>
              {/* Ring */}
              <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-[100px] md:h-[100px]" style={{ position: "relative", flexShrink: 0 }}>
                <svg className="w-full h-full" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={50} cy={50} r={42} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={9}/>
                  <circle cx={50} cy={50} r={42} fill="none" stroke="#FACC15" strokeWidth={9}
                    strokeLinecap="round" strokeDasharray={`${arc} ${circ - arc}`}/>
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="text-[13px] sm:text-[16px] md:text-[21px]" style={{ fontWeight: 900, color: "#FACC15", fontFamily: "var(--font-jakarta)" }}>{score}%</span>
                </div>
              </div>
              {/* Text */}
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
                  Profile <span style={{ color: "#FACC15" }}>{score}%</span> complete
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
                <button onClick={() => setShowPicker(true)} disabled={photoBusy}
                  style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", width: 26, height: 26, borderRadius: "50%", background: "#fff", border: "2px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                  {photoBusy ? <Loader2 size={11} style={{ color: "#6B7280", animation: "spin 1s linear infinite" }}/> : <Camera size={11} style={{ color: "#6B7280" }}/>}
                </button>
                <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setShowPicker(false); handlePhotoUpload(f) } }}/>
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
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111111", margin: "0 0 8px", fontFamily: "var(--font-jakarta)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</h2>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">

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
                    { title: "Ration Card",  fields: [{ f: "ration_card_url" as const, l: "Front Side" }, { f: "ration_card_url2" as const, l: "Back Side" }] },
                    { title: "Signature",    fields: [{ f: "signature_url" as const, l: "Signature" }] },
                  ]).map((sec, si) => (
                    <div key={sec.title}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: "0 0 7px" }}>{sec.title} <span style={{ fontSize: 9, color: si === 2 || si === 3 ? "#6B7280" : "#DE1A1A" }}>{si === 2 || si === 3 ? "(optional)" : "*both required"}</span></p>
                      <div style={{ display: "grid", gridTemplateColumns: si === 3 ? "1fr" : "1fr 1fr", gap: 7 }}>
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
                  {/* KYC document actions */}
                  <div style={{ marginTop: 12 }}>
                    {([
                      { f: "govt_id_url" as KYCDocField,      l: "Aadhaar Front" },
                      { f: "aadhaar_back_url" as KYCDocField, l: "Aadhaar Back" },
                      { f: "pan_front_url" as KYCDocField,    l: "PAN Front" },
                      { f: "pan_back_url" as KYCDocField,     l: "PAN Back" },
                      { f: "ration_card_url" as KYCDocField,  l: "Ration Card – Front Side" },
                      { f: "ration_card_url2" as KYCDocField, l: "Ration Card – Back Side" },
                      { f: "signature_url" as KYCDocField,    l: "Signature" },
                    ]).map(({ f, l }) => {
                      const url = (kyc as unknown as Record<string, unknown>)?.[f] as string | null
                      return (
                        <div key={f} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #F3F4F6" }}>
                          <span style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{l}</span>
                          {url ? (
                            <div style={{ display: "flex", gap: 6 }}>
                              <a href={url} target="_blank" rel="noreferrer"
                                style={{ fontSize: 11, fontWeight: 700, color: "#3B82F6", padding: "4px 10px", borderRadius: 8, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", textDecoration: "none" }}>
                                View
                              </a>
                              <button type="button" disabled={uploadingField === f} onClick={() => docRefs[f].current?.click()}
                                style={{ fontSize: 11, fontWeight: 700, color: "#F59E0B", padding: "4px 10px", borderRadius: 8, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", cursor: uploadingField === f ? "default" : "pointer", opacity: uploadingField === f ? 0.6 : 1 }}>
                                {uploadingField === f ? "Uploading…" : "Replace"}
                              </button>
                              <button type="button" disabled={uploadingField === f} onClick={async () => {
                                if (!(await confirm(`Delete ${l}?`))) return
                                const res = await deleteKYCDocument(f)
                                if (res.success) router.refresh()
                              }}
                                style={{ fontSize: 11, fontWeight: 700, color: "#EF4444", padding: "4px 10px", borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", cursor: "pointer" }}>
                                Delete
                              </button>
                              <input ref={docRefs[f]} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
                                onChange={async e => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  await handleDocReplace(f, file)
                                  e.target.value = ""
                                }} />
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: "#D1D5DB" }}>Not uploaded</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { Icon: Lock,   title: "Change Password",       desc: "Update your password",    action: () => { setPwdError(null); setPwdNew(""); setPwdConfirm(""); setPwdSuccess(false); setShowPwdModal(true) } },
                { Icon: Bell,   title: "Notification Settings", desc: "Manage alerts & updates",  action: () => setShowComingSoon("Notification Settings") },
                { Icon: Shield, title: "Privacy Settings",      desc: "Control your data",        action: () => setShowComingSoon("Privacy Settings") },
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
                { Icon: CheckCircle2,label: "Tasks Completed", value: stats.weekCompleted,                               color: "#22C55E",   bg: "rgba(34,197,94,0.08)"   },
                { Icon: AlertCircle, label: "Missed Updates",  value: stats.weekMissed,                                  color: stats.weekMissed > 0 ? "#F59E0B" : "#22C55E", bg: stats.weekMissed > 0 ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)" },
                { Icon: TrendingUp,  label: "Leave Requests",  value: stats.weekLeaves,                                  color: "#6366F1",   bg: "rgba(99,102,241,0.08)"  },
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

          {/* My Payslip */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Download size={15} style={{ color: "#DE1A1A" }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 800, color: "#111111", margin: 0 }}>My Payslip</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Download your salary slip</p>
              </div>
            </div>

            {/* Professional photo upload */}
            <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 12, background: "#F8F9FC", border: "1px solid #EBEDF2" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#374151", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Professional Photo <span style={{ color: "#9CA3AF", fontWeight: 500, textTransform: "none" }}>— appears in payslip</span>
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid #E5E7EB", background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {profPhotoUrl
                    ? <img src={profPhotoUrl} alt="Professional" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <Camera size={18} style={{ color: "#D1D5DB" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input ref={profPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleProfPhotoUpload(f); e.target.value = "" }} />
                  <button
                    onClick={() => profPhotoRef.current?.click()}
                    disabled={profPhotoBusy}
                    style={{ width: "100%", padding: "8px", borderRadius: 10, border: "1.5px dashed #D1D5DB", background: "#fff", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    {profPhotoBusy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} style={{ color: "#DE1A1A" }} />}
                    {profPhotoBusy ? "Uploading…" : profPhotoUrl ? "Change Photo" : "Upload Photo"}
                  </button>
                  {profPhotoError && <p style={{ fontSize: 11, color: "#DC2626", margin: "4px 0 0" }}>{profPhotoError}</p>}
                  {profPhotoUrl && !profPhotoError && <p style={{ fontSize: 11, color: "#16A34A", margin: "4px 0 0" }}>✓ Photo saved</p>}
                </div>
              </div>
            </div>
            {payslipHistory.length === 0 ? (
              <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", padding: "12px 0", margin: 0 }}>
                No payslips yet. Your admin will process your first payslip at month end.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {payslipHistory.map((p) => {
                  const label = new Date(p.month + '-01').toLocaleDateString('en-IN', {
                    month: 'long', year: 'numeric',
                  })
                  const paidLabel = p.paid_at
                    ? new Date(p.paid_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                    : null
                  return (
                    <div key={p.month} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "#F8F9FC", border: "1px solid #EBEDF2" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#111111", margin: "0 0 2px" }}>{label}</p>
                        {p.is_paid
                          ? <p style={{ fontSize: 11, color: "#16A34A", margin: 0 }}>Paid{paidLabel ? ` · ${paidLabel}` : ''}</p>
                          : <p style={{ fontSize: 11, color: "#D97706", margin: 0 }}>Pending</p>
                        }
                      </div>
                      <a
                        href={profile ? `/api/payslip?userId=${profile.id}&month=${p.month}` : "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: 12, fontWeight: 700, color: "#DE1A1A",
                          textDecoration: "none", padding: "6px 12px",
                          borderRadius: 8, background: "rgba(222,26,26,0.08)",
                          whiteSpace: "nowrap", flexShrink: 0,
                          pointerEvents: profile ? "auto" : "none",
                        }}>
                        View →
                      </a>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: "#111111", margin: 0 }}>Recent Activity</p>
              <button onClick={() => router.push("/member/history")} style={{ fontSize: 11, fontWeight: 700, color: "#DE1A1A", background: "none", border: "none", cursor: "pointer" }}>View All</button>
            </div>
            {recentUpdates.length === 0 ? (
              <p style={{ fontSize: 12, color: "#D1D5DB", textAlign: "center", padding: "12px 0", margin: 0 }}>No recent activity</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {recentUpdates.map((upd, i) => (
                  <div key={upd.date} onClick={() => router.push(`/member/history?date=${upd.date}`)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
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

      {/* ── Profile Photo Picker Modal ─────────────────────────────────────── */}
      {showPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowPicker(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
          <div style={{ position: "relative", background: "#fff", borderRadius: 24, padding: 24, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <p style={{ fontSize: 17, fontWeight: 900, color: "#111111", margin: 0 }}>Choose Profile Photo</p>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: "3px 0 0" }}>Select from our collection or upload your own</p>
              </div>
              <button onClick={() => setShowPicker(false)} style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F6FA", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={14} style={{ color: "#6B7280" }} />
              </button>
            </div>

            {/* Grid of preset avatars */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
              {PRESET_AVATARS.map(url => (
                <button key={url} onClick={() => handlePresetPick(url)}
                  style={{ padding: 0, border: profile?.photo_url === url ? "3px solid #DE1A1A" : "3px solid transparent", borderRadius: "50%", cursor: "pointer", background: "none", aspectRatio: "1", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", transition: "transform 0.1s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.08)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}>
                  <img src={url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>

            {/* Upload own photo */}
            <div style={{ borderTop: "1px solid #EBEDF2", paddingTop: 14 }}>
              <button onClick={() => photoRef.current?.click()}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", borderRadius: 12, background: "#F8F9FC", border: "2px dashed #D1D5DB", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#6B7280" }}>
                <Upload size={14} /> Upload your own photo
              </button>
            </div>

            {photoError && <p style={{ fontSize: 11, color: "#DE1A1A", marginTop: 10, textAlign: "center" }}>{photoError}</p>}
          </div>
        </div>
      )}

      {/* ── Change Password Modal ──────────────────────────────────────────── */}
      {showPwdModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowPwdModal(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
          <div style={{ position: "relative", background: "#fff", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Lock size={17} style={{ color: "#DE1A1A" }} />
                </div>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 900, color: "#111", margin: 0 }}>Change Password</p>
                  <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Set a new password for your account</p>
                </div>
              </div>
              <button onClick={() => setShowPwdModal(false)} style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F6FA", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={14} style={{ color: "#6B7280" }} />
              </button>
            </div>

            {pwdSuccess ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(22,163,74,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <Check size={26} style={{ color: "#16A34A" }} />
                </div>
                <p style={{ fontSize: 15, fontWeight: 800, color: "#111", margin: "0 0 4px" }}>Password Updated!</p>
                <p style={{ fontSize: 12, color: "#9CA3AF", margin: 0 }}>Your password has been changed successfully.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>New Password</label>
                  <input type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)}
                    placeholder="Min. 6 characters"
                    style={{ ...IS, borderColor: pwdError && pwdNew.length < 6 ? "#DE1A1A" : "#EBEDF2" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Confirm New Password</label>
                  <input type="password" value={pwdConfirm} onChange={e => setPwdConfirm(e.target.value)}
                    placeholder="Re-enter new password"
                    style={{ ...IS, borderColor: pwdError && pwdNew !== pwdConfirm ? "#DE1A1A" : "#EBEDF2" }} />
                </div>
                {pwdError && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10, background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.15)" }}>
                    <AlertCircle size={13} style={{ color: "#DE1A1A", flexShrink: 0 }} />
                    <p style={{ fontSize: 12, color: "#DE1A1A", margin: 0 }}>{pwdError}</p>
                  </div>
                )}
                <button onClick={handleChangePassword} disabled={pwdPending}
                  style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: pwdPending ? "not-allowed" : "pointer", background: "linear-gradient(135deg,#DE1A1A,#7F1D1D)", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, opacity: pwdPending ? 0.7 : 1 }}>
                  {pwdPending ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Updating…</> : "Update Password"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Quick Actions ───────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)", marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Zap size={16} style={{ color: "#374151" }}/>
          <span style={{ fontSize: 14, fontWeight: 800, color: "#111111" }}>Quick Actions</span>
        </div>
        <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 16px" }}>Jump to the things you do every day</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([
            { icon: "📝", title: "Submit Update",  desc: "Log today's work",       href: "/member/update",        accent: "#DE1A1A", bg: "rgba(222,26,26,0.06)",  border: "rgba(222,26,26,0.15)" },
            { icon: "✅", title: "My Tasks",        desc: "View assigned tasks",    href: "/member/tasks",         accent: "#6366F1", bg: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.15)" },
            { icon: "🏖️", title: "Apply Leave",    desc: "Request time off",       href: "/member/leaves",        accent: "#F59E0B", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
            { icon: "📢", title: "Announcements",  desc: "Company updates",         href: "/member/announcements", accent: "#22C55E", bg: "rgba(34,197,94,0.06)",  border: "rgba(34,197,94,0.15)" },
          ] as const).map(({ icon, title, desc, href, accent, bg, border }) => (
            <button key={title} onClick={() => router.push(href)}
              style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: "16px", borderRadius: 16, border: `1.5px solid ${border}`, background: bg, cursor: "pointer", textAlign: "left", transition: "transform 0.1s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)" }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(0)" }}>
              <span style={{ fontSize: 26, lineHeight: 1 }}>{icon}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: accent, margin: "0 0 3px", fontFamily: "var(--font-jakarta)" }}>{title}</p>
                <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Coming Soon Modal ──────────────────────────────────────────────── */}
      {showComingSoon && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowComingSoon(null)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
          <div style={{ position: "relative", background: "#fff", borderRadius: 24, padding: 32, width: "100%", maxWidth: 340, boxShadow: "0 24px 64px rgba(0,0,0,0.18)", textAlign: "center" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(222,26,26,0.08)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              {showComingSoon === "Notification Settings" ? <Bell size={24} style={{ color: "#DE1A1A" }} /> : <Shield size={24} style={{ color: "#DE1A1A" }} />}
            </div>
            <p style={{ fontSize: 16, fontWeight: 900, color: "#111", margin: "0 0 6px" }}>{showComingSoon}</p>
            <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 22px", lineHeight: 1.6 }}>This feature is coming soon.<br/>We're working on it!</p>
            <button onClick={() => setShowComingSoon(null)}
              style={{ padding: "10px 28px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#DE1A1A,#7F1D1D)", color: "#fff", fontSize: 13, fontWeight: 700 }}>
              Got it
            </button>
          </div>
        </div>
      )}
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
