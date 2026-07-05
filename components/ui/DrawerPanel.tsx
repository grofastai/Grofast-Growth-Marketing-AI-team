"use client"

import type { ReactNode } from "react"
import { X } from "lucide-react"

// Right-side slide-over shell: semi-transparent backdrop (click to close)
// + a frosted glass panel sliding in from the right. `header` is rendered
// above a close button (e.g. a SegmentedControl), `children` is the
// scrollable body.
export function DrawerPanel({
  open,
  onClose,
  header,
  children,
  widthClassName = "w-full max-w-md",
}: {
  open: boolean
  onClose: () => void
  header: ReactNode
  children: ReactNode
  widthClassName?: string
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.35)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className={`${widthClassName} h-full flex flex-col`}
        style={{
          background: "rgba(255,255,255,0.75)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderLeft: "1px solid rgba(255,255,255,0.8)",
          boxShadow: "-16px 0 48px rgba(31,38,135,0.16)",
          animation: "drawerSlideIn 0.22s ease",
        }}
      >
        <style>{`@keyframes drawerSlideIn { from { transform: translateX(24px); opacity: 0.6; } to { transform: translateX(0); opacity: 1; } }`}</style>
        <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 hover:bg-black/5 transition-colors">
            <X size={16} style={{ color: "#6B7280" }} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  )
}
