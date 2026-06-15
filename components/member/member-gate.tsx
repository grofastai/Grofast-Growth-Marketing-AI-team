"use client"

import { usePathname, useRouter } from "next/navigation"
import { LogOut, FileText, AlertTriangle } from "lucide-react"

interface Props {
  forgotLogout: boolean
  missingUpdate: boolean
  yesterdayDate: string
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  })
}

export default function MemberGate({ forgotLogout, missingUpdate, yesterdayDate }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  if (!forgotLogout && !missingUpdate) return null

  // Hide gate when user is on the unlocked page
  if (forgotLogout && pathname.startsWith("/member/attendance")) return null
  if (!forgotLogout && missingUpdate && pathname.startsWith("/member/update")) return null

  if (forgotLogout) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      }}>
        <div style={{
          background: "#fff", borderRadius: 24, padding: "32px 28px", maxWidth: 400, width: "100%",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
        }}>
          {/* Icon */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              background: "rgba(239,68,68,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <LogOut size={28} style={{ color: "#EF4444" }} />
            </div>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", textAlign: "center", margin: "0 0 8px" }}>
            Forgot to Clock Out
          </h2>
          <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", margin: "0 0 16px" }}>
            {fmtDate(yesterdayDate)}
          </p>

          <div style={{
            background: "#FEF2F2", borderRadius: 12, padding: "12px 16px", marginBottom: 24,
            border: "1px solid rgba(239,68,68,0.15)",
          }}>
            <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.6, textAlign: "center" }}>
              You forgot to clock out yesterday. Fix your logout time on the Attendance page to continue.
            </p>
          </div>

          <button
            onClick={() => router.push("/member/attendance")}
            style={{
              width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
              background: "#EF4444", color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8,
            }}
          >
            <LogOut size={15} />
            Go to Attendance
          </button>

          <p style={{ fontSize: 11, color: "#D1D5DB", textAlign: "center", marginTop: 12 }}>
            All other sections are locked until this is resolved
          </p>
        </div>
      </div>
    )
  }

  // missingUpdate
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "#fff", borderRadius: 24, padding: "32px 28px", maxWidth: 400, width: "100%",
        boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
      }}>
        {/* Icon */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: "rgba(245,158,11,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <AlertTriangle size={28} style={{ color: "#F59E0B" }} />
          </div>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", textAlign: "center", margin: "0 0 8px" }}>
          Daily Update Missing
        </h2>
        <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", margin: "0 0 16px" }}>
          {fmtDate(yesterdayDate)}
        </p>

        <div style={{
          background: "#FFFBEB", borderRadius: 12, padding: "12px 16px", marginBottom: 24,
          border: "1px solid rgba(245,158,11,0.2)",
        }}>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.6, textAlign: "center" }}>
            You haven&apos;t submitted your daily update for yesterday. Submit it to unlock all features.
          </p>
        </div>

        <button
          onClick={() => router.push("/member/update")}
          style={{
            width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
            background: "#F59E0B", color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8,
          }}
        >
          <FileText size={15} />
          Submit Yesterday&apos;s Update
        </button>

        <p style={{ fontSize: 11, color: "#D1D5DB", textAlign: "center", marginTop: 12 }}>
          All other sections are locked until this is resolved
        </p>
      </div>
    </div>
  )
}
