"use client"

import { useState, useEffect } from "react"
import { X, AlertTriangle, CheckCircle, Info } from "lucide-react"

type ToastType = "error" | "success" | "info"

const CFG: Record<ToastType, { bg: string; border: string; icon: string; text: string; Icon: React.ElementType }> = {
  error:   { bg: "#FEF2F2", border: "#FECACA", icon: "#EF4444", text: "#7F1D1D", Icon: AlertTriangle },
  success: { bg: "#F0FDF4", border: "#BBF7D0", icon: "#16A34A", text: "#14532D", Icon: CheckCircle  },
  info:    { bg: "#EFF6FF", border: "#BFDBFE", icon: "#4F46E5", text: "#1E3A8A", Icon: Info         },
}

export function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  function showToast(msg: string, type: ToastType = "error") {
    setToast({ msg, type })
  }

  const toastEl = toast ? (() => {
    const c = CFG[toast.type]
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
        background: c.bg, borderBottom: `2px solid ${c.border}`,
        padding: "11px 16px",
        display: "flex", alignItems: "center", gap: 10,
        animation: "slideDown 0.2s ease",
      }}>
        <c.Icon size={15} color={c.icon} strokeWidth={2.5} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: c.text, lineHeight: 1.4 }}>
          {toast.msg}
        </span>
        <button onClick={() => setToast(null)} style={{ background: "none", border: "none", cursor: "pointer", color: c.icon, padding: 0, flexShrink: 0, display: "flex" }}>
          <X size={14} />
        </button>
      </div>
    )
  })() : null

  return { toastEl, showToast }
}
