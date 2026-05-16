"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Camera, Loader2, CheckCircle2, Upload, UserCircle2 } from "lucide-react"
import { updatePersonalDetails } from "@/lib/actions/profile"

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

export default function AdminProfileClient({
  name, employeeId, email, photoUrl,
}: {
  name: string; employeeId: string; email: string; photoUrl: string | null
}) {
  const router = useRouter()
  const [currentPhoto, setCurrentPhoto] = useState(photoUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const initials = name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()

  async function pickPreset(url: string) {
    setBusy(true); setError(null); setSaved(false)
    const res = await updatePersonalDetails({ photo_url: url })
    if ("error" in res) setError(res.error ?? "Failed")
    else { setCurrentPhoto(url); setSaved(true); router.refresh() }
    setBusy(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null); setSaved(false)
    try {
      const fd = new FormData(); fd.append("file", file)
      const res = await fetch("/api/upload-photo", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok || json.error) { setError(json.error ?? "Upload failed"); return }
      const upd = await updatePersonalDetails({ photo_url: json.url })
      if ("error" in upd) { setError(upd.error ?? "Save failed"); return }
      setCurrentPhoto(json.url); setSaved(true); router.refresh()
    } catch { setError("Upload failed") } finally { setBusy(false) }
  }

  return (
    <div style={{ background: "#F5F6FA", minHeight: "100vh", padding: "24px 28px 56px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111111", margin: 0, fontFamily: "var(--font-jakarta)" }}>
          My <span style={{ color: "#DE1A1A" }}>Profile</span>
        </h1>
        <p style={{ fontSize: 13, color: "#6B7280", margin: "4px 0 0" }}>Update your profile photo and account info</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" }}>

        {/* Left — Current avatar card */}
        <div style={{ background: "#FFFFFF", borderRadius: 24, border: "1px solid #EBEDF2", padding: "28px 24px 24px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", textAlign: "center" }}>
          {/* Avatar */}
          <div style={{ position: "relative", display: "inline-block", marginBottom: 16 }}>
            <div style={{ width: 100, height: 100, borderRadius: "50%", background: "#DE1A1A", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, color: "#fff", fontFamily: "var(--font-jakarta)", border: "3px solid #EBEDF2" }}>
              {currentPhoto
                ? <img src={currentPhoto} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : initials}
            </div>
            {busy && (
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={20} style={{ color: "#fff", animation: "spin 1s linear infinite" }} />
              </div>
            )}
          </div>

          <p style={{ fontSize: 18, fontWeight: 900, color: "#111111", margin: "0 0 4px", fontFamily: "var(--font-jakarta)" }}>{name}</p>
          <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 4px" }}>#{employeeId}</p>
          <p style={{ fontSize: 11, color: "#6B7280", margin: "0 0 20px" }}>{email}</p>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 20, background: "rgba(222,26,26,0.08)", marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#DE1A1A" }}>Administrator</span>
          </div>

          {saved && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 14px", borderRadius: 12, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", marginBottom: 12 }}>
              <CheckCircle2 size={14} style={{ color: "#16A34A" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}>Profile photo saved!</span>
            </div>
          )}
          {error && (
            <p style={{ fontSize: 12, color: "#DE1A1A", fontWeight: 600, margin: "0 0 12px" }}>{error}</p>
          )}

          {/* Upload own photo */}
          <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "11px 20px", borderRadius: 12, background: "#F9FAFB", border: "1.5px dashed #EBEDF2", color: "#6B7280", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#DE1A1A"; (e.currentTarget as HTMLElement).style.color = "#DE1A1A" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#EBEDF2"; (e.currentTarget as HTMLElement).style.color = "#6B7280" }}>
            <Upload size={14} />
            Upload your photo
            <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} disabled={busy} />
          </label>
        </div>

        {/* Right — Avatar picker */}
        <div style={{ background: "#FFFFFF", borderRadius: 24, border: "1px solid #EBEDF2", padding: "24px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(222,26,26,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UserCircle2 size={16} style={{ color: "#DE1A1A" }} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 800, color: "#111111", margin: 0 }}>Choose Avatar</p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0 }}>Pick one of the preset profile photos</p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
            {PRESET_AVATARS.map(url => (
              <button key={url} onClick={() => pickPreset(url)} disabled={busy}
                style={{
                  padding: 0, border: currentPhoto === url ? "3px solid #DE1A1A" : "3px solid transparent",
                  borderRadius: "50%", cursor: busy ? "not-allowed" : "pointer", background: "none",
                  aspectRatio: "1", overflow: "hidden",
                  boxShadow: currentPhoto === url ? "0 0 0 2px rgba(222,26,26,0.2)" : "0 2px 8px rgba(0,0,0,0.1)",
                  transition: "transform 0.15s, box-shadow 0.15s", opacity: busy ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (!busy) { (e.currentTarget as HTMLElement).style.transform = "scale(1.1)" } }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)" }}>
                <img src={url} alt="avatar option" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
            ))}
          </div>

          <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 16, textAlign: "center" }}>
            Click any avatar to instantly set it as your profile photo
          </p>
        </div>
      </div>
    </div>
  )
}
