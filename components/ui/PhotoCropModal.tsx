"use client"

import { useCallback, useState } from "react"
import Cropper, { type Area } from "react-easy-crop"
import { Loader2 } from "lucide-react"
import { getCroppedImageBlob } from "@/lib/image/crop"

type PhotoCropModalProps = {
  open: boolean
  imageSrc: string | null
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

const OUTPUT_SIZE = 512

export function PhotoCropModal({ open, imageSrc, onCancel, onConfirm }: PhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  function reset() {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setBusy(false)
    setError(null)
  }

  function handleCancel() {
    reset()
    onCancel()
  }

  async function handleSave() {
    if (!imageSrc || !croppedAreaPixels) return
    setBusy(true)
    setError(null)
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, OUTPUT_SIZE)
      reset()
      onConfirm(blob)
    } catch {
      setError("Couldn't process that photo — try again")
      setBusy(false)
    }
  }

  if (!open || !imageSrc) return null

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{`.pcm-btn:focus-visible{outline:2px solid #DE1A1A;outline-offset:2px;}`}</style>
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(10,10,15,0.6)", backdropFilter: "blur(6px)" }}
        onClick={handleCancel}
      />
      <div style={{ position: "relative", background: "#fff", borderRadius: 22, padding: 20, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }}>
        <p style={{ fontSize: 15, fontWeight: 900, color: "#111111", margin: "0 0 4px" }}>Adjust Photo</p>
        <p style={{ fontSize: 12, color: "#9CA3AF", margin: "0 0 14px" }}>Drag to reposition, pinch or scroll to zoom</p>

        <div style={{ position: "relative", width: "100%", height: 320, borderRadius: 16, overflow: "hidden", background: "#111827" }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>

        <input
          type="range" min={1} max={3} step={0.01} value={zoom}
          onChange={e => setZoom(Number(e.target.value))}
          className="pcm-btn"
          style={{ width: "100%", margin: "14px 0 4px", accentColor: "#DE1A1A" }}
          aria-label="Zoom"
        />

        {error && <p style={{ fontSize: 11, color: "#DC2626", margin: "6px 0 0" }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={handleCancel} disabled={busy}
            className="pcm-btn"
            style={{ flex: 1, padding: "11px 18px", borderRadius: 13, border: "1.5px solid #E5E7EB", background: "#fff", color: "#374151", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave} disabled={busy || !croppedAreaPixels}
            className="pcm-btn"
            style={{ flex: 1, padding: "11px 18px", borderRadius: 13, border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13.5, color: "#fff", background: "linear-gradient(135deg,#DE1A1A 0%,#8B1212 100%)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: busy || !croppedAreaPixels ? 0.7 : 1 }}
          >
            {busy && <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />}
            {busy ? "Saving…" : "Save Photo"}
          </button>
        </div>
      </div>
    </div>
  )
}
