"use client"

import { useState, useEffect } from "react"
import { X, AlertTriangle, CheckCircle, Info } from "lucide-react"

type ToastType = "error" | "success" | "info"

const CFG: Record<ToastType, { bg: string; border: string; iconColor: string; titleColor: string; bodyColor: string; divider: string; Icon: React.ElementType }> = {
  error:   { bg: "#FFF8F8", border: "#FECACA", iconColor: "#EF4444", titleColor: "#991B1B", bodyColor: "#7F1D1D", divider: "#FECACA", Icon: AlertTriangle },
  success: { bg: "#F0FDF4", border: "#BBF7D0", iconColor: "#22C55E", titleColor: "#166534", bodyColor: "#14532D", divider: "#BBF7D0", Icon: CheckCircle  },
  info:    { bg: "#EFF6FF", border: "#BFDBFE", iconColor: "#6366F1", titleColor: "#1E40AF", bodyColor: "#1E3A8A", divider: "#BFDBFE", Icon: Info         },
}

export function useToast() {
  const [toast, setToast] = useState<{ title: string; msg: string; type: ToastType } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  function showToast(msg: string, type: ToastType = "error", title?: string) {
    const defaultTitles: Record<ToastType, string> = { error: "Error", success: "Success", info: "Info" }
    setToast({ title: title ?? defaultTitles[type], msg, type })
  }

  const toastEl = toast ? (() => {
    const c = CFG[toast.type]
    return (
      <div style={{
        position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 9999, maxWidth: 440, width: "calc(100% - 32px)",
        background: c.bg, border: `1.5px solid ${c.border}`,
        borderRadius: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        animation: "slideDown 0.2s ease", overflow: "hidden",
      }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px 10px" }}>
          <c.Icon size={15} color={c.iconColor} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: c.titleColor, letterSpacing: "0.01em" }}>
            {toast.title}
          </span>
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", cursor: "pointer", color: c.iconColor, padding: 0, lineHeight: 1, opacity: 0.7 }}>
            <X size={13} />
          </button>
        </div>
        {/* Divider */}
        <div style={{ height: 1, background: c.divider, margin: "0 14px" }} />
        {/* Body */}
        <div style={{ padding: "9px 14px 12px" }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: c.bodyColor, margin: 0, lineHeight: 1.6 }}>
            {toast.msg}
          </p>
        </div>
      </div>
    )
  })() : null

  return { toastEl, showToast }
}
