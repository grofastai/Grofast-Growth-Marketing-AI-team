"use client"

import { stopImpersonation } from "@/lib/actions/impersonate"
import { LogOut } from "lucide-react"
import { useTransition } from "react"

export default function ImpersonationBanner({ memberName }: { memberName: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
        background: "#D97706", padding: "8px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>👁️</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>
          Viewing as <span style={{ textDecoration: "underline" }}>{memberName}</span>
        </span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>
          — Member&apos;s view (Admin mode)
        </span>
      </div>
      <form action={stopImpersonation}>
        <button
          type="submit"
          disabled={pending}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 14px", borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.5)",
            background: "rgba(255,255,255,0.15)", color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
          }}
        >
          <LogOut size={13} />
          Exit — Back to Admin
        </button>
      </form>
    </div>
  )
}
