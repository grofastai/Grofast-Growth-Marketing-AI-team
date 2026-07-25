"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Edit2, Check, X, Loader2, LogOut, Camera, HeartPulse, MapPin, UserPlus,
  Landmark, CreditCard, FileText, Upload, CheckCircle2, ChevronRight,
  Bell, Settings, Lock, FolderOpen, User, Users, Clock, Shield, AlertTriangle,
} from "lucide-react"
import { updateOwnProfile } from "@/lib/actions/team"
import { updatePersonalDetails, updateKYC } from "@/lib/actions/profile"
import { logoutAction } from "@/lib/actions/auth"
import { INDIAN_BANKS } from "@/lib/constants/banks"

interface ProfileData {
  id: string; name: string; employee_id: string; role: string
  email: string; phone: string; status: string; joined: string
  photo_url: string | null; position: string | null; team: string | null
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

const IS: React.CSSProperties = {
  background: "#F8F9FC", border: "1px solid #EBEDF2", color: "#111111",
  borderRadius: "12px", padding: "11px 14px", fontSize: "13px", outline: "none", width: "100%",
}
const BLOOD_GROUPS = ["A+", "A−", "B+", "B−", "AB+", "AB−", "O+", "O−"]
const PRESET_AVATARS = [
  "05f8b5d9-ed48-4767-88c6-5bac8b8d9cc5.png", "0d9bd260-0cfe-49b8-8c37-5773d470e45f.png",
  "0e87e658-ed9f-4675-a92c-f2a041c25886.png", "209e5f6f-71bb-4806-81e9-008bf921aaae.png",
  "24cde950-ed9b-4bb2-b4cc-538f22fc7ec6.png", "5fb955e2-67a6-4a1f-a9d6-3ea664905322.png",
  "6eeead5b-d837-42fb-9280-8fbc3f789994.png", "80fa7552-bd09-43dc-b29b-4b9f4e669183.png",
  "88b5177b-3ec7-497c-9e05-7d51f7666137.png", "9dc55831-67ca-4ba1-a139-ae8ba097cb15.png",
  "a40250ec-2222-4931-ab8e-fcdb8fc2bfe2.png", "adf5c6b8-3103-4ddf-9226-4941cc6455d9.png",
  "bc2f72a9-bb25-4a12-9fcd-bcb642ec1dae.png", "c7e758a3-5814-46ee-93a5-92357b73954d.png",
  "cab3853a-1828-4082-bfea-12c933661ceb.png", "cade6005-91da-4c8f-98c6-d099fa6c52c1.png",
  "d31c649b-a6e9-4940-8230-417d829d60ed.png", "f7abb8d4-b9e1-45b6-a849-b1911437db5f.png",
].map(f => `/brand/profiles/${f}`)

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
  ]
  return { score: Math.round((items.filter(i => i.done).length / items.length) * 100), items }
}

function DocUploadButton({ label, url, loading, onFile }: {
  label: string; url: string; loading: boolean; onFile: (f: File) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <input ref={ref} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      <button onClick={() => ref.current?.click()} disabled={loading}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px", borderRadius: 10, border: `1.5px dashed ${url ? "#16A34A" : "#EBEDF2"}`, background: url ? "rgba(34,197,94,0.04)" : "#F8F9FC", fontSize: 11, fontWeight: 600, color: url ? "#16A34A" : "#1B4332", cursor: "pointer" }}>
        {loading ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : url ? <CheckCircle2 size={12} /> : <Upload size={12} />}
        {loading ? "Uploading…" : url ? "Uploaded ✓" : label}
      </button>
    </div>
  )
}

export default function AdminProfileClient({
  profile, kyc, stats, authEmail,
}: {
  profile: ProfileData | null
  kyc: KYCData | null
  stats: { teamCount: number; pendingLeaves: number }
  authEmail: string
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

  const [editKYC, setEditKYC] = useState(false)
  const [kycForm, setKYCForm] = useState({
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

  const [showPicker, setShowPicker] = useState(false)
  const [photoBusy, setPhotoBusy]   = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)
  const [logoutPending, startLogout] = useTransition()

  const displayName = profile?.name ?? authEmail.split("@")[0]
  const initials    = displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)

  const { score, items: completionItems } = completionScore(profile, kyc ?? kycForm as KYCData)
  const missing = completionItems.filter(i => !i.done)
  const circ = 2 * Math.PI * 42
  const arc  = (score / 100) * circ

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
  async function handlePresetPick(url: string) {
    setShowPicker(false); setPhotoBusy(true); setPhotoError(null)
    try { await updatePersonalDetails({ photo_url: url }); router.refresh() }
    catch { setPhotoError("Failed to save photo") } finally { setPhotoBusy(false) }
  }
  async function handleDocUpload(
    field: "govt_id_url" | "aadhaar_back_url" | "pan_front_url" | "pan_back_url" | "ration_card_url" | "ration_card_url2",
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

  return (
    <div style={{ background: "#F8F9FC", minHeight: "100vh", padding: "16px 16px 48px" }} className="md:!p-[24px_28px_48px]">
      <style>{`.ap-in::placeholder{color:rgba(0,0,0,0.25);}.ap-in:focus{border-color:rgba(222,26,26,0.5)!important;box-shadow:0 0 0 3px rgba(222,26,26,0.08)!important;}`}</style>

      {/* Hero Banner */}
      <div style={{ background: "linear-gradient(135deg,#DE1A1A 0%,#8B1212 55%,#1A0808 100%)", borderRadius: 20, marginBottom: 20, position: "relative", overflow: "hidden", padding: "22px 24px", boxShadow: "0 8px 32px rgba(180,0,0,0.4)" }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 220, height: 220, borderRadius: "50%", background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "rgba(255,255,255,0.15)", color: "#fff", marginBottom: 10, border: "1px solid rgba(255,255,255,0.2)", letterSpacing: "0.04em" }}>
              ⚙️ Admin Profile
            </span>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: "0 0 4px", fontFamily: "var(--font-jakarta)", color: "#fff" }}>
              Manage Your Profile
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", margin: 0 }}>Update your personal details, bank info, and account settings.</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-[18px] items-start">

        {/* LEFT COLUMN */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Completion Banner */}
          <div style={{ background: "linear-gradient(135deg,#DE1A1A 0%,#C01010 50%,#9B1212 100%)", borderRadius: 20, padding: "24px 28px", boxShadow: "0 8px 32px rgba(180,0,0,0.4)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -40, right: 100, width: 180, height: 180, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 24, position: "relative", zIndex: 1 }}>
              <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
                <svg width={90} height={90} viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={50} cy={50} r={42} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={9} />
                  <circle cx={50} cy={50} r={42} fill="none" stroke="#FACC15" strokeWidth={9}
                    strokeLinecap="round" strokeDasharray={`${arc} ${circ - arc}`} />
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 19, fontWeight: 900, color: "#FACC15", fontFamily: "var(--font-jakarta)" }}>{score}%</span>
                </div>
              </div>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 6px" }}>
                  Profile <span style={{ color: "#FACC15" }}>{score}%</span> complete
                </h2>
                {missing.length > 0 ? (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {missing.slice(0, 4).map(i => (
                      <span key={i.label} style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.1)" }}>
                        Missing: {i.label}
                      </span>
                    ))}
                    {missing.length > 4 && <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.65)" }}>+{missing.length - 4} more</span>}
                  </div>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#22C55E", padding: "4px 12px", borderRadius: 99, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <CheckCircle2 size={11} /> All details filled in
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Profile Identity */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "22px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 18, marginBottom: 20 }}>
              {/* Avatar */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 78, height: 78, borderRadius: "50%", background: "#DE1A1A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 900, color: "#fff", overflow: "hidden" }}>
                  {profile?.photo_url
                    ? <img src={profile.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : initials}
                </div>
                <button onClick={() => setShowPicker(true)} disabled={photoBusy}
                  style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", width: 26, height: 26, borderRadius: "50%", background: "#fff", border: "2px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                  {photoBusy ? <Loader2 size={11} style={{ color: "#1B4332", animation: "spin 1s linear infinite" }} /> : <Camera size={11} style={{ color: "#1B4332" }} />}
                </button>
                <input ref={photoRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) { setShowPicker(false); handlePhotoUpload(f) } }} />
              </div>

              {/* Name + Edit */}
              <div style={{ flex: 1 }}>
                {editing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input className="ap-in" style={{ ...IS, fontSize: "15px", fontWeight: "700" }} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name" />
                    <input className="ap-in" style={IS} value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone number" />
                    {editError && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px" }}>
                        <AlertTriangle size={12} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626", lineHeight: 1.4 }}>{editError}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={handleSave} disabled={savePending}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 10, background: "#DE1A1A", border: "none", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                        {savePending ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={11} />} Save
                      </button>
                      <button onClick={() => { setEditing(false); setEditName(profile?.name ?? ""); setEditPhone(profile?.phone ?? "") }}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderRadius: 10, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 700, color: "#1B4332", cursor: "pointer" }}>
                        <X size={11} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <div>
                      <h2 style={{ fontSize: 22, fontWeight: 900, color: "#111111", margin: "0 0 8px", fontFamily: "var(--font-jakarta)" }}>{displayName}</h2>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 99, background: "rgba(222,26,26,0.1)", color: "#DE1A1A", border: "1px solid rgba(222,26,26,0.18)", letterSpacing: "0.04em" }}>
                          {profile?.role ?? "ADMIN"}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "#F5F6FA", color: "#1B4332", border: "1px solid #EBEDF2" }}>
                          #{profile?.employee_id ?? "—"}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#16A34A", display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#16A34A", display: "inline-block" }} /> Active
                        </span>
                      </div>
                    </div>
                    <button onClick={() => setEditing(true)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, background: "none", border: "1.5px solid rgba(222,26,26,0.3)", fontSize: 12, fontWeight: 700, color: "#DE1A1A", cursor: "pointer", flexShrink: 0 }}>
                      <Edit2 size={12} /> Edit Profile
                    </button>
                  </div>
                )}
                {photoError && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginTop: 4 }}>
                    <AlertTriangle size={12} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626", lineHeight: 1.4 }}>{photoError}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Info rows */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "Email",    value: profile?.email ?? authEmail },
                { label: "Phone",    value: profile?.phone || "—" },
                { label: "Position", value: profile?.position || profile?.team || "Administrator" },
                { label: "Joined",   value: profile?.joined ?? "—" },
              ].map(r => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderRadius: 12, background: "#F9FAFB", border: "1px solid #EBEDF2" }}>
                  <span style={{ fontSize: 11, color: "#1B4332", fontWeight: 600 }}>{r.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#111111" }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Personal Details + KYC */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">

            {/* Personal Details */}
            <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <User size={16} style={{ color: "#1B4332" }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#111111" }}>Personal Details</span>
                </div>
                {!editPersonal && (
                  <button onClick={() => setEditPersonal(true)}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, background: "none", border: "1px solid rgba(222,26,26,0.25)", fontSize: 11, fontWeight: 700, color: "#DE1A1A", cursor: "pointer" }}>
                    <Edit2 size={10} /> Edit
                  </button>
                )}
              </div>

              {editPersonal ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1B4332", display: "block", marginBottom: 7 }}>Blood Group</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {BLOOD_GROUPS.map(bg => (
                        <button key={bg} onClick={() => setPersonal(p => ({ ...p, blood_group: bg }))}
                          style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none", background: personal.blood_group === bg ? "#DE1A1A" : "#F5F6FA", color: personal.blood_group === bg ? "#fff" : "#1B4332" }}>
                          {bg}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#1B4332", display: "block", marginBottom: 5 }}>Address</label>
                    <textarea value={personal.address} onChange={e => setPersonal(p => ({ ...p, address: e.target.value }))} rows={2} className="ap-in" style={{ ...IS, resize: "none" }} placeholder="Full address…" />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1B4332", display: "block", marginBottom: 5 }}>Emergency Name</label>
                      <input value={personal.emergency_contact_name} onChange={e => setPersonal(p => ({ ...p, emergency_contact_name: e.target.value }))} className="ap-in" style={IS} placeholder="Name" />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1B4332", display: "block", marginBottom: 5 }}>Emergency Phone</label>
                      <input value={personal.emergency_contact_phone} onChange={e => setPersonal(p => ({ ...p, emergency_contact_phone: e.target.value }))} className="ap-in" style={IS} placeholder="Phone" />
                    </div>
                  </div>
                  {personalError && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px" }}>
                      <AlertTriangle size={12} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626", lineHeight: 1.4 }}>{personalError}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handlePersonalSave} disabled={personalPending}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 18px", borderRadius: 10, background: "linear-gradient(135deg,#DE1A1A,#7F1D1D)", border: "none", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                      {personalPending ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={11} />} Save
                    </button>
                    <button onClick={() => setEditPersonal(false)}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 10, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 700, color: "#1B4332", cursor: "pointer" }}>
                      <X size={11} /> Cancel
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
                        <Icon size={13} style={{ color: value === "—" ? "#1B4332" : "#1B4332" }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1B4332", margin: "0 0 3px", fontWeight: 600 }}>{label}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: value === "—" ? "#1B4332" : "#111111", margin: 0, lineHeight: 1.5 }}>{value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* KYC & Bank */}
            <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Landmark size={16} style={{ color: "#1B4332" }} />
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#111111" }}>KYC &amp; Bank Details</span>
                </div>
                {!editKYC && (
                  <button onClick={() => { setEditKYC(true); setKycSuccess(false) }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, background: "none", border: "1px solid rgba(222,26,26,0.25)", fontSize: 11, fontWeight: 700, color: "#DE1A1A", cursor: "pointer" }}>
                    <Edit2 size={10} /> Edit
                  </button>
                )}
              </div>

              {kycSuccess && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.2)", marginBottom: 12 }}>
                  <CheckCircle2 size={13} style={{ color: "#16A34A" }} /><p style={{ fontSize: 11, fontWeight: 600, color: "#16A34A", margin: 0 }}>KYC saved successfully</p>
                </div>
              )}

              {editKYC ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#1B4332", margin: "0 0 8px" }}>Bank Account</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      <select value={kycForm.bank_name} onChange={e => setKYCForm(p => ({ ...p, bank_name: e.target.value }))} className="ap-in" style={{ ...IS, appearance: "none" }}>
                        <option value="">Select bank…</option>
                        {INDIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                        <input value={kycForm.bank_account} onChange={e => setKYCForm(p => ({ ...p, bank_account: e.target.value }))} placeholder="Account number" className="ap-in" style={IS} />
                        <input value={kycForm.bank_ifsc} onChange={e => setKYCForm(p => ({ ...p, bank_ifsc: e.target.value }))} placeholder="IFSC code" className="ap-in" style={IS} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                    <div>
                      <label style={{ fontSize: 10, color: "#1B4332", fontWeight: 600, display: "block", marginBottom: 4 }}>Aadhaar No.</label>
                      <input value={kycForm.aadhaar_number} onChange={e => setKYCForm(p => ({ ...p, aadhaar_number: e.target.value }))} placeholder="12-digit" maxLength={14} className="ap-in" style={IS} />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, color: "#1B4332", fontWeight: 600, display: "block", marginBottom: 4 }}>PAN No.</label>
                      <input value={kycForm.pan_number} onChange={e => setKYCForm(p => ({ ...p, pan_number: e.target.value.toUpperCase() }))} placeholder="ABCDE1234F" maxLength={10} className="ap-in" style={IS} />
                    </div>
                  </div>
                  {([
                    { title: "Aadhaar Card", fields: [{ f: "govt_id_url" as const, l: "Front" }, { f: "aadhaar_back_url" as const, l: "Back" }] },
                    { title: "PAN Card",     fields: [{ f: "pan_front_url" as const, l: "Front" }, { f: "pan_back_url" as const, l: "Back" }] },
                  ]).map(sec => (
                    <div key={sec.title}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#1B4332", margin: "0 0 7px" }}>{sec.title}</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                        {sec.fields.map(({ f, l }) => (
                          <div key={f}>
                            <label style={{ fontSize: 9, color: "#1B4332", fontWeight: 600, display: "block", marginBottom: 4 }}>{l}</label>
                            <DocUploadButton label={`Upload ${l}`} url={kycForm[f]} loading={uploadingField === f} onFile={fl => handleDocUpload(f, fl)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {kycError && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px" }}>
                      <AlertTriangle size={12} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626", lineHeight: 1.4 }}>{kycError}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={handleKYCSave} disabled={kycPending}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 18px", borderRadius: 10, background: "linear-gradient(135deg,#DE1A1A,#7F1D1D)", border: "none", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                      {kycPending ? <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={11} />} Save KYC
                    </button>
                    <button onClick={() => setEditKYC(false)}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 14px", borderRadius: 10, background: "#F5F6FA", border: "1px solid #EBEDF2", fontSize: 12, fontWeight: 700, color: "#1B4332", cursor: "pointer" }}>
                      <X size={11} /> Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { Icon: Landmark,   label: "Bank",        value: kyc?.bank_name ? `${kyc.bank_name}${kyc.bank_ifsc ? ` · ${kyc.bank_ifsc}` : ""}` : "—" },
                    { Icon: CreditCard, label: "Account No.", value: kyc?.bank_account ? `**** ${kyc.bank_account.slice(-4)}` : "—" },
                    { Icon: FileText,   label: "Aadhaar No.", value: kyc?.aadhaar_number ?? "—" },
                    { Icon: FileText,   label: "PAN No.",     value: kyc?.pan_number ?? "—" },
                  ].map(({ Icon, label, value }) => (
                    <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, background: "#F8F9FC", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                        <Icon size={13} style={{ color: value === "—" ? "#1B4332" : "#1B4332" }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1B4332", margin: "0 0 3px", fontWeight: 600 }}>{label}</p>
                        <p style={{ fontSize: 13, fontWeight: 600, color: value === "—" ? "#1B4332" : "#111111", margin: 0 }}>{value}</p>
                      </div>
                    </div>
                  ))}
                  <button style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", borderRadius: 12, background: "#F8F9FC", border: "1.5px solid #EBEDF2", fontSize: 12, fontWeight: 700, color: "#1B4332", cursor: "pointer", marginTop: 4 }}>
                    <FolderOpen size={14} style={{ color: "#DE1A1A" }} /> View All Documents
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Account Actions */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Settings size={16} style={{ color: "#1B4332" }} />
              <span style={{ fontSize: 14, fontWeight: 800, color: "#111111" }}>Account Actions</span>
            </div>
            <p style={{ fontSize: 12, color: "#1B4332", margin: "0 0 16px" }}>Manage your account security and preferences</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { Icon: Lock,   title: "Change Password",       desc: "Update your password",   action: () => router.push("/change-password") },
                { Icon: Bell,   title: "Notification Settings", desc: "Manage alerts & updates", action: () => {} },
                { Icon: Shield, title: "Privacy Settings",      desc: "Control your data",       action: () => {} },
              ].map(({ Icon, title, desc, action }) => (
                <button key={title} onClick={action}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 14, border: "1px solid #EBEDF2", background: "#F8F9FC", cursor: "pointer", textAlign: "left" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: "#fff", border: "1px solid #EBEDF2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={15} style={{ color: "#1B4332" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: "#111111", margin: "0 0 2px" }}>{title}</p>
                    <p style={{ fontSize: 10, color: "#1B4332", margin: 0 }}>{desc}</p>
                  </div>
                  <ChevronRight size={13} style={{ color: "#1B4332", flexShrink: 0 }} />
                </button>
              ))}
            </div>
            <button onClick={() => startLogout(async () => { await logoutAction() })} disabled={logoutPending}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 14, border: "1px solid rgba(239,68,68,0.2)", background: "rgba(239,68,68,0.04)", cursor: "pointer", textAlign: "left", width: "100%", marginTop: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 11, background: "rgba(239,68,68,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {logoutPending ? <Loader2 size={15} style={{ color: "#DE1A1A", animation: "spin 1s linear infinite" }} /> : <LogOut size={15} style={{ color: "#DE1A1A" }} />}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#DE1A1A", margin: "0 0 2px" }}>{logoutPending ? "Signing out…" : "Sign Out"}</p>
                <p style={{ fontSize: 10, color: "#1B4332", margin: 0 }}>End your current session</p>
              </div>
              <ChevronRight size={13} style={{ color: "#1B4332" }} />
            </button>
          </div>
        </div>

        {/* RIGHT SIDEBAR */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Quick Stats */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#111111", margin: "0 0 16px" }}>Company Overview</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { Icon: Users, label: "Team Members",   value: stats.teamCount,     color: "#DE1A1A", bg: "rgba(222,26,26,0.08)" },
                { Icon: Clock, label: "Pending Leaves", value: stats.pendingLeaves, color: stats.pendingLeaves > 0 ? "#F59E0B" : "#22C55E", bg: stats.pendingLeaves > 0 ? "rgba(245,158,11,0.08)" : "rgba(34,197,94,0.08)" },
              ].map(({ Icon, label, value, color, bg }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={14} style={{ color }} />
                  </div>
                  <p style={{ flex: 1, fontSize: 12, color: "#1B4332", margin: 0 }}>{label}</p>
                  <p style={{ fontSize: 20, fontWeight: 900, color, margin: 0, fontFamily: "var(--font-jakarta)" }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Avatar Picker */}
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EBEDF2", padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: "#111111", margin: "0 0 4px" }}>Choose Avatar</p>
            <p style={{ fontSize: 11, color: "#1B4332", margin: "0 0 14px" }}>Click any photo to set as profile picture</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {PRESET_AVATARS.slice(0, 16).map(url => (
                <button key={url} onClick={() => handlePresetPick(url)} disabled={photoBusy}
                  style={{ padding: 0, border: profile?.photo_url === url ? "2.5px solid #DE1A1A" : "2.5px solid transparent", borderRadius: "50%", cursor: photoBusy ? "not-allowed" : "pointer", background: "none", aspectRatio: "1", overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.1)", opacity: photoBusy ? 0.6 : 1, transition: "transform 0.12s" }}
                  onMouseEnter={e => { if (!photoBusy) (e.currentTarget as HTMLElement).style.transform = "scale(1.08)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}>
                  <img src={url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: 12, padding: "10px", borderRadius: 12, background: "#F9FAFB", border: "1.5px dashed #EBEDF2", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#1B4332" }}>
              <Upload size={13} /> Upload your own
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f) }} disabled={photoBusy} />
            </label>
          </div>
        </div>
      </div>

      {/* Photo Picker Modal (full grid) */}
      {showPicker && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setShowPicker(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} />
          <div style={{ position: "relative", background: "#fff", borderRadius: 24, padding: 24, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <p style={{ fontSize: 17, fontWeight: 900, color: "#111111", margin: 0 }}>Choose Profile Photo</p>
                <p style={{ fontSize: 12, color: "#1B4332", margin: "3px 0 0" }}>Select from our collection or upload your own</p>
              </div>
              <button onClick={() => setShowPicker(false)} style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F6FA", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={14} style={{ color: "#1B4332" }} />
              </button>
            </div>
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
            <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", borderRadius: 12, background: "#F8F9FC", border: "2px dashed #D1D5DB", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1B4332" }}>
              <Upload size={14} /> Upload your own photo
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { setShowPicker(false); handlePhotoUpload(f) } }} />
            </label>
            {photoError && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "8px 12px", marginTop: 10 }}>
                <AlertTriangle size={12} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626", lineHeight: 1.4 }}>{photoError}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
