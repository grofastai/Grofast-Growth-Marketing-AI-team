"use client"

import { useState, useEffect, useTransition, useCallback } from "react"
import Image from "next/image"
import { LogOut, Loader2, Home, Building2, CheckCircle2, AlertTriangle, MapPin, TrendingUp, Calendar, Target, Clock, LogIn, CalendarSearch } from "lucide-react"
import { clockIn, clockOut, markAbsent, breakIn, breakOut, resumeAttendance, getAttendanceByDate, manualClockOut } from "@/lib/actions/attendance"
import { useRouter } from "next/navigation"

const OFFICE_LAT     = parseFloat(process.env.NEXT_PUBLIC_OFFICE_LAT     ?? "12.415145713024462")
const OFFICE_LNG     = parseFloat(process.env.NEXT_PUBLIC_OFFICE_LNG     ?? "78.22769145276305")
const OFFICE_RADIUS  = parseFloat(process.env.NEXT_PUBLIC_OFFICE_RADIUS_METERS ?? "500")
const OFFICE_CHECK_ENABLED = !isNaN(OFFICE_LAT) && !isNaN(OFFICE_LNG)

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

type BreakSession = { in: string; out: string | null; mins: number | null }
type AttLog = { id: string; date: string; clock_in: string | null; clock_out: string | null; break_in: string | null; break_out: string | null; break_total_mins: number; break_sessions: BreakSession[] | null; work_type: string | null; status: string }
type DailyUpdate = { working_hours: number | null; learning_hours: number | null; shoot_count: number | null }

interface Props {
  todayLog: AttLog | null; weekLogs: AttLog[]; todayUpdate: DailyUpdate | null; today: string; weekStart: string
}

const SHIFT_HOURS = 9
const WEEK_DAYS   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function fmtTime(iso: string | null) {
  if (!iso) return "--:--"
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
}
function calcHours(inIso: string, outIso: string | null): number {
  return ((outIso ? new Date(outIso).getTime() : Date.now()) - new Date(inIso).getTime()) / 3600000
}
function calcHoursNet(inIso: string, outIso: string | null, breakTotalMins: number, currentBreakInIso: string | null): number {
  const raw = calcHours(inIso, outIso)
  // Subtract completed breaks (accumulated) + any in-progress break
  const currentBreakHrs = currentBreakInIso
    ? (Date.now() - new Date(currentBreakInIso).getTime()) / 3600000
    : 0
  return Math.max(0, raw - breakTotalMins / 60 - currentBreakHrs)
}
function fmtDuration(s: number) {
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}
function fmtHoursShort(h: number) {
  const hrs = Math.floor(h); const mins = Math.round((h - hrs) * 60)
  return mins === 0 ? `${hrs}h` : `${hrs}h ${mins}m`
}
function fmtTimeFromIso(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
}
function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

function LiveTimer({ clockInIso }: { clockInIso: string }) {
  const [secs, setSecs] = useState(() => Math.floor((Date.now() - new Date(clockInIso).getTime()) / 1000))
  useEffect(() => { const id = setInterval(() => setSecs(s => s + 1), 1000); return () => clearInterval(id) }, [clockInIso])
  return (
    <span className="font-mono text-[44px] font-black tracking-tight leading-none" style={{ color: "#de1a1a", fontFamily: "var(--font-jakarta)" }}>
      {fmtDuration(secs)}
    </span>
  )
}

function SegmentBar({ hoursWorked }: { hoursWorked: number }) {
  const filled = Math.min(Math.round((hoursWorked / SHIFT_HOURS) * 10), 10)
  return (
    <div className="flex gap-1 mt-3 mb-1">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-2 flex-1 rounded-full" style={{ background: i < filled ? "#de1a1a" : "rgba(0,0,0,0.08)" }} />
      ))}
    </div>
  )
}

export default function AttendanceClient({ todayLog, weekLogs, todayUpdate, today, weekStart }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedMode, setSelectedMode] = useState<"wfh" | "office">("office")
  const [confirmAbsent, setConfirmAbsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  const [historyDate, setHistoryDate] = useState("")
  const [historyLog, setHistoryLog] = useState<{
    clock_in: string | null; clock_out: string | null; work_type: string | null; status: string
  } | null | "loading" | "empty">(null)
  const [manualTime, setManualTime] = useState("")
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualSaved, setManualSaved] = useState(false)

  const handleLogIn = useCallback(() => {
    setError(null)
    if (selectedMode === "office" && OFFICE_CHECK_ENABLED) {
      if (!navigator.geolocation) { setError("Location not supported by this browser."); return }
      setGeoLoading(true)

      const doClockIn = () =>
        startTransition(async () => { const res = await clockIn(selectedMode); if (!res.success) setError(res.error ?? "Error"); else router.refresh() })

      const checkPosition = (pos: GeolocationPosition) => {
        setGeoLoading(false)
        if (pos.coords.accuracy > OFFICE_RADIUS) { doClockIn(); return }
        const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, OFFICE_LAT, OFFICE_LNG)
        if (dist > OFFICE_RADIUS) { setError(`You are ${Math.round(dist)}m from the office (max ${OFFICE_RADIUS}m).`); return }
        doClockIn()
      }

      // Try high-accuracy first; on timeout fall back to network-based location
      navigator.geolocation.getCurrentPosition(
        checkPosition,
        (err) => {
          if (err.code === err.TIMEOUT) {
            navigator.geolocation.getCurrentPosition(
              checkPosition,
              (err2) => {
                setGeoLoading(false)
                if (err2.code === err2.PERMISSION_DENIED) {
                  setError("Location permission denied. Enable it in your browser settings.")
                } else {
                  setError("Could not get your location. Try again or switch to WFH mode.")
                }
              },
              { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false }
            )
          } else if (err.code === err.PERMISSION_DENIED) {
            setGeoLoading(false)
            setError("Location permission denied. Enable it in your browser settings.")
          } else {
            setGeoLoading(false)
            setError("Location unavailable. Check your device GPS and try again.")
          }
        },
        { timeout: 12000, maximumAge: 30000, enableHighAccuracy: true }
      )
    } else {
      startTransition(async () => { const res = await clockIn(selectedMode); if (!res.success) setError(res.error ?? "Error"); else router.refresh() })
    }
  }, [selectedMode, router, startTransition])

  function handle(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => { const res = await fn(); if (!res.success) setError(res.error ?? "Error"); else router.refresh() })
  }

  async function handleHistoryDate(date: string) {
    setHistoryDate(date)
    setManualTime("")
    setManualError(null)
    setManualSaved(false)
    if (!date) { setHistoryLog(null); return }
    setHistoryLog("loading")
    const res = await getAttendanceByDate(date)
    if (!res.success || !res.log) setHistoryLog("empty")
    else setHistoryLog(res.log)
  }

  function handleManualClockOut() {
    if (!historyDate || !manualTime) return
    setManualError(null)
    setManualSaved(false)
    startTransition(async () => {
      const res = await manualClockOut(historyDate, manualTime)
      if (!res.success) {
        setManualError(res.error ?? "Failed to save logout time.")
      } else {
        setManualSaved(true)
        const updated = await getAttendanceByDate(historyDate)
        if (updated.success && updated.log) setHistoryLog(updated.log)
      }
    })
  }

  const isAbsent  = todayLog?.status === "absent"
  const isIn      = !!todayLog?.clock_in && !todayLog?.clock_out && todayLog?.status === "present"
  const isDone    = !!todayLog?.clock_in && !!todayLog?.clock_out && todayLog?.status === "present"
  const notLogged = !todayLog

  const isOnBreak       = !!todayLog?.break_in && !todayLog?.break_out
  const breakTotalMins  = todayLog?.break_total_mins ?? 0
  // Minutes into current active break (if on break right now)
  const currentBreakMins = isOnBreak && todayLog?.break_in
    ? Math.round((Date.now() - new Date(todayLog.break_in).getTime()) / 60000)
    : 0
  const hoursWorked    = todayLog?.clock_in
    ? calcHoursNet(todayLog.clock_in, todayLog.clock_out, breakTotalMins, todayLog.break_in ?? null)
    : 0
  const remainingHours = Math.max(SHIFT_HOURS - hoursWorked, 0)

  const dateStr    = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const statusLabel = isAbsent ? "Absent" : (isIn || isDone) ? "Present" : "Not Logged"
  const statusGreen = (isIn || isDone) && !isAbsent

  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const logByDate = Object.fromEntries(weekLogs.map(l => [l.date, l]))

  const isBelowExpected  = isIn && hoursWorked > 0 && hoursWorked < SHIFT_HOURS

  const presentCount    = weekLogs.filter(l => l.status === "present").length
  const absentCount     = weekLogs.filter(l => l.status === "absent").length
  const wfhCount        = weekLogs.filter(l => l.work_type === "wfh" && l.status === "present").length
  const officeCount     = weekLogs.filter(l => l.work_type === "office" && l.status === "present").length
  const totalWeekHours  = weekLogs.filter(l => l.clock_in && l.status === "present").reduce((sum, l) => {
    if (!l.clock_out) return l.date === today ? sum + calcHours(l.clock_in!, null) : sum
    return sum + calcHours(l.clock_in!, l.clock_out)
  }, 0)

  return (
    <div className="p-5 md:p-6 xl:p-8 max-w-[1400px]" style={{ background: "#F1F2F6", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-[32px] font-black leading-tight" style={{ color: "#111111", fontFamily: "var(--font-jakarta)" }}>Attendance</h1>
          <p className="text-[13px] font-medium mt-1" style={{ color: "#6B7280" }}>{dateStr}</p>
          <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>Shift: 9:00 AM – 6:00 PM</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full mt-2"
          style={{ background: "#FFFFFF", border: "1px solid #E8E9EF", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div className="w-2 h-2 rounded-full" style={{ background: statusGreen ? "#22C55E" : isAbsent ? "#EF4444" : "#9CA3AF" }} />
          <span className="text-[13px] font-bold" style={{ color: statusGreen ? "#16A34A" : isAbsent ? "#EF4444" : "#6B7280" }}>{statusLabel}</span>
        </div>
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_360px_260px] gap-5 mb-5">

        {/* LEFT — Character + Timer card */}
        <div className="rounded-3xl overflow-hidden" style={{ background: "#FFFFFF", boxShadow: "0 4px 32px rgba(0,0,0,0.09)" }}>

          {/* ── Cinematic hero image ── */}
          <div className="relative w-full h-[180px] md:h-[280px] lg:h-[380px]" style={{ background: "#1a1008" }}>
            <Image
              src="/brand/cinematic-boy.png"
              alt="Working character"
              fill
              style={{ objectFit: "cover", objectPosition: "center 10%" }}
            />
            {/* Fade-out at bottom */}
            <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
              style={{ background: "linear-gradient(to top, #FFFFFF 5%, transparent)" }} />
          </div>

          {/* ── Timer / action inner card ── */}
          <div className="px-5 pb-5 -mt-2">
            <div className="rounded-2xl p-5" style={{ background: "#FFFFFF", boxShadow: "0 2px 16px rgba(0,0,0,0.07)", border: "1px solid #F0F0F0" }}>

              {/* NOT LOGGED IN */}
              {notLogged && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[12px] font-semibold mb-2" style={{ color: "#9CA3AF" }}>Select Work Mode</p>
                    <div className="flex gap-2">
                      {(["office", "wfh"] as const).map((mode) => {
                        const Icon = mode === "wfh" ? Home : Building2
                        const active = selectedMode === mode
                        return (
                          <button key={mode} onClick={() => setSelectedMode(mode)} disabled={isPending}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                            style={{ background: active ? "#de1a1a" : "#F9FAFB", color: active ? "#FFFFFF" : "#6B7280", border: active ? "none" : "1px solid #E5E7EB" }}>
                            <Icon size={14} />{mode === "wfh" ? "Work From Home" : "Office"}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={handleLogIn} disabled={isPending || geoLoading}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[14px] font-bold disabled:opacity-50 transition-all"
                      style={{ background: "#de1a1a", color: "#FFFFFF" }}>
                      {geoLoading ? <><MapPin size={14} className="animate-pulse" />Verifying…</> : isPending ? <Loader2 size={14} className="animate-spin" /> : <><LogIn size={14} />Log In</>}
                    </button>
                    <button onClick={() => setConfirmAbsent(true)} disabled={isPending}
                      className="text-[12px] font-medium underline underline-offset-2" style={{ color: "#EF4444" }}>
                      Mark Absent
                    </button>
                  </div>
                  {error && <p className="text-[12px] font-medium" style={{ color: "#EF4444" }}>{error}</p>}
                </div>
              )}

              {/* CLOCKED IN */}
              {isIn && todayLog?.clock_in && (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-[13px] font-bold" style={{ color: "#111111" }}>
                        Logged in at {fmtTime(todayLog.clock_in)}
                      </p>
                      <CheckCircle2 size={15} style={{ color: "#22C55E" }} />
                    </div>
                    <p className="text-[12px] mb-1.5" style={{ color: "#9CA3AF" }}>Working for</p>
                    <LiveTimer clockInIso={todayLog.clock_in} />
                    <SegmentBar hoursWorked={hoursWorked} />
                    <p className="text-[12px] mb-4" style={{ color: "#9CA3AF" }}>
                      {fmtHoursShort(hoursWorked)} / {SHIFT_HOURS}h
                    </p>
                    <button onClick={() => handle(clockOut)} disabled={isPending}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[14px] font-bold disabled:opacity-50 transition-all"
                      style={{ background: "#de1a1a", color: "#FFFFFF" }}>
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                      Log Out
                    </button>
                    {/* Break buttons — multiple breaks allowed */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {!isOnBreak && (
                        <button onClick={() => handle(breakIn)} disabled={isPending}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold disabled:opacity-50"
                          style={{ border: "1.5px solid #F59E0B", background: "rgba(245,158,11,0.08)", color: "#D97706" }}>
                          ☕ Break In
                        </button>
                      )}
                      {isOnBreak && (
                        <button onClick={() => handle(breakOut)} disabled={isPending}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold disabled:opacity-50"
                          style={{ border: "1.5px solid #22C55E", background: "rgba(34,197,94,0.08)", color: "#16A34A" }}>
                          ▶ Break Out
                        </button>
                      )}
                      {isOnBreak && (
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold"
                          style={{ border: "1.5px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.07)", color: "#D97706" }}>
                          ☕ On break · {currentBreakMins}m
                        </div>
                      )}
                      {breakTotalMins > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-semibold"
                          style={{ border: "1.5px solid #E5E7EB", background: "#F9FAFB", color: "#6B7280" }}>
                          Total break: {breakTotalMins}m
                        </div>
                      )}
                    </div>
                    {/* Break timeline */}
                    {(todayLog?.break_sessions?.length ?? 0) > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Break History</p>
                        {(todayLog?.break_sessions ?? []).map((s, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: "#6B7280" }}>
                            <span className="font-semibold" style={{ color: "#374151" }}>Break {i + 1}</span>
                            <span>·</span>
                            <span>{fmtTimeFromIso(s.in)}</span>
                            <span>–</span>
                            <span>{s.out ? fmtTimeFromIso(s.out) : <span style={{ color: "#F59E0B" }}>ongoing</span>}</span>
                            {s.mins != null && <><span>·</span><span style={{ color: "#16A34A" }}>{s.mins} min</span></>}
                          </div>
                        ))}
                      </div>
                    )}
                    {error && <p className="text-[12px] mt-2" style={{ color: "#EF4444" }}>{error}</p>}
                  </div>
                  {/* Large alarm clock illustration */}
                  <div className="flex-shrink-0 relative" style={{ width: 160, height: 160 }}>
                    <Image src="/brand/character-desk.png" alt="Alarm clock" fill style={{ objectFit: "contain" }} />
                  </div>
                </div>
              )}

              {/* DONE */}
              {isDone && todayLog?.clock_in && todayLog?.clock_out && (
                <div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(34,197,94,0.1)" }}>
                      <CheckCircle2 size={24} style={{ color: "#22C55E" }} />
                    </div>
                    <div>
                      <p className="text-[15px] font-bold mb-2" style={{ color: "#111111" }}>Completed for today ✓</p>
                      <div className="flex gap-6 flex-wrap">
                        {[
                          { label: "Log In",  value: fmtTime(todayLog.clock_in) },
                          { label: "Log Out", value: fmtTime(todayLog.clock_out) },
                          { label: "Break",   value: breakTotalMins > 0 ? `${breakTotalMins}m` : "—" },
                          { label: "Total",   value: fmtHoursShort(hoursWorked) },
                        ].map(r => (
                          <div key={r.label}>
                            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{r.label}</p>
                            <p className="text-[14px] font-bold" style={{ color: "#111111" }}>{r.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Overtime resume */}
                  <button
                    onClick={() => handle(() => resumeAttendance(today))}
                    disabled={isPending}
                    className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-[13px] font-bold transition-all"
                    style={{ background: "rgba(222,26,26,0.08)", border: "1.5px dashed rgba(222,26,26,0.3)", color: "#de1a1a", cursor: "pointer" }}>
                    {isPending ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <TrendingUp size={14} />}
                    Continue Working (Overtime)
                  </button>
                </div>
              )}

              {/* ABSENT */}
              {isAbsent && (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(239,68,68,0.08)" }}>
                    <span className="text-[20px]">✗</span>
                  </div>
                  <div>
                    <p className="text-[15px] font-bold" style={{ color: "#111111" }}>Absent Today</p>
                    <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>Absence recorded for today.</p>
                  </div>
                </div>
              )}

            </div>{/* inner timer card */}
          </div>{/* px-5 pb-5 */}
        </div>{/* outer card */}

        {/* RIGHT — Today Status + This Week */}
        <div className="space-y-4">

          {/* Today Status */}
          <div className="rounded-3xl p-5" style={{ background: "#FFFFFF", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(222,26,26,0.1)" }}>
                <Clock size={16} style={{ color: "#de1a1a" }} />
              </div>
              <h3 className="text-[15px] font-bold" style={{ color: "#111111" }}>Today Status</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: "Status",    value: isAbsent ? "Absent" : (isIn || isDone) ? "Present" : "Not Logged", color: isAbsent ? "#EF4444" : (isIn || isDone) ? "#22C55E" : "#9CA3AF" },
                { label: "Work Mode", value: todayLog?.work_type ? (todayLog.work_type === "wfh" ? "Work From Home" : "Office") : "—", color: "#111111" },
                { label: "Log In",    value: fmtTime(todayLog?.clock_in ?? null), color: "#111111" },
                { label: "Log Out",   value: fmtTime(todayLog?.clock_out ?? null), color: "#111111" },
                { label: "Break",     value: isOnBreak ? `In progress (${currentBreakMins}m)` : breakTotalMins > 0 ? `${breakTotalMins}m taken` : "—", color: isOnBreak ? "#D97706" : breakTotalMins > 0 ? "#F59E0B" : "#9CA3AF" },
                { label: "Hours",     value: hoursWorked > 0 ? `${fmtHoursShort(hoursWorked)} / ${SHIFT_HOURS}h` : "—", color: hoursWorked > 0 ? "#de1a1a" : "#9CA3AF" },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: "#9CA3AF" }}>{row.label}</span>
                  <span className="text-[13px] font-semibold" style={{ color: row.color }}>{row.value}</span>
                </div>
              ))}
            </div>
            {isBelowExpected && (
              <div className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-xl"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <AlertTriangle size={13} style={{ color: "#F59E0B" }} />
                <p className="text-[12px] font-semibold" style={{ color: "#D97706" }}>
                  You are below expected {SHIFT_HOURS} hours
                </p>
              </div>
            )}
          </div>

          {/* This Week */}
          <div className="rounded-3xl p-5 relative overflow-hidden" style={{ background: "#FFFFFF", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            {/* Calendar illustration — right side */}
            <div className="absolute right-2 bottom-2 w-28 h-28 opacity-90 pointer-events-none">
              <Image src="/brand/tasks-complete.png" alt="" fill style={{ objectFit: "contain" }} />
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(222,26,26,0.1)" }}>
                <Calendar size={16} style={{ color: "#de1a1a" }} />
              </div>
              <h3 className="text-[15px] font-bold" style={{ color: "#111111" }}>This Week</h3>
            </div>

            <div className="space-y-1 pr-20">
              {weekDates.map((date, i) => {
                const log        = logByDate[date]
                const isFuture   = date > today
                const isToday    = date === today
                const present    = log?.status === "present"
                const absent     = log?.status === "absent"
                // Only count hours up to clock_out; for past days with no clock_out use 0
                const h = log?.clock_in
                  ? (log.clock_out ? calcHours(log.clock_in, log.clock_out) : (isToday ? calcHours(log.clock_in, null) : 0))
                  : 0

                let dot = "#D1D5DB"; let label = "No record"; let color = "#9CA3AF"
                if (isFuture)    { dot = "#E5E7EB"; label = "—"; color = "rgba(0,0,0,0.1)" }
                else if (absent) { dot = "#EF4444"; label = "Absent"; color = "#EF4444" }
                else if (present){ dot = isToday ? "#de1a1a" : "#22C55E"; label = h > 0 ? `Present · ${fmtHoursShort(h)}` : "Present"; color = isToday ? "#de1a1a" : "#16A34A" }

                return (
                  <div key={date} className="flex items-center gap-3 px-3 py-2 rounded-xl transition-all"
                    style={{ background: isToday ? "rgba(222,26,26,0.06)" : "transparent" }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                    <span className="text-[12px] font-bold w-8 flex-shrink-0"
                      style={{ color: isToday ? "#de1a1a" : "#374151" }}>{WEEK_DAYS[i]}</span>
                    <span className="text-[12px] font-medium" style={{ color }}>{label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* THIRD COL — Week Performance + Tips (xl only) */}
        <div className="hidden xl:block space-y-4">

          {/* Week Performance */}
          <div className="rounded-3xl p-5" style={{ background: "#FFFFFF", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.1)" }}>
                <Target size={16} style={{ color: "#6366F1" }} />
              </div>
              <h3 className="text-[15px] font-bold" style={{ color: "#111111" }}>Week Performance</h3>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { label: "Present", value: presentCount, color: "#22C55E", bg: "rgba(34,197,94,0.08)" },
                { label: "Absent",  value: absentCount,  color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
                { label: "Office",  value: officeCount,  color: "#6366F1", bg: "rgba(99,102,241,0.08)" },
                { label: "WFH",     value: wfhCount,     color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
              ].map(stat => (
                <div key={stat.label} className="rounded-2xl p-3 text-center" style={{ background: stat.bg }}>
                  <p className="text-[24px] font-black leading-none mb-1" style={{ color: stat.color, fontFamily: "var(--font-jakarta)" }}>
                    {stat.value}
                    <span className="text-[11px] font-semibold opacity-60">/7</span>
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: stat.color }}>{stat.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.12)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#de1a1a" }}>Total Hours This Week</p>
              <p className="text-[22px] font-black leading-none" style={{ color: "#de1a1a", fontFamily: "var(--font-jakarta)" }}>
                {totalWeekHours > 0 ? fmtHoursShort(totalWeekHours) : "0h"}
              </p>
            </div>
          </div>

        </div>{/* end third col */}

      </div>

      {/* ── Absent confirm ── */}
      {confirmAbsent && (
        <div className="rounded-2xl p-5 mb-5" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <p className="text-[14px] font-bold mb-1" style={{ color: "#111111" }}>Mark today as absent?</p>
          <p className="text-[12px] mb-4" style={{ color: "#6B7280" }}>This will record your absence. Cannot be undone.</p>
          <div className="flex gap-3">
            <button onClick={() => { handle(markAbsent); setConfirmAbsent(false) }} disabled={isPending}
              className="px-5 py-2 rounded-xl text-[13px] font-bold disabled:opacity-50"
              style={{ background: "#EF4444", color: "#FFFFFF" }}>
              {isPending ? <Loader2 size={13} className="animate-spin" /> : "Confirm Absent"}
            </button>
            <button onClick={() => setConfirmAbsent(false)}
              className="px-5 py-2 rounded-xl text-[13px] font-bold"
              style={{ background: "#F3F4F6", color: "#374151" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Daily Insight + Summary ── */}
      <div className="rounded-3xl p-5 relative overflow-hidden" style={{ background: "#FFFFFF", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        {/* Target illustration */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 w-24 h-24 opacity-90 pointer-events-none">
          <Image src="/brand/tasks-complete.png" alt="" fill style={{ objectFit: "contain" }} />
        </div>

        <div className="flex flex-col md:flex-row md:items-center gap-6 pr-28">
          {/* Daily Insight label */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.1)" }}>
              <TrendingUp size={16} style={{ color: "#6366F1" }} />
            </div>
            <div>
              <p className="text-[14px] font-bold" style={{ color: "#111111" }}>Daily Insight</p>
              <p className="text-[12px]" style={{ color: "#9CA3AF" }}>
                {hoursWorked >= SHIFT_HOURS ? "Great work! Target reached 🔥" : hoursWorked > 0 ? "Keep going! You're doing great." : "Log in to start your day."}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4 flex-wrap">
            <div className="rounded-2xl px-5 py-3" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.12)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#6366F1" }}>Working Hours</p>
              <p className="text-[22px] font-black leading-none" style={{ color: "#6366F1", fontFamily: "var(--font-jakarta)" }}>
                {hoursWorked > 0 ? fmtHoursShort(hoursWorked) : "0h"}
              </p>
            </div>
            <div className="rounded-2xl px-5 py-3" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.12)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#D97706" }}>Expected</p>
              <p className="text-[22px] font-black leading-none" style={{ color: "#D97706", fontFamily: "var(--font-jakarta)" }}>
                {SHIFT_HOURS}h 00m
              </p>
            </div>
            <div className="rounded-2xl px-5 py-3" style={{ background: "rgba(222,26,26,0.06)", border: "1px solid rgba(222,26,26,0.12)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#de1a1a" }}>Remaining</p>
              <p className="text-[22px] font-black leading-none" style={{ color: "#de1a1a", fontFamily: "var(--font-jakarta)" }}>
                {remainingHours > 0 ? fmtHoursShort(remainingHours) : "0h"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── View Past Attendance ─────────────────────────────────────── */}
      <div className="rounded-3xl p-5 mt-5" style={{ background: "#FFFFFF", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.1)" }}>
            <CalendarSearch size={16} style={{ color: "#6366F1" }} />
          </div>
          <div>
            <h3 className="text-[15px] font-bold" style={{ color: "#111111" }}>View Past Attendance</h3>
            <p className="text-[11px]" style={{ color: "#9CA3AF" }}>Select a date to see your log</p>
          </div>
        </div>

        <input
          type="date"
          max={today}
          value={historyDate}
          onChange={e => handleHistoryDate(e.target.value)}
          className="rounded-xl px-3 py-2 text-[13px] font-semibold mb-4 block"
          style={{ border: "1.5px solid #EBEDF2", outline: "none", color: "#111111", background: "#F9FAFB" }}
        />

        {historyLog === "loading" && (
          <p className="text-[13px]" style={{ color: "#9CA3AF" }}>Loading…</p>
        )}
        {historyLog === "empty" && (
          <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No attendance record found for this date.</p>
        )}
        {historyLog && historyLog !== "loading" && historyLog !== "empty" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Status",    value: historyLog.status === "present" ? "Present" : "Absent", color: historyLog.status === "present" ? "#22C55E" : "#EF4444" },
                { label: "Work Mode", value: historyLog.work_type === "wfh" ? "WFH" : historyLog.work_type === "office" ? "Office" : "—", color: "#111111" },
                { label: "Log In",    value: fmtTime(historyLog.clock_in), color: "#111111" },
                { label: "Log Out",   value: historyLog.clock_out ? fmtTime(historyLog.clock_out) : "—", color: historyLog.clock_out ? "#111111" : "#EF4444" },
              ].map(r => (
                <div key={r.label} className="rounded-2xl p-3" style={{ background: "#F9FAFB", border: "1px solid #EBEDF2" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "#9CA3AF" }}>{r.label}</p>
                  <p className="text-[14px] font-bold" style={{ color: r.color }}>{r.value}</p>
                </div>
              ))}
            </div>

            {/* Manual clock-out: shown only when logged in but forgot to log out */}
            {historyLog.status === "present" && historyLog.clock_in && !historyLog.clock_out && !manualSaved && (
              <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(245,158,11,0.06)", border: "1.5px solid rgba(245,158,11,0.25)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={14} style={{ color: "#D97706" }} />
                  <p className="text-[13px] font-bold" style={{ color: "#D97706" }}>No logout recorded</p>
                </div>
                <p className="text-[12px] mb-3" style={{ color: "#9CA3AF" }}>
                  You forgot to log out on this day. Enter your actual logout time below.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <input
                    type="time"
                    value={manualTime}
                    onChange={e => setManualTime(e.target.value)}
                    className="rounded-xl px-3 py-2 text-[13px] font-semibold"
                    style={{ border: "1.5px solid #EBEDF2", outline: "none", color: "#111111", background: "#FFFFFF" }}
                  />
                  <button
                    onClick={handleManualClockOut}
                    disabled={isPending || !manualTime}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-bold disabled:opacity-50 transition-all"
                    style={{ background: "#D97706", color: "#FFFFFF" }}>
                    {isPending ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
                    Save Logout Time
                  </button>
                </div>
                {manualError && <p className="text-[12px] mt-2 font-medium" style={{ color: "#EF4444" }}>{manualError}</p>}
              </div>
            )}

            {manualSaved && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl px-4 py-3"
                style={{ background: "rgba(34,197,94,0.08)", border: "1.5px solid rgba(34,197,94,0.2)" }}>
                <CheckCircle2 size={15} style={{ color: "#22C55E" }} />
                <p className="text-[13px] font-bold" style={{ color: "#16A34A" }}>Logout time saved successfully.</p>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}
