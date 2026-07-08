"use client"

import { useState, useTransition } from "react"
import { Trash2, Loader2, AlertTriangle, X } from "lucide-react"
import { adminDeleteAttendanceLog } from "@/lib/actions/attendance"
import { useRouter } from "next/navigation"

interface Props {
  userId: string
  userName: string
  date: string
}

export default function ClearAttendanceBtn({ userId, userName, date }: Props) {
  const [confirm, setConfirm] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  function handleDelete() {
    startTransition(async () => {
      const res = await adminDeleteAttendanceLog(userId, date)
      if (res.success) { setConfirm(false); router.refresh() }
    })
  }

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        title="Clear attendance record"
        style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
        <Trash2 size={12} style={{ color: "#EF4444" }} />
      </button>

      {confirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(10,10,11,0.65)", backdropFilter: "blur(8px)" }}>
          <div style={{ width: "100%", maxWidth: 380, background: "#fff", borderRadius: 22, padding: 28, boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(239,68,68,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AlertTriangle size={22} style={{ color: "#EF4444" }} />
              </div>
              <button onClick={() => setConfirm(false)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
                <X size={18} style={{ color: "#0F4C4C" }} />
              </button>
            </div>
            <p style={{ fontSize: 16, fontWeight: 900, color: "#0A0A0B", margin: "0 0 8px" }}>Clear Attendance Record?</p>
            <p style={{ fontSize: 13, color: "#0F4C4C", margin: "0 0 6px", lineHeight: 1.6 }}>
              This will delete <strong>{userName}</strong>'s clock-in record for <strong>{date}</strong>.
            </p>
            <p style={{ fontSize: 12, color: "#EF4444", margin: "0 0 24px", fontWeight: 600 }}>
              ⚠️ They will show as "Not Logged" after this.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirm(false)}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13, fontWeight: 600, background: "#F6F7FA", color: "#0F4C4C", border: "1px solid #EBEDF2", cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={pending}
                style={{ flex: 1, padding: "11px 0", borderRadius: 12, fontSize: 13, fontWeight: 700, background: "#EF4444", color: "#fff", border: "none", cursor: "pointer", opacity: pending ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Clear Record
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
