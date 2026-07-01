"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"

type ToastType = "error" | "success" | "info"

const CFG: Record<ToastType, { bg: string; border: string; dot: string; text: string }> = {
  error:   { bg: "#FEF2F2", border: "#FECACA", dot: "#EF4444", text: "#991B1B" },
  success: { bg: "#F0FDF4", border: "#BBF7D0", dot: "#22C55E", text: "#166534" },
  info:    { bg: "#EFF6FF", border: "#BFDBFE", dot: "#6366F1", text: "#1E40AF" },
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function showToast(msg: string, type: ToastType = "error") {
    setToast({ msg, type })
  }

  const toastEl = toast ? (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, maxWidth: 460, width: "calc(100% - 32px)",
      background: CFG[toast.type].bg,
      border: `1.5px solid ${CFG[toast.type].border}`,
      borderRadius: 10, padding: "10px 14px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
      display: "flex", alignItems: "center", gap: 10,
      animation: "slideDown 0.2s ease",
    }}>
      <div style={{
        width: 8, height: 8, borderRadius: "50%",
        background: CFG[toast.type].dot, flexShrink: 0,
      }} />
      <p style={{
        flex: 1, fontSize: 13, fontWeight: 600,
        color: CFG[toast.type].text, margin: 0, lineHeight: 1.4,
      }}>
        {toast.msg}
      </p>
      <button
        onClick={() => setToast(null)}
        style={{ background: "none", border: "none", cursor: "pointer", color: CFG[toast.type].dot, padding: 0, flexShrink: 0, lineHeight: 1 }}
      >
        <X size={13} />
      </button>
    </div>
  ) : null

  return { toastEl, showToast }
}
