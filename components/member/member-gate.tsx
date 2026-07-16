"use client"

import { usePathname, useRouter } from "next/navigation"
import { LogOut, FileText, AlertTriangle, PhoneCall } from "lucide-react"
import { logoutAction } from "@/lib/actions/auth"

interface Props {
  forgotLogout: boolean
  forgotLogoutDate: string
  missingUpdate: boolean
  missingUpdateDate: string
  noLeave: boolean
  noLeaveDate: string
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  })
}

export default function MemberGate({ forgotLogout, forgotLogoutDate, missingUpdate, missingUpdateDate, noLeave, noLeaveDate }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  if (!forgotLogout && !missingUpdate && !noLeave) return null

  // Hide gate when user is on the unlocked page. noLeave has no self-service fix
  // page — there's nothing to submit for a day with no login and no leave on
  // file — so unlike the other two, it never unlocks anywhere.
  if (forgotLogout && pathname.startsWith("/member/attendance")) return null
  if (!forgotLogout && !noLeave && missingUpdate && pathname.startsWith("/member/update")) return null

  if (!forgotLogout && noLeave) {
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
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              background: "rgba(239,68,68,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <PhoneCall size={28} style={{ color: "#EF4444" }} />
            </div>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111", textAlign: "center", margin: "0 0 8px" }}>
            Contact Admin
          </h2>
          <p style={{ fontSize: 12, color: "#9CA3AF", textAlign: "center", margin: "0 0 16px" }}>
            {fmtDate(noLeaveDate)}
          </p>

          <div style={{
            background: "#FEF2F2", borderRadius: 12, padding: "12px 16px", marginBottom: 24,
            border: "1px solid rgba(239,68,68,0.15)",
          }}>
            <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.6, textAlign: "center" }}>
              You did not log in on this day and have no approved (or pending) leave on file for it. Only your admin can resolve this — please contact them.
            </p>
          </div>

          <form action={logoutAction}>
            <button type="submit" style={{
              width: "100%", padding: "13px 0", borderRadius: 12,
              border: "1.5px solid #E5E7EB", background: "#fff",
              color: "#6B7280", fontSize: 14, fontWeight: 700,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8,
            }}>
              <LogOut size={15} />
              Sign Out
            </button>
          </form>

          <p style={{ fontSize: 11, color: "#D1D5DB", textAlign: "center", marginTop: 10 }}>
            All other sections are locked until this is resolved
          </p>
        </div>
      </div>
    )
  }

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
            {fmtDate(forgotLogoutDate)}
          </p>

          <div style={{
            background: "#FEF2F2", borderRadius: 12, padding: "12px 16px", marginBottom: 24,
            border: "1px solid rgba(239,68,68,0.15)",
          }}>
            <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.6, textAlign: "center" }}>
              You forgot to clock out on this day. Fix your logout time on the Attendance page to continue.
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

          <form action={logoutAction} style={{ marginTop: 10 }}>
            <button type="submit" style={{
              width: "100%", padding: "11px 0", borderRadius: 12,
              border: "1.5px solid #E5E7EB", background: "#fff",
              color: "#6B7280", fontSize: 13, fontWeight: 600,
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8,
            }}>
              <LogOut size={13} />
              Sign Out
            </button>
          </form>

          <p style={{ fontSize: 11, color: "#D1D5DB", textAlign: "center", marginTop: 10 }}>
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
          {fmtDate(missingUpdateDate)}
        </p>

        <div style={{
          background: "#FFFBEB", borderRadius: 12, padding: "12px 16px", marginBottom: 24,
          border: "1px solid rgba(245,158,11,0.2)",
        }}>
          <p style={{ fontSize: 13, color: "#6B7280", margin: 0, lineHeight: 1.6, textAlign: "center" }}>
            This day has no work entries logged. Submit the update for it to unlock all features.
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
          Submit This Day&apos;s Update
        </button>

        <form action={logoutAction} style={{ marginTop: 10 }}>
          <button type="submit" style={{
            width: "100%", padding: "11px 0", borderRadius: 12,
            border: "1.5px solid #E5E7EB", background: "#fff",
            color: "#6B7280", fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center",
            justifyContent: "center", gap: 8,
          }}>
            <LogOut size={13} />
            Sign Out
          </button>
        </form>

        <p style={{ fontSize: 11, color: "#D1D5DB", textAlign: "center", marginTop: 10 }}>
          All other sections are locked until this is resolved
        </p>
      </div>
    </div>
  )
}
