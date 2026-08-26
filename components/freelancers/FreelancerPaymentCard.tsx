"use client"

import { useState, useRef, useEffect } from "react"
import { Phone, MessageCircle, QrCode, Upload, Trash2, Loader2, X, Maximize2 } from "lucide-react"
import { updateFreelancerPaymentQr } from "@/lib/actions/freelancers"

// ── Phone helpers ─────────────────────────────────────────────────────────────

/** Display form — strips a country code only when the number is longer than 10
 *  digits, so a genuine 10-digit number starting with 91 is left alone.
 *  Mirrors formatPhoneDisplay in app/admin/team/team-client.tsx. */
export function formatFreelancerPhone(phone?: string | null): string {
  if (!phone) return ""
  let p = phone.trim()
  if (p.startsWith("+91") && p.length > 13) p = p.slice(3)
  else if (p.startsWith("91") && p.length > 10) p = p.slice(2)
  return p
}

/** wa.me / tel: target — digits only, with 91 prefixed for bare 10-digit numbers. */
export function phoneDialTarget(phone?: string | null): string {
  const digits = (phone ?? "").replace(/\D/g, "")
  if (!digits) return ""
  return digits.length === 10 ? `91${digits}` : digits
}

const MAX_QR_BYTES = 5 * 1024 * 1024

// ── Full-screen QR viewer ─────────────────────────────────────────────────────
// The QR is padded on white at a large size so a phone camera can actually
// resolve it — a small thumbnail on a coloured card does not scan reliably.

function QrLightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = "" }
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 90, background: "rgba(15,23,42,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, backdropFilter: "blur(6px)",
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
        <div style={{ background: "#FFFFFF", borderRadius: 24, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.45)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={`${name} payment QR`}
            style={{ width: "100%", height: "auto", display: "block", borderRadius: 12 }} />
          <p style={{ fontSize: 13, fontWeight: 800, color: "#111827", margin: "16px 0 0", fontFamily: "var(--font-jakarta)" }}>{name}</p>
          <p style={{ fontSize: 11, color: "#6B7280", margin: "4px 0 0", fontWeight: 600 }}>Scan with GPay, PhonePe or any UPI app</p>
        </div>
        <button onClick={onClose}
          style={{ marginTop: 16, padding: "10px 22px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
          <X size={14} /> Close
        </button>
      </div>
    </div>
  )
}

// ── Payment card ──────────────────────────────────────────────────────────────

export default function FreelancerPaymentCard({
  freelancerId, name, phone, qrUrl, accent = "#6D28D9", onQrChange,
}: {
  freelancerId: string
  name: string
  phone: string | null
  qrUrl: string | null
  /** Team/brand colour so the card sits with whichever profile hosts it. */
  accent?: string
  /** Lets the host page keep its local copy in sync without a full refetch. */
  onQrChange?: (url: string | null) => void
}) {
  const [url, setUrl] = useState<string | null>(qrUrl)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Adjust-during-render (not an effect): when the host page re-renders with a
  // different freelancer or a refreshed row, drop the local copy and follow the
  // prop again. Doing this in an effect would flash the previous QR first.
  const [seenQr, setSeenQr] = useState(qrUrl)
  if (seenQr !== qrUrl) { setSeenQr(qrUrl); setUrl(qrUrl) }

  const display = formatFreelancerPhone(phone)
  const dial = phoneDialTarget(phone)

  async function handleUpload(file: File) {
    setError(null)
    if (!file.type.startsWith("image/")) { setError("Pick an image file (PNG or JPG)."); return }
    if (file.size > MAX_QR_BYTES) { setError("Image too large — max 5MB."); return }

    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "freelancer-qr")
      const res = await fetch("/api/upload-photo", { method: "POST", body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.error || !json.url) { setError(json.error ?? "Upload failed — try a smaller image."); return }

      const saved = await updateFreelancerPaymentQr(freelancerId, json.url)
      if (!saved.success) { setError(saved.error ?? "Could not save the QR."); return }

      setUrl(json.url)
      onQrChange?.(json.url)
    } catch {
      setError("Upload failed — check your connection.")
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function handleRemove() {
    setError(null); setBusy(true)
    try {
      const saved = await updateFreelancerPaymentQr(freelancerId, null)
      if (!saved.success) { setError(saved.error ?? "Could not remove the QR."); return }
      setUrl(null)
      onQrChange?.(null)
    } finally { setBusy(false) }
  }

  return (
    <div style={{ background: "#FFFFFF", borderRadius: 20, border: "1px solid #F0F0F5", boxShadow: "0 2px 12px rgba(0,0,0,0.04)", overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #F5F5F7" }}>
        <p style={{ fontSize: 14, fontWeight: 900, color: "#111", margin: 0, fontFamily: "var(--font-jakarta)" }}>Contact &amp; Payment</p>
        <p style={{ fontSize: 11, color: "#9CA3AF", margin: "2px 0 0" }}>Phone number and UPI payment QR</p>
      </div>

      <div className="flex flex-col sm:flex-row" style={{ gap: 16, padding: 16 }}>

        {/* Phone */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Phone</p>
          {display ? (
            <>
              <p style={{ fontSize: 18, fontWeight: 900, color: "#111827", margin: "6px 0 0", fontFamily: "var(--font-jakarta)", letterSpacing: "-0.01em" }}>{display}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <a href={`tel:+${dial}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: accent, color: "#fff", fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
                  <Phone size={13} /> Call
                </a>
                <a href={`https://wa.me/${dial}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)", color: "#128C7E", fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
                  <MessageCircle size={13} /> WhatsApp
                </a>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "#9CA3AF", margin: "8px 0 0", fontWeight: 600 }}>
              No phone number saved — add one from Team → Freelancers.
            </p>
          )}
        </div>

        {/* Payment QR */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Payment QR</p>

          {url ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 8 }}>
              <button onClick={() => setZoom(true)} title="Tap to enlarge and scan"
                style={{ position: "relative", padding: 6, borderRadius: 12, background: "#FFFFFF", border: "1px solid #E5E7EB", cursor: "pointer", flexShrink: 0, lineHeight: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`${name} payment QR`} style={{ width: 92, height: 92, objectFit: "contain", display: "block", borderRadius: 8 }} />
                <span style={{ position: "absolute", bottom: 8, right: 8, width: 22, height: 22, borderRadius: 7, background: "rgba(17,24,39,0.75)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Maximize2 size={11} color="#fff" />
                </span>
              </button>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, color: "#6B7280", margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                  Tap the code to open it full screen for scanning.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button onClick={() => fileRef.current?.click()} disabled={busy}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, border: "1px solid #E5E7EB", background: "#F9FAFB", color: "#374151", fontSize: 11, fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Replace
                  </button>
                  <button onClick={handleRemove} disabled={busy}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 10, border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.06)", color: "#DC2626", fontSize: 11, fontWeight: 800, cursor: busy ? "wait" : "pointer" }}>
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              style={{ width: "100%", marginTop: 8, padding: "18px 14px", borderRadius: 14, border: "1.5px dashed #D1D5DB", background: "#FAFAFB", cursor: busy ? "wait" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              {busy
                ? <Loader2 size={20} color={accent} className="animate-spin" />
                : <QrCode size={20} color={accent} />}
              <span style={{ fontSize: 12, fontWeight: 800, color: "#374151" }}>
                {busy ? "Uploading…" : "Upload GPay / PhonePe QR"}
              </span>
              <span style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 600 }}>PNG or JPG · max 5MB</span>
            </button>
          )}

          {error && (
            <p style={{ fontSize: 11, color: "#DC2626", margin: "8px 0 0", fontWeight: 700 }}>{error}</p>
          )}

          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }} />
        </div>
      </div>

      {zoom && url && <QrLightbox url={url} name={name} onClose={() => setZoom(false)} />}
    </div>
  )
}
