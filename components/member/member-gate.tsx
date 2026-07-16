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

type Theme = { from: string; to: string; solid: string; soft: string; border: string }
const THEMES: Record<"red" | "amber", Theme> = {
  red:   { from: "#F87171", to: "#DC2626", solid: "#DC2626", soft: "#FEF2F2", border: "rgba(220,38,38,0.18)" },
  amber: { from: "#FBBF24", to: "#D97706", solid: "#D97706", soft: "#FFFBEB", border: "rgba(217,119,6,0.18)" },
}

function GateIcon({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
      <div style={{
        width: 68, height: 68, borderRadius: 20,
        background: `linear-gradient(155deg, ${theme.from} 0%, ${theme.to} 100%)`,
        boxShadow: `0 1px 0 rgba(255,255,255,0.5) inset, 0 -4px 8px rgba(0,0,0,0.16) inset, 0 10px 22px -6px ${theme.to}99`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {children}
      </div>
    </div>
  )
}

function DatePill({ theme, date }: { theme: Theme; date: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "0 0 18px" }}>
      <span style={{
        fontSize: 13, fontWeight: 800, color: "#fff", letterSpacing: 0.1,
        background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
        padding: "7px 18px", borderRadius: 999,
        boxShadow: `0 1px 0 rgba(255,255,255,0.35) inset, 0 4px 12px -2px ${theme.to}88`,
      }}>
        📅 {fmtDate(date)}
      </span>
    </div>
  )
}

function MessageBox({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div style={{
      background: theme.soft, borderRadius: 14, padding: "14px 16px", marginBottom: 24,
      border: `1px solid ${theme.border}`,
      boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset",
    }}>
      <p style={{ fontSize: 13, color: "#57534E", margin: 0, lineHeight: 1.6, textAlign: "center", fontWeight: 500 }}>
        {children}
      </p>
    </div>
  )
}

function PrimaryButton({ theme, onClick, icon, children }: { theme: Theme; onClick?: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  const props = onClick ? { onClick } : { type: "submit" as const }
  return (
    <button
      {...props}
      style={{
        width: "100%", padding: "14px 0", borderRadius: 14, border: "none",
        background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
        color: "#fff", fontSize: 14, fontWeight: 800,
        cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 8,
        boxShadow: `0 1px 0 rgba(255,255,255,0.3) inset, 0 8px 18px -6px ${theme.to}aa`,
      }}
    >
      {icon}
      {children}
    </button>
  )
}

function SignOutButton() {
  return (
    <form action={logoutAction} style={{ marginTop: 10 }}>
      <button type="submit" style={{
        width: "100%", padding: "12px 0", borderRadius: 14,
        border: "1.5px solid #E5E7EB", background: "#fff",
        color: "#6B7280", fontSize: 13, fontWeight: 700,
        cursor: "pointer", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 8,
      }}>
        <LogOut size={13} />
        Sign Out
      </button>
    </form>
  )
}

function GateCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.88)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }}>
      <div style={{
        background: "linear-gradient(180deg, #ffffff 0%, #fcfcfd 100%)", borderRadius: 26, padding: "34px 28px", maxWidth: 400, width: "100%",
        boxShadow: "0 40px 90px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.9) inset",
        border: "1px solid rgba(255,255,255,0.6)",
      }}>
        {children}
      </div>
    </div>
  )
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
    const theme = THEMES.red
    return (
      <GateCard>
        <GateIcon theme={theme}>
          <PhoneCall size={30} strokeWidth={2.25} style={{ color: "#fff", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.2))" }} />
        </GateIcon>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: "#111", textAlign: "center", margin: "0 0 10px" }}>
          Contact Admin
        </h2>
        <DatePill theme={theme} date={noLeaveDate} />
        <MessageBox theme={theme}>
          You did not log in on this day and have no approved (or pending) leave on file for it. Only your admin can resolve this — please contact them.
        </MessageBox>
        <SignOutButton />
        <p style={{ fontSize: 11, color: "#D1D5DB", textAlign: "center", marginTop: 12 }}>
          All other sections are locked until this is resolved
        </p>
      </GateCard>
    )
  }

  if (forgotLogout) {
    const theme = THEMES.red
    return (
      <GateCard>
        <GateIcon theme={theme}>
          <LogOut size={30} strokeWidth={2.25} style={{ color: "#fff", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.2))" }} />
        </GateIcon>
        <h2 style={{ fontSize: 19, fontWeight: 900, color: "#111", textAlign: "center", margin: "0 0 10px" }}>
          Forgot to Clock Out
        </h2>
        <DatePill theme={theme} date={forgotLogoutDate} />
        <MessageBox theme={theme}>
          You forgot to clock out on this day. Fix your logout time on the Attendance page to continue.
        </MessageBox>
        <PrimaryButton theme={theme} onClick={() => router.push("/member/attendance")} icon={<LogOut size={15} />}>
          Go to Attendance
        </PrimaryButton>
        <SignOutButton />
        <p style={{ fontSize: 11, color: "#D1D5DB", textAlign: "center", marginTop: 12 }}>
          All other sections are locked until this is resolved
        </p>
      </GateCard>
    )
  }

  // missingUpdate
  const theme = THEMES.amber
  return (
    <GateCard>
      <GateIcon theme={theme}>
        <AlertTriangle size={30} strokeWidth={2.25} style={{ color: "#fff", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.2))" }} />
      </GateIcon>
      <h2 style={{ fontSize: 19, fontWeight: 900, color: "#111", textAlign: "center", margin: "0 0 10px" }}>
        Daily Update Missing
      </h2>
      <DatePill theme={theme} date={missingUpdateDate} />
      <MessageBox theme={theme}>
        This day has no work entries logged. Submit the update for it to unlock all features.
      </MessageBox>
      <PrimaryButton theme={theme} onClick={() => router.push("/member/update")} icon={<FileText size={15} />}>
        Submit This Day&apos;s Update
      </PrimaryButton>
      <SignOutButton />
      <p style={{ fontSize: 11, color: "#D1D5DB", textAlign: "center", marginTop: 12 }}>
        All other sections are locked until this is resolved
      </p>
    </GateCard>
  )
}
