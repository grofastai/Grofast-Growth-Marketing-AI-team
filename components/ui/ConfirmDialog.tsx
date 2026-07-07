"use client"

import { createContext, useCallback, useContext, useState, type ReactNode } from "react"
import { AlertTriangle, Trash2 } from "lucide-react"

type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** false = neutral/dark action button instead of the red danger gradient */
  danger?: boolean
  icon?: "trash" | "warning"
}

type PendingConfirm = ConfirmOptions & { resolve: (v: boolean) => void }

const ConfirmContext = createContext<((opts: ConfirmOptions | string) => Promise<boolean>) | null>(null)

// Drop-in in-app replacement for window.confirm(). Renders one premium
// dialog styled to match the app instead of the browser's native
// "site says" popup.
//   const confirm = useConfirm()
//   if (!(await confirm("Delete this? This cannot be undone."))) return
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const [closing, setClosing] = useState(false)

  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    const normalized = typeof opts === "string" ? { message: opts } : opts
    return new Promise<boolean>(resolve => {
      setPending({ ...normalized, resolve })
      setClosing(false)
    })
  }, [])

  function settle(result: boolean) {
    setClosing(true)
    setTimeout(() => {
      pending?.resolve(result)
      setPending(null)
      setClosing(false)
    }, 130)
  }

  const isDanger = pending?.danger !== false
  const Icon = pending?.icon === "warning" ? AlertTriangle : Trash2

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          onClick={() => settle(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 10000,
            background: "rgba(10,10,15,0.55)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            animation: `${closing ? "confirmBackdropOut" : "confirmBackdropIn"} 0.15s ease forwards`,
          }}
        >
          <style>{`
            @keyframes confirmBackdropIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes confirmBackdropOut { from { opacity: 1; } to { opacity: 0; } }
            @keyframes confirmCardIn { from { transform: translateY(8px) scale(0.96); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
            @keyframes confirmCardOut { from { transform: translateY(0) scale(1); opacity: 1; } to { transform: translateY(6px) scale(0.96); opacity: 0; } }
          `}</style>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "relative", overflow: "hidden",
              background: "linear-gradient(180deg,#FFFFFF 0%,#FCFCFD 100%)",
              borderRadius: 22, padding: "30px 26px 22px",
              width: "min(400px, 100%)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.35), 0 4px 16px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)",
              border: "1px solid rgba(255,255,255,0.4)",
              animation: `${closing ? "confirmCardOut" : "confirmCardIn"} 0.16s cubic-bezier(0.16,1,0.3,1) forwards`,
            }}
          >
            {/* Decorative glow */}
            <div style={{
              position: "absolute", top: -60, left: "50%", transform: "translateX(-50%)",
              width: 200, height: 140, borderRadius: "50%", pointerEvents: "none",
              background: isDanger ? "radial-gradient(closest-side, rgba(222,26,26,0.14), transparent)" : "radial-gradient(closest-side, rgba(17,24,39,0.10), transparent)",
            }} />

            {/* Icon badge */}
            <div style={{
              position: "relative", width: 54, height: 54, borderRadius: 16, margin: "0 auto 16px",
              display: "flex", alignItems: "center", justifyContent: "center",
              background: isDanger
                ? "linear-gradient(145deg,#EF4444 0%,#B91C1C 100%)"
                : "linear-gradient(145deg,#374151 0%,#111827 100%)",
              boxShadow: isDanger
                ? "0 10px 24px rgba(220,38,38,0.35), inset 0 1px 0 rgba(255,255,255,0.25)"
                : "0 10px 24px rgba(17,24,39,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}>
              <Icon size={24} color="#fff" strokeWidth={2.25} />
            </div>

            <div style={{ position: "relative", textAlign: "center" }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 900, color: "#111827", fontFamily: "var(--font-jakarta)", letterSpacing: "-0.01em" }}>
                {pending.title ?? "Are you sure?"}
              </h3>
              <p style={{ margin: "0 auto", maxWidth: 320, fontSize: 13.5, color: "#6B7280", lineHeight: 1.6, fontWeight: 500 }}>
                {pending.message}
              </p>
            </div>

            <div style={{ position: "relative", display: "flex", gap: 10, marginTop: 24 }}>
              <button
                onClick={() => settle(false)}
                style={{
                  flex: 1, padding: "11px 18px", borderRadius: 13, border: "1.5px solid #E5E7EB",
                  background: "#FFFFFF", color: "#374151", fontWeight: 800, fontSize: 13.5, cursor: "pointer",
                  transition: "background 0.12s, border-color 0.12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = "#D1D5DB" }}
                onMouseLeave={e => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.borderColor = "#E5E7EB" }}
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                onClick={() => settle(true)}
                style={{
                  flex: 1, padding: "11px 18px", borderRadius: 13, border: "none", cursor: "pointer",
                  fontWeight: 800, fontSize: 13.5, color: "#fff",
                  background: isDanger ? "linear-gradient(135deg,#EF4444 0%,#991111 100%)" : "linear-gradient(135deg,#374151 0%,#111827 100%)",
                  boxShadow: isDanger ? "0 8px 20px rgba(220,38,38,0.35)" : "0 8px 20px rgba(17,24,39,0.3)",
                  transition: "transform 0.12s, box-shadow 0.12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)" }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)" }}
              >
                {pending.confirmLabel ?? "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm() must be used within a ConfirmProvider")
  return ctx
}
