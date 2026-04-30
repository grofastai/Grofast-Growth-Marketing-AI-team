"use client"

import { useState, useEffect, useTransition } from "react"
import { LogIn, LogOut, Loader2, Home, Building2, CheckCircle2, Flame, AlertTriangle } from "lucide-react"
import { clockIn, clockOut, markAbsent } from "@/lib/actions/attendance"
import { useRouter } from "next/navigation"

type AttLog = {
  id: string; date: string
  clock_in: string | null; clock_out: string | null
  work_type: string | null; status: string
}
type DailyUpdate = {
  working_hours: number | null
  learning_hours: number | null
  shoot_count: number | null
}

interface Props {
  todayLog: AttLog | null
  weekLogs: AttLog[]
  todayUpdate: DailyUpdate | null
  today: string
  weekStart: string
}

const SHIFT_HOURS = 9 // expected work hours per day
const WEEK_DAYS   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// ── helpers ──────────────────────────────────────────────────────────────────
function fmtTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
}

function calcHours(inIso: string, outIso: string | null): number {
  const end = outIso ? new Date(outIso).getTime() : Date.now()
  return (end - new Date(inIso).getTime()) / 3600000
}

function fmtDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

function fmtHoursShort(h: number): string {
  const hrs  = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

// ── Live timer (isolated so only it re-renders every second) ─────────────────
function LiveTimer({ clockInIso }: { clockInIso: string }) {
  const [secs, setSecs] = useState(() =>
    Math.floor((Date.now() - new Date(clockInIso).getTime()) / 1000)
  )
  useEffect(() => {
    const id = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [clockInIso])
  return (
    <span className="font-mono text-[32px] font-black tracking-tight"
      style={{ fontFamily: "var(--font-jakarta)", color: "#A3E635" }}>
      {fmtDuration(secs)}
    </span>
  )
}

// ── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ hoursWorked }: { hoursWorked: number }) {
  const [pct, setPct] = useState(() => Math.min(hoursWorked / SHIFT_HOURS, 1))
  useEffect(() => {
    const id = setInterval(() => {
      setPct(Math.min(calcHours(/* will recalc via parent */ "", null) / SHIFT_HOURS, 1))
    }, 60000)
    return () => clearInterval(id)
  }, [])
  const filled   = Math.round(pct * 10)
  const empty    = 10 - filled
  const hoursStr = fmtHoursShort(hoursWorked)
  return (
    <div className="space-y-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: filled }).map((_, i) => (
          <div key={i} className="h-2 flex-1 rounded-sm" style={{ background: "#A3E635" }} />
        ))}
        {Array.from({ length: empty }).map((_, i) => (
          <div key={i} className="h-2 flex-1 rounded-sm" style={{ background: "rgba(255,255,255,0.08)" }} />
        ))}
      </div>
      <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>
        {hoursStr} / {SHIFT_HOURS}h
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AttendanceClient({ todayLog, weekLogs, todayUpdate, today, weekStart }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedMode, setSelectedMode] = useState<"wfh" | "office">("office")
  const [confirmAbsent, setConfirmAbsent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAbsent  = todayLog?.status === "absent"
  const isIn      = !!todayLog?.clock_in && !todayLog?.clock_out && todayLog?.status === "present"
  const isDone    = !!todayLog?.clock_in && !!todayLog?.clock_out && todayLog?.status === "present"
  const notLogged = !todayLog

  const hoursWorked = todayLog?.clock_in
    ? calcHours(todayLog.clock_in, todayLog.clock_out)
    : 0

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

  // Status badge
  const statusLabel = isAbsent ? "Absent" : (isIn || isDone) ? "Present" : "Not Logged"
  const statusColor = isAbsent ? "#FF6464" : (isIn || isDone) ? "#A3E635" : "rgba(255,255,255,0.3)"
  const statusDot   = isAbsent ? "#FF6464" : (isIn || isDone) ? "#A3E635" : "#555"

  function handle(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) setError(res.error ?? "Something went wrong")
      else router.refresh()
    })
  }

  // Week grid — build Mon–Sat array from weekStart
  const weekDates = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(weekStart + "T00:00:00")
    d.setDate(d.getDate() + i)
    return d.toISOString().split("T")[0]
  })
  const logByDate = Object.fromEntries(weekLogs.map(l => [l.date, l]))

  // Productivity alert
  let productivity: { icon: "fire" | "warn"; text: string; color: string } | null = null
  if (hoursWorked >= SHIFT_HOURS) {
    productivity = { icon: "fire", text: "You have completed today's work 🔥", color: "#A3E635" }
  } else if (isIn && hoursWorked > 0 && hoursWorked < SHIFT_HOURS * 0.5) {
    productivity = { icon: "warn", text: `You are below expected ${SHIFT_HOURS} hours`, color: "#F59E0B" }
  }

  return (
    <div className="p-8 max-w-[700px]">

      {/* ── 1. Header ── */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-[30px] font-black leading-tight"
            style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
            Attendance
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>{dateStr}</p>
          <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.22)" }}>
            Shift: 9:00 AM – 6:00 PM
          </p>
        </div>
        <div className="flex items-center gap-2 mt-1 px-3 py-1.5 rounded-full"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid #2A2A2A" }}>
          <span className="w-2 h-2 rounded-full" style={{ background: statusDot }} />
          <span className="text-[12px] font-bold" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      {/* ── 2. Main Action Card ── */}
      <div className="rounded-xl p-6 mb-4"
        style={{
          background: "#262626",
          border: isIn
            ? "1px solid rgba(163,230,53,0.25)"
            : isDone ? "1px solid rgba(163,230,53,0.15)"
            : isAbsent ? "1px solid rgba(255,100,100,0.2)"
            : "1px solid #2A2A2A",
        }}>

        {/* STATE 1 — Not logged */}
        {notLogged && (
          <div className="space-y-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-3"
                style={{ color: "rgba(255,255,255,0.25)" }}>Work Mode</p>
              <div className="flex gap-2">
                {(["office", "wfh"] as const).map((mode) => {
                  const Icon   = mode === "wfh" ? Home : Building2
                  const active = selectedMode === mode
                  return (
                    <button key={mode} onClick={() => setSelectedMode(mode)} disabled={isPending}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl text-[13px] font-bold transition-all"
                      style={{
                        background: active ? "#A3E635" : "rgba(255,255,255,0.04)",
                        color: active ? "#0D0D0D" : "rgba(255,255,255,0.4)",
                        border: active ? "none" : "1px solid #2A2A2A",
                      }}>
                      <Icon size={14} />
                      {mode === "wfh" ? "Work From Home" : "Office"}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handle(() => clockIn(selectedMode))}
                disabled={isPending}
                className="flex items-center gap-2 px-7 py-3 rounded-xl text-[14px] font-bold disabled:opacity-50 transition-all"
                style={{ background: "#A3E635", color: "#0D0D0D" }}>
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                Clock In
              </button>
              <button
                onClick={() => setConfirmAbsent(true)}
                disabled={isPending}
                className="text-[12px] font-medium transition-all underline underline-offset-2"
                style={{ color: "rgba(255,100,100,0.5)" }}>
                Mark as Absent
              </button>
            </div>
            {error && <p className="text-[12px]" style={{ color: "#FF7070" }}>{error}</p>}
          </div>
        )}

        {/* STATE 2 — Clocked in */}
        {isIn && todayLog?.clock_in && (
          <div className="space-y-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-1"
                style={{ color: "#A3E635" }}>
                Checked in at {fmtTime(todayLog.clock_in)}
              </p>
              <p className="text-[12px] mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>Working for</p>
              <LiveTimer clockInIso={todayLog.clock_in} />
            </div>
            <ProgressBar hoursWorked={hoursWorked} />
            <button
              onClick={() => handle(clockOut)}
              disabled={isPending}
              className="flex items-center gap-2 px-7 py-3 rounded-xl text-[13px] font-bold disabled:opacity-50 transition-all"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: "#FFFFFF" }}>
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
              Clock Out
            </button>
            {error && <p className="text-[12px]" style={{ color: "#FF7070" }}>{error}</p>}
          </div>
        )}

        {/* STATE 3 — Done */}
        {isDone && todayLog?.clock_in && todayLog?.clock_out && (
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(163,230,53,0.1)" }}>
              <CheckCircle2 size={20} style={{ color: "#A3E635" }} />
            </div>
            <div>
              <p className="text-[15px] font-bold mb-3" style={{ color: "#FFFFFF" }}>
                Completed for today ✓
              </p>
              <div className="space-y-1.5">
                {[
                  { label: "Check-in",  value: fmtTime(todayLog.clock_in)  },
                  { label: "Check-out", value: fmtTime(todayLog.clock_out) },
                  { label: "Total",     value: fmtHoursShort(hoursWorked)  },
                ].map(row => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-[12px] w-20" style={{ color: "rgba(255,255,255,0.35)" }}>{row.label}</span>
                    <span className="text-[13px] font-bold" style={{ color: "#FFFFFF" }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Absent */}
        {isAbsent && (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,100,100,0.08)" }}>
              <span className="text-[18px]">✗</span>
            </div>
            <div>
              <p className="text-[14px] font-bold" style={{ color: "#FFFFFF" }}>Absent Today</p>
              <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                Absence recorded for today.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Absent confirmation dialog ── */}
      {confirmAbsent && (
        <div className="rounded-xl p-5 mb-4"
          style={{ background: "rgba(255,100,100,0.05)", border: "1px solid rgba(255,100,100,0.2)" }}>
          <p className="text-[14px] font-bold mb-1" style={{ color: "#FFFFFF" }}>
            Mark today as absent?
          </p>
          <p className="text-[12px] mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
            This will record your absence for today. This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { handle(markAbsent); setConfirmAbsent(false) }}
              disabled={isPending}
              className="px-5 py-2 rounded-lg text-[13px] font-bold disabled:opacity-50 transition-all"
              style={{ background: "#FF6464", color: "#FFFFFF" }}>
              {isPending ? <Loader2 size={13} className="animate-spin" /> : "Confirm"}
            </button>
            <button
              onClick={() => setConfirmAbsent(false)}
              className="px-5 py-2 rounded-lg text-[13px] font-bold transition-all"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── 4. Today Status Card ── */}
      {(isIn || isDone || isAbsent) && (
        <div className="rounded-xl p-5 mb-4" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3"
            style={{ color: "rgba(255,255,255,0.25)" }}>Today Status</p>
          <div className="space-y-2">
            {[
              { label: "Status",    value: isAbsent ? "Absent" : "Present",
                color: isAbsent ? "#FF6464" : "#A3E635" },
              { label: "Work Mode", value: todayLog?.work_type
                ? (todayLog.work_type === "wfh" ? "Work From Home" : "Office") : "—" },
              { label: "Check-in",  value: fmtTime(todayLog?.clock_in ?? null) },
              { label: "Check-out", value: fmtTime(todayLog?.clock_out ?? null) },
              { label: "Hours",     value: hoursWorked > 0 ? fmtHoursShort(hoursWorked) : "—" },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {row.label}
                </span>
                <span className="text-[13px] font-semibold"
                  style={{ color: (row as { color?: string }).color ?? "#FFFFFF" }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Productivity alert inside status card */}
          {productivity && (
            <div className="flex items-center gap-2 mt-4 pt-4"
              style={{ borderTop: "1px solid #1A1A1A" }}>
              {productivity.icon === "fire"
                ? <Flame size={13} style={{ color: productivity.color }} />
                : <AlertTriangle size={13} style={{ color: productivity.color }} />
              }
              <p className="text-[12px] font-semibold" style={{ color: productivity.color }}>
                {productivity.text}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── 5. Week Summary ── */}
      <div className="rounded-xl p-5 mb-4" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-4"
          style={{ color: "rgba(255,255,255,0.25)" }}>This Week</p>
        <div className="space-y-2">
          {weekDates.map((date, i) => {
            const log       = logByDate[date]
            const isFuture  = date > today
            const isToday   = date === today
            const present   = log?.status === "present"
            const absent    = log?.status === "absent"
            const incomplete = present && !!log?.clock_in && !log?.clock_out && !isToday
            const h = log?.clock_in ? calcHours(log.clock_in, log.clock_out) : 0

            let dot   = "#333"
            let label = "—"
            let color = "rgba(255,255,255,0.2)"

            if (isFuture)       { dot = "#333";     label = "—";       color = "rgba(255,255,255,0.18)" }
            else if (absent)    { dot = "#FF6464";  label = "Absent";  color = "#FF6464" }
            else if (incomplete){ dot = "#F59E0B";  label = `${fmtHoursShort(h)} (incomplete)`; color = "#F59E0B" }
            else if (present)   { dot = "#A3E635";  label = `Present (${fmtHoursShort(h)})`; color = "#A3E635" }
            else if (!isFuture) { dot = "#333";     label = "No record"; color = "rgba(255,255,255,0.18)" }

            return (
              <div key={date}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{
                  background: isToday ? "rgba(163,230,53,0.04)" : "transparent",
                  border: isToday ? "1px solid rgba(163,230,53,0.1)" : "1px solid transparent",
                }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                <span className="text-[12px] font-bold w-8 flex-shrink-0"
                  style={{ color: isToday ? "#A3E635" : "rgba(255,255,255,0.4)" }}>
                  {WEEK_DAYS[i]}
                  {isToday && <span className="text-[9px] ml-1" style={{ color: "#A3E635" }}>•</span>}
                </span>
                <span className="text-[12px] font-medium" style={{ color }}>{label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 6. Work Breakdown (from daily update) ── */}
      {todayUpdate && (todayUpdate.working_hours || todayUpdate.learning_hours) && (
        <div className="rounded-xl p-5" style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-4"
            style={{ color: "rgba(255,255,255,0.25)" }}>Work Breakdown</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Work Hours",    value: todayUpdate.working_hours  ? `${todayUpdate.working_hours}h`  : "—" },
              { label: "Learning",      value: todayUpdate.learning_hours ? `${todayUpdate.learning_hours}h` : "—" },
              { label: "Shoots",        value: todayUpdate.shoot_count    ? `${todayUpdate.shoot_count}`      : "—" },
            ].map(item => (
              <div key={item.label} className="rounded-lg p-3 text-center"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid #1A1A1A" }}>
                <p className="text-[22px] font-black mb-0.5"
                  style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
                  {item.value}
                </p>
                <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
