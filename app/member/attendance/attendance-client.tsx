"use client"

import { useState, useEffect, useTransition, useCallback, Fragment } from "react"
import Image from "next/image"
import { LogOut, Loader2, Home, Building2, Camera, CheckCircle2, AlertTriangle, MapPin, TrendingUp, Calendar, Target, Clock, LogIn, CalendarSearch, RotateCcw, Palmtree } from "lucide-react"
import { clockIn, clockOut, resumeAttendance, getAttendanceByDate, manualClockOut, getAttendanceRange, editAttendanceTimes } from "@/lib/actions/attendance"
import { submitWfhAttendanceRequest } from "@/lib/actions/leaves"
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
type AttLog = { id: string; date: string; clock_in: string | null; clock_out: string | null; break_in: string | null; break_out: string | null; break_total_mins: number; break_sessions: BreakSession[] | null; work_type: string | null; status: string; paused_seconds: number }
type DailyUpdate = { working_hours: number | null; learning_hours: number | null; shoot_count: number | null }
type RangeLog = { id: string; date: string; clock_in: string | null; clock_out: string | null; break_total_mins: number; break_in: string | null; break_out: string | null; work_type: string | null; status: string; learning_hours: number; worked_hours: number; entries_break_hours: number }
type RangeMode = "date" | "last7" | "thisMonth" | "lastMonth"

interface MonthlyPerf {
  presentDays: number; absentDays: number; officeDays: number; wfhDays: number; shootDays?: number
  leaveDays: number; pendingLeaves: number; totalHours: number; avgHours: number
  loginHours?: number; avgLoginHours?: number
}

interface Props {
  todayLog: AttLog | null; weekLogs: AttLog[]; todayUpdate: DailyUpdate | null; today: string; weekStart: string
  todayPermissionHours?: number; permHoursByDate?: Record<string, number>
  weekUpdatesByDate?: Record<string, number>
  monthlyPerf?: MonthlyPerf
  todayApprovedLeave?: { leave_type: string; reason: string | null; half_day_from_time?: string | null; half_day_to_time?: string | null } | null
  todayWfhLeave?: { leave_type: string; status: string; created_at: string } | null
  isMedia?: boolean
  yesterdayStatus?: 'ok' | 'no_login' | 'no_logout' | 'missing_update'
  yesterdayStr?: string
}

const SHIFT_HOURS = 8.5
const WEEK_DAYS   = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function fmtTime(iso: string | null) {
  if (!iso) return "--:--"
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
}
function calcHours(inIso: string, outIso: string | null): number {
  return ((outIso ? new Date(outIso).getTime() : Date.now()) - new Date(inIso).getTime()) / 3600000
}
function calcHoursNet(inIso: string, outIso: string | null, breakTotalMins: number, currentBreakInIso: string | null, pausedSeconds = 0): number {
  const raw = calcHours(inIso, outIso)
  const currentBreakHrs = currentBreakInIso
    ? (Date.now() - new Date(currentBreakInIso).getTime()) / 3600000
    : 0
  const safePaused = Math.max(0, pausedSeconds ?? 0)
  return Math.max(0, raw - breakTotalMins / 60 - currentBreakHrs - safePaused / 3600)
}
function fmtDuration(s: number) {
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}
function fmtHoursShort(h: number) {
  let hrs = Math.floor(h); let mins = Math.round((h - hrs) * 60)
  if (mins === 60) { hrs += 1; mins = 0 }
  return mins === 0 ? `${hrs}h` : `${hrs}h ${mins}m`
}
function fmtTimeFromIso(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })
}
function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split("-").map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}
// Generate every date from `from` to `to` (inclusive, descending, capped at today)
function allDatesInRange(from: string, to: string, today: string): string[] {
  const cap = to > today ? today : to
  const dates: string[] = []
  let cur = cap
  while (cur >= from) { dates.push(cur); cur = addDays(cur, -1) }
  return dates
}

function LiveTimer({ clockInIso, pausedSeconds, breakTotalMins = 0, currentBreakInIso = null }: {
  clockInIso: string; pausedSeconds: number; breakTotalMins?: number; currentBreakInIso?: string | null
}) {
  function netSecs() {
    const raw       = (Date.now() - new Date(clockInIso).getTime()) / 1000
    const completed = breakTotalMins * 60
    const ongoing   = currentBreakInIso ? (Date.now() - new Date(currentBreakInIso).getTime()) / 1000 : 0
    const safePaused = Math.max(0, pausedSeconds ?? 0)
    return Math.max(0, Math.floor(raw - safePaused - completed - ongoing))
  }
  const [secs, setSecs] = useState(netSecs)
  useEffect(() => {
    if (currentBreakInIso) { setSecs(netSecs()); return }   // freeze timer during break
    const id = setInterval(() => setSecs(netSecs()), 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockInIso, currentBreakInIso, breakTotalMins, pausedSeconds])
  return (
    <span className="font-mono text-[28px] sm:text-[44px] font-black tracking-tight leading-none whitespace-nowrap"
      style={{ color: currentBreakInIso ? "#9CA3AF" : "#de1a1a", fontFamily: "var(--font-jakarta)" }}>
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

export default function AttendanceClient({ todayLog, weekLogs, todayUpdate, today, weekStart, todayPermissionHours = 0, permHoursByDate = {}, weekUpdatesByDate = {}, monthlyPerf, todayApprovedLeave, todayWfhLeave, isMedia = false, yesterdayStatus = 'ok', yesterdayStr = '' }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedMode, setSelectedMode] = useState<"wfh" | "office" | "shoot">(
    todayWfhLeave?.status === "approved" ? (todayWfhLeave.leave_type === "shoot_day" ? "shoot" : "wfh") : "office"
  )
  const [error, setError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)
  // Yesterday block state
  const [yesLogoutTime, setYesLogoutTime] = useState("")
  const [yesLogoutSaving, setYesLogoutSaving] = useState(false)
  const [yesLogoutSaved, setYesLogoutSaved] = useState(false)
  const [yesLogoutError, setYesLogoutError] = useState<string | null>(null)
  // Clock-out 12h confirmation
  const [showClockOutConfirm, setShowClockOutConfirm] = useState(false)
  // 13h+ confirmation for manually-entered logout times (yesterday-block and edit-times flows)
  const [pendingTimeConfirm, setPendingTimeConfirm] = useState<{ kind: "yesterday" | "edit"; message: string } | null>(null)
  const [historyDate, setHistoryDate] = useState("")
  const [historyLog, setHistoryLog] = useState<{
    clock_in: string | null; clock_out: string | null; work_type: string | null; status: string
  } | null | "loading" | "empty">(null)
  const [manualTime, setManualTime] = useState("")
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualSaved, setManualSaved] = useState(false)
  // Range filter — defaults to "This Month" so a filtered view loads immediately
  const [rangeMode, setRangeMode]       = useState<RangeMode>("thisMonth")
  const [rangeLogs, setRangeLogs]       = useState<RangeLog[] | null>(null)
  const [rangeLeaveDates, setRangeLeaveDates] = useState<string[]>([])
  const [rangeHolidayDates, setRangeHolidayDates] = useState<{ date: string; name: string }[]>([])
  const [rangeLoading, setRangeLoading] = useState(false)
  const [customFrom, setCustomFrom]     = useState("")
  const [customTo, setCustomTo]         = useState("")
  const [rangeFrom, setRangeFrom]       = useState("")
  const [rangeTo, setRangeTo]           = useState("")
  // Auto-load "This Month" once on mount, since it's now the default filter
  useEffect(() => { handleRangeFilter("thisMonth") }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Login/logout edit
  const [editingDate, setEditingDate]   = useState<string | null>(null)
  const [editCIn, setEditCIn]           = useState("")
  const [editCOut, setEditCOut]         = useState("")
  const [editBrkIn, setEditBrkIn]       = useState("")
  const [editBrkOut, setEditBrkOut]     = useState("")
  const [editSaving, setEditSaving]     = useState(false)
  const [editError, setEditError]       = useState<string | null>(null)
  const [editSaved, setEditSaved]       = useState(false)
  // Week navigation
  const [weekOff, setWeekOff]           = useState(0)
  const [navLogs, setNavLogs]           = useState<AttLog[] | null>(null)
  const [navLoading, setNavLoading]     = useState(false)
  // WFH / Shoot popup (same-day request from attendance page)
  const [wfhPopup, setWfhPopup]         = useState<"wfh" | "shoot_day" | null>(null)
  const [wfhReason, setWfhReason]       = useState("")
  const [wfhSubmitting, setWfhSubmitting] = useState(false)
  const [wfhPendingAt, setWfhPendingAt] = useState<string | null>(todayWfhLeave?.status === "pending" ? todayWfhLeave.created_at : null)

  // True only when the WFH/Shoot request was submitted TODAY (attendance-page button flow).
  // Pre-planned leaves (applied in advance via Leaves page) should not block manual clock-in.
  const isSameDayWfhRequest = todayWfhLeave
    ? new Date(todayWfhLeave.created_at).toLocaleString("en-CA", { timeZone: "Asia/Kolkata" }).split(",")[0] === today
    : false

  // Poll while same-day WFH is pending (15s) or approved-but-no-clock-in yet (3s race window)
  useEffect(() => {
    if (!isSameDayWfhRequest) return
    const isPending = wfhPendingAt !== null || todayWfhLeave?.status === "pending"
    const isApprovedTransition = todayWfhLeave?.status === "approved" && !todayLog?.clock_in
    if (!isPending && !isApprovedTransition) return
    const interval = isApprovedTransition ? 3000 : 15000
    const id = setInterval(() => router.refresh(), interval)
    return () => clearInterval(id)
  }, [isSameDayWfhRequest, wfhPendingAt, todayWfhLeave?.status, todayLog?.clock_in, router])

  const handleLogIn = useCallback(() => {
    setError(null)
    // Half day leave window check — block clock-in during the approved leave hours
    if (todayApprovedLeave?.leave_type === "half_day" && todayApprovedLeave.half_day_from_time && todayApprovedLeave.half_day_to_time) {
      const nowIST = new Date().toLocaleString("en-CA", { timeZone: "Asia/Kolkata" })
      const nowDate = nowIST.split(",")[0]
      const nowTimeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })
      const leaveEnd = new Date(`${nowDate}T${todayApprovedLeave.half_day_to_time}`)
      const nowTime  = new Date(`${nowDate}T${nowTimeStr}`)
      const leaveStart = new Date(`${nowDate}T${todayApprovedLeave.half_day_from_time}`)
      if (nowTime >= leaveStart && nowTime < leaveEnd) {
        const minsLeft = Math.ceil((leaveEnd.getTime() - nowTime.getTime()) / 60000)
        setError(`You have an approved half day leave until ${new Date(leaveEnd).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}. You can log in in ${minsLeft} minute${minsLeft !== 1 ? "s" : ""}.`)
        return
      }
    }
    if (selectedMode === "office" && OFFICE_CHECK_ENABLED) {
      if (!navigator.geolocation) { setError("Location not supported by this browser."); return }
      setGeoLoading(true)

      const doClockIn = () =>
        startTransition(async () => { const res = await clockIn(selectedMode); if (!res.success) setError(res.error ?? "Error"); else router.refresh() })

      const checkPosition = (pos: GeolocationPosition) => {
        setGeoLoading(false)
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

  function getWeekStartStr(offset: number) {
    const now = new Date(), dow = now.getDay()
    const mon = new Date(now)
    mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7)
    return `${mon.getFullYear()}-${String(mon.getMonth()+1).padStart(2,"0")}-${String(mon.getDate()).padStart(2,"0")}`
  }

  async function handleCustomRange(from: string, to: string) {
    if (!from || !to || from > to) return
    setRangeLoading(true)
    setRangeFrom(from); setRangeTo(to)
    const res = await getAttendanceRange(from, to)
    if (res.success) { setRangeLogs(res.logs); setRangeLeaveDates(res.leaveDates ?? []); setRangeHolidayDates(res.holidayDates ?? []) }
    setRangeLoading(false)
  }

  async function handleRangeFilter(mode: RangeMode) {
    setRangeMode(mode); setHistoryDate(""); setHistoryLog(null)
    if (mode === "date") { setRangeLogs(null); setRangeLeaveDates([]); setRangeHolidayDates([]); setCustomFrom(""); setCustomTo(""); setRangeFrom(""); setRangeTo(""); return }
    setRangeLoading(true)
    const now = new Date(), todayStr = now.toISOString().split("T")[0]
    let start = "", end = todayStr
    if (mode === "last7") { const d7 = new Date(now); d7.setDate(now.getDate()-6); start = d7.toISOString().split("T")[0] }
    else if (mode === "thisMonth") { start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01` }
    else if (mode === "lastMonth") {
      const y = now.getMonth()===0 ? now.getFullYear()-1 : now.getFullYear()
      const m = now.getMonth()===0 ? 12 : now.getMonth()
      const last = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
      start = `${y}-${String(m).padStart(2,"0")}-01`; end = `${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`
    }
    setRangeFrom(start); setRangeTo(end)
    const res = await getAttendanceRange(start, end)
    if (res.success) { setRangeLogs(res.logs); setRangeLeaveDates(res.leaveDates ?? []); setRangeHolidayDates(res.holidayDates ?? []) }
    setRangeLoading(false)
  }

  async function handleWeekNav(offset: number) {
    setWeekOff(offset)
    if (offset === 0) { setNavLogs(null); return }
    setNavLoading(true)
    const ws = getWeekStartStr(offset), we = addDays(ws, 6)
    const res = await getAttendanceRange(ws, we)
    if (res.success) setNavLogs(res.logs as unknown as AttLog[])
    setNavLoading(false)
  }

  async function handleEditTimes(confirmed = false) {
    if (!editingDate || !editCIn) return
    setEditSaving(true); setEditError(null); setEditSaved(false)
    const res = await editAttendanceTimes(editingDate, editCIn, editCOut, editBrkIn || undefined, editBrkOut || undefined, confirmed)
    if (res.success) {
      setEditSaved(true)
      if (rangeMode !== "date") await handleRangeFilter(rangeMode)
      else { const u = await getAttendanceByDate(editingDate); if (u.success && u.log) setHistoryLog(u.log) }
      setTimeout(() => { setEditingDate(null); setEditSaved(false) }, 1200)
    } else if (res.needsConfirm) {
      setPendingTimeConfirm({ kind: "edit", message: res.error ?? "" })
    } else {
      setEditError(res.error ?? "Failed to save.")
    }
    setEditSaving(false)
  }

  function openEditTimes(date: string, clockIn: string | null, clockOut: string | null, breakIn?: string | null, breakOut?: string | null) {
    setEditingDate(date); setEditError(null); setEditSaved(false)
    const toHHMM = (iso: string | null | undefined) => {
      if (!iso) return ""
      return new Date(iso).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"Asia/Kolkata" })
    }
    setEditCIn(toHHMM(clockIn)); setEditCOut(toHHMM(clockOut))
    setEditBrkIn(toHHMM(breakIn)); setEditBrkOut(toHHMM(breakOut))
  }

  const isAbsent  = todayLog?.status === "leave"
  const isIn      = !!todayLog?.clock_in && !todayLog?.clock_out && todayLog?.status === "present"
  const isDone    = !!todayLog?.clock_in && !!todayLog?.clock_out && todayLog?.status === "present"
  // A Half Day leave approval auto-inserts a placeholder row (status: "half_day", no
  // clock_in) so History/Attendance show the leave — but that placeholder isn't a real
  // clock-in. Without this, none of isAbsent/isIn/isDone/notLogged matched it and the
  // Log In button silently vanished for the rest of the day.
  const notLogged = !todayLog || (todayLog.status === "half_day" && !todayLog.clock_in)
  // WFH approved but auto-clock-in not yet reflected — only for same-day requests (pre-planned leaves skip auto clock-in)
  const isWfhApprovedNoClockIn = isSameDayWfhRequest && todayWfhLeave?.status === "approved" && !todayLog?.clock_in
  const breakTotalMins  = todayLog?.break_total_mins ?? 0
  const spanMinsToday   = (todayLog?.clock_in && todayLog?.clock_out)
    ? Math.floor((new Date(todayLog.clock_out).getTime() - new Date(todayLog.clock_in).getTime()) / 60000)
    : Infinity
  // Permission breaks are stored in break_sessions with label:"Permission" — exclude them
  // from cappedBreakMins so the timer shows actual work time, not 0
  const permBreakMins = ((todayLog?.break_sessions ?? []) as unknown as Record<string, unknown>[])
    .filter(s => s.label === 'Permission')
    .reduce((sum, s) => sum + (Number(s.duration_mins) || 0), 0)
  const actualBreakMins = Math.max(0, breakTotalMins - permBreakMins)
  // A half-day leave only covers part of the day — if the member is clocked in before/after
  // it (or straight through it, since nothing forces a clock-out), the overlap between the
  // clocked-in span and the leave's own time window must not count as worked time, same as
  // a break. Only the leave's own window is excluded, so both directions of the earlier fix
  // hold: they can still work before/after it, but not silently rack up hours during it.
  const halfDayLeaveOverlapMins = (() => {
    if (todayApprovedLeave?.leave_type !== "half_day" || !todayApprovedLeave.half_day_from_time || !todayApprovedLeave.half_day_to_time || !todayLog?.clock_in) return 0
    const nowDateStr = new Date().toLocaleString("en-CA", { timeZone: "Asia/Kolkata" }).split(",")[0]
    const leaveStart = new Date(`${nowDateStr}T${todayApprovedLeave.half_day_from_time}`).getTime()
    const leaveEnd   = new Date(`${nowDateStr}T${todayApprovedLeave.half_day_to_time}`).getTime()
    const spanStart  = new Date(todayLog.clock_in).getTime()
    const spanEnd    = todayLog.clock_out ? new Date(todayLog.clock_out).getTime() : Date.now()
    const overlapMs  = Math.min(spanEnd, leaveEnd) - Math.max(spanStart, leaveStart)
    return overlapMs > 0 ? overlapMs / 60000 : 0
  })()
  const cappedBreakMins = Math.min(actualBreakMins + halfDayLeaveOverlapMins, spanMinsToday)
  const hoursWorked    = todayLog?.clock_in
    ? Math.max(0, calcHoursNet(todayLog.clock_in, todayLog.clock_out, cappedBreakMins, null, todayLog.paused_seconds))
    : 0
  // remaining = shift target minus permission credit minus actual worked
  const remainingHours = Math.max(SHIFT_HOURS - todayPermissionHours - hoursWorked, 0)
  const isOvertime     = hoursWorked > SHIFT_HOURS

  const dateStr    = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const statusLabel = isAbsent ? "On Leave" : (isIn || isDone) ? "Present" : "Not Logged"
  const statusGreen = (isIn || isDone) && !isAbsent

  const activeWeekStart = weekOff === 0 ? weekStart : getWeekStartStr(weekOff)
  const activeWeekLogs  = weekOff === 0 ? weekLogs : (navLogs ?? [])
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(activeWeekStart, i))
  const logByDate = Object.fromEntries(activeWeekLogs.map(l => [l.date, l]))

  const isBelowExpected  = isIn && hoursWorked > 0 && hoursWorked < (SHIFT_HOURS - todayPermissionHours)

  const presentCount    = activeWeekLogs.filter(l => l.status === "present").length
  const absentCount     = activeWeekLogs.filter(l => l.status === "leave").length
  const wfhCount        = activeWeekLogs.filter(l => l.work_type === "wfh" && l.status === "present").length
  const officeCount     = activeWeekLogs.filter(l => l.work_type === "office" && l.status === "present").length
  const totalWeekHours  = activeWeekLogs.filter(l => l.clock_in && l.status === "present").reduce((sum, l) => {
    const raw = l.clock_out ? calcHours(l.clock_in!, l.clock_out) : (l.date === today ? calcHours(l.clock_in!, null) : 0)
    const perm = permHoursByDate[l.date] ?? 0
    const activeBreakHrs = (l.date === today && !l.clock_out && l.break_in && !l.break_out)
      ? (Date.now() - new Date(l.break_in).getTime()) / 3600000
      : 0
    const safePaused = Math.max(0, (l.paused_seconds ?? 0)) / 3600
    return sum + Math.max(0, raw - (l.break_total_mins ?? 0) / 60 - activeBreakHrs - safePaused - perm)
  }, 0)

  const attPct  = Math.max(0, Math.min(100, Math.round((hoursWorked / SHIFT_HOURS) * 100)))
  const attRingR = 32, attRingCirc = 2 * Math.PI * attRingR
  const attRingFilled = (attPct / 100) * attRingCirc

  return (
    <>
    <div className="p-5 md:p-6 xl:p-8 max-w-[1400px]" style={{ background: "#F1F2F6", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between mb-6"
        style={{ background:"linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)", borderRadius:20, padding:"16px 18px", gap:14, boxShadow:"0 8px 32px rgba(180,0,0,0.35)", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-50, right:-30, width:200, height:200, borderRadius:"50%", background:"rgba(255,255,255,0.05)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-40, left:60, width:150, height:150, borderRadius:"50%", background:"rgba(255,255,255,0.04)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", top:"30%", left:"38%", width:90, height:90, borderRadius:"50%", background:"rgba(255,255,255,0.03)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:-60, right:120, width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,0.03)", pointerEvents:"none" }} />

        <div style={{ position:"relative", zIndex:1 }}>
          <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:11, fontWeight:700, padding:"4px 12px", borderRadius:99, background:"rgba(255,255,255,0.15)", color:"#fff", marginBottom:10, border:"1px solid rgba(255,255,255,0.2)", letterSpacing:"0.04em" }}>
            📍 Attendance Today
          </span>
          <h1 className="text-[26px] font-black leading-tight" style={{ color: "#fff", fontFamily: "var(--font-jakarta)", margin: "0 0 3px" }}>Attendance</h1>
          <p style={{ fontSize:12, color:"rgba(255,255,255,0.7)", margin:0, display:"flex", alignItems:"center", gap:5 }}>📅 {dateStr}</p>
          <p style={{ fontSize:11, color:"rgba(255,255,255,0.55)", margin:"3px 0 0", display:"flex", alignItems:"center", gap:5 }}>🕒 9:30 AM – 7:00 PM</p>
        </div>

        {/* Illustration — visible at every width; sits right of the title on mobile (same row) and in the flex gap between title and status/ring on desktop */}
        <div className="flex justify-end" style={{ alignSelf:"flex-end", flexShrink:0, position:"relative", zIndex:1 }}>
          <div style={{ position:"absolute", bottom:2, left:"50%", transform:"translateX(-50%)", width:100, height:20, borderRadius:"50%", background:"radial-gradient(ellipse, rgba(0,0,0,0.4) 0%, transparent 72%)", filter:"blur(2px)", pointerEvents:"none" }} />
          <Image src="/brand/attendance-boy.png" alt="" aria-hidden="true" width={1024} height={1536}
            style={{ position:"relative", height: "clamp(90px,24vw,164px)", width: "auto", objectFit: "contain", pointerEvents: "none", filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.3))" }} />
        </div>

        <div className="flex items-center justify-between w-full gap-4 lg:w-auto lg:justify-start lg:mr-[6%]" style={{ position:"relative", zIndex:1 }}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
            <div className="w-2 h-2 rounded-full" style={{ background: statusGreen ? "#22C55E" : isAbsent ? "#F87171" : "rgba(255,255,255,0.5)" }} />
            <span className="text-[13px] font-bold" style={{ color: statusGreen ? "#4ADE80" : isAbsent ? "#F87171" : "rgba(255,255,255,0.8)" }}>{statusLabel}</span>
          </div>

          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6, flexShrink:0 }}>
            <div style={{ position:"relative", width:80, height:80 }}>
              <svg viewBox="0 0 80 80" width="80" height="80">
                <circle cx="40" cy="40" r={attRingR} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="8" />
                <circle cx="40" cy="40" r={attRingR} fill="none" stroke="#FACC15" strokeWidth="8"
                  strokeDasharray={`${attRingFilled} ${attRingCirc}`} strokeLinecap="round"
                  transform="rotate(-90 40 40)" style={{ transition:"stroke-dasharray 0.5s ease" }} />
              </svg>
              <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:15, fontWeight:900, color:"#fff" }}>{attPct}%</span>
              </div>
            </div>
            <div style={{ textAlign:"center" }}>
              <p style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,0.85)", margin:"0 0 1px" }}>Day Progress</p>
              <p style={{ fontSize:9, color:"rgba(255,255,255,0.55)", margin:0 }}>{fmtHoursShort(hoursWorked)} / {fmtHoursShort(SHIFT_HOURS)}</p>
              <p style={{ fontSize:9, color:"rgba(250,204,21,0.9)", fontWeight:700, margin:"1px 0 0" }}>
                {remainingHours > 0 ? `${fmtHoursShort(remainingHours)} left` : "Target reached ✓"}
              </p>
            </div>
          </div>
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
                  {/* ── No login recorded block (2A) ── */}
                  {yesterdayStatus === 'no_login' && (
                    <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(239,68,68,0.06)", border: "1.5px solid rgba(239,68,68,0.25)" }}>
                      <AlertTriangle size={28} style={{ color: "#DC2626", margin: "0 auto 8px" }} />
                      <p className="text-[14px] font-black mb-1" style={{ color: "#DC2626" }}>No Login Recorded</p>
                      <p className="text-[12px]" style={{ color: "#6B7280" }}>
                        You did not clock in on {new Date(yesterdayStr + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}.
                        Please contact admin to mark your attendance before logging in today.
                      </p>
                    </div>
                  )}
                  {/* ── Daily Update missing block — clocked in that day but never submitted ── */}
                  {yesterdayStatus === 'missing_update' && (
                    <div className="rounded-2xl p-5 text-center" style={{ background: "rgba(245,158,11,0.06)", border: "1.5px solid rgba(245,158,11,0.3)" }}>
                      <AlertTriangle size={28} style={{ color: "#D97706", margin: "0 auto 8px" }} />
                      <p className="text-[14px] font-black mb-1" style={{ color: "#D97706" }}>Daily Update Missing</p>
                      <p className="text-[12px] mb-3" style={{ color: "#6B7280" }}>
                        You haven&apos;t submitted your Daily Update for {new Date(yesterdayStr + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}.
                        Submit it before logging in again.
                      </p>
                      <button
                        onClick={() => router.push("/member/update")}
                        className="px-4 py-2 rounded-xl text-[13px] font-bold"
                        style={{ background: "#D97706", color: "#fff" }}>
                        Go Submit It
                      </button>
                    </div>
                  )}
                  {/* ── Yesterday no logout block (2B) ── */}
                  {yesterdayStatus === 'no_logout' && !yesLogoutSaved && (
                    <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(245,158,11,0.06)", border: "1.5px solid rgba(245,158,11,0.3)" }}>
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={16} style={{ color: "#D97706" }} />
                        <p className="text-[13px] font-black" style={{ color: "#D97706" }}>
                          Yesterday Logout Missing — {new Date(yesterdayStr + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" })}
                        </p>
                      </div>
                      <p className="text-[12px]" style={{ color: "#6B7280" }}>You were logged in but never logged out. Enter your actual logout time to continue.</p>
                      <div className="flex items-center gap-3">
                        <input
                          type="time"
                          value={yesLogoutTime}
                          onChange={e => { setYesLogoutTime(e.target.value); setYesLogoutError(null) }}
                          className="rounded-xl px-3 py-2 text-[13px] font-semibold outline-none"
                          style={{ border: "1px solid #E5E7EB", background: "#fff", color: "#111" }}
                        />
                        <button
                          disabled={!yesLogoutTime || yesLogoutSaving}
                          onClick={async () => {
                            if (!yesLogoutTime) return
                            setYesLogoutSaving(true); setYesLogoutError(null)
                            const res = await manualClockOut(yesterdayStr, yesLogoutTime)
                            setYesLogoutSaving(false)
                            if (res.success) { setYesLogoutSaved(true); return }
                            if (res.needsConfirm) { setPendingTimeConfirm({ kind: "yesterday", message: res.error ?? "" }); return }
                            setYesLogoutError(res.error ?? "Failed to save")
                          }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold disabled:opacity-50"
                          style={{ background: "#D97706", color: "#fff" }}>
                          {yesLogoutSaving ? <Loader2 size={13} className="animate-spin" /> : "Save & Continue"}
                        </button>
                      </div>
                      {yesLogoutError && <p className="text-[12px]" style={{ color: "#EF4444" }}>{yesLogoutError}</p>}
                    </div>
                  )}
                  {yesterdayStatus === 'no_logout' && yesLogoutSaved && (
                    <div className="rounded-xl p-3 flex items-center gap-2" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)" }}>
                      <CheckCircle2 size={14} style={{ color: "#16A34A" }} />
                      <p className="text-[12px] font-semibold" style={{ color: "#16A34A" }}>Yesterday logout saved. You can now clock in.</p>
                    </div>
                  )}
                  {/* Half day leave info banner */}
                  {todayApprovedLeave?.leave_type === "half_day" && (
                    <div className="rounded-2xl p-4 flex items-center gap-3" style={{ background: "rgba(245,158,11,0.07)", border: "1.5px solid rgba(245,158,11,0.28)" }}>
                      <div className="text-2xl flex-shrink-0">🌓</div>
                      <div>
                        <p className="text-[13px] font-black" style={{ color: "#D97706" }}>Half Day Leave Approved</p>
                        {todayApprovedLeave.half_day_from_time && todayApprovedLeave.half_day_to_time && (
                          <p className="text-[11px] font-semibold mt-0.5" style={{ color: "#9CA3AF" }}>
                            {new Date(`2000-01-01T${todayApprovedLeave.half_day_from_time}`).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                            {" – "}
                            {new Date(`2000-01-01T${todayApprovedLeave.half_day_to_time}`).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                            {" · Log in after leave ends"}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {/* Block clock-in entirely if the last working day has no login or no submitted update (2A) */}
                  {(yesterdayStatus === 'no_login' || yesterdayStatus === 'missing_update') ? null : (todayApprovedLeave && todayApprovedLeave.leave_type !== "half_day") ? (
                    <div className="rounded-2xl p-5 text-center" style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(239,68,68,0.02) 100%)", border: "1.5px solid rgba(239,68,68,0.2)" }}>
                      <div className="text-3xl mb-2">🏖️</div>
                      <p className="text-[15px] font-black mb-2" style={{ color: "#DC2626" }}>Full Day Leave Approved</p>
                      <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#9CA3AF" }}>NO LOGIN REQUIRED.</p>
                    </div>
                  ) : (
                    <>
                      {/* WFH/Shoot pending or just-approved-setting-up — only for same-day requests */}
                      {(() => {
                        const isApprovedTransition = isWfhApprovedNoClockIn
                        const showPendingBlock = isSameDayWfhRequest && (wfhPendingAt || todayWfhLeave?.status === "pending" || isApprovedTransition)
                        if (!showPendingBlock) return null
                        return (
                          <div className="rounded-2xl p-4 space-y-2" style={{ background: isApprovedTransition ? "rgba(16,185,129,0.06)" : "rgba(99,102,241,0.06)", border: `1.5px solid ${isApprovedTransition ? "rgba(16,185,129,0.2)" : "rgba(99,102,241,0.2)"}` }}>
                            <div className="flex items-center gap-2">
                              {todayWfhLeave?.leave_type === "shoot_day" ? <Camera size={15} style={{ color: isApprovedTransition ? "#059669" : "#6366F1" }} /> : <Home size={15} style={{ color: isApprovedTransition ? "#059669" : "#6366F1" }} />}
                              <p className="text-[13px] font-bold" style={{ color: isApprovedTransition ? "#059669" : "#6366F1" }}>
                                {isApprovedTransition
                                  ? `${todayWfhLeave?.leave_type === "shoot_day" ? "Shoot Day" : "WFH"} Approved — Logging you in...`
                                  : `${todayWfhLeave?.leave_type === "shoot_day" ? "Shoot Day" : "WFH"} — Waiting for Approval`}
                              </p>
                            </div>
                            {!isApprovedTransition && (
                              <>
                                <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                                  Applied at {fmtTimeFromIso(wfhPendingAt ?? todayWfhLeave?.created_at ?? null)}
                                </p>
                                <p className="text-[11px] font-semibold" style={{ color: "#6B7280" }}>Working for</p>
                                <LiveTimer clockInIso={wfhPendingAt ?? todayWfhLeave!.created_at} pausedSeconds={0} breakTotalMins={0} />
                                <p className="text-[10px]" style={{ color: "#9CA3AF" }}>Clock-in will be set to your applied time once admin approves.</p>
                                <a href="/member/leaves" className="inline-block text-[11px] font-semibold underline underline-offset-2" style={{ color: "#6366F1" }}>View in Leaves →</a>
                              </>
                            )}
                            {isApprovedTransition && (
                              <p className="text-[11px]" style={{ color: "#6B7280" }}>Setting up your session, please wait a moment...</p>
                            )}
                          </div>
                        )
                      })()}
                      {!(isSameDayWfhRequest && (wfhPendingAt || todayWfhLeave?.status === "pending" || isWfhApprovedNoClockIn)) && (wfhPopup ? (
                        /* WFH/Shoot reason popup */
                        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(99,102,241,0.05)", border: "1.5px solid rgba(99,102,241,0.2)" }}>
                          <div className="flex items-center gap-2">
                            {wfhPopup === "shoot_day" ? <Camera size={15} style={{ color: "#6366F1" }} /> : <Home size={15} style={{ color: "#6366F1" }} />}
                            <p className="text-[13px] font-bold" style={{ color: "#6366F1" }}>
                              {wfhPopup === "shoot_day" ? "Request Shoot Day" : "Request Work From Home"}
                            </p>
                          </div>
                          <textarea
                            value={wfhReason}
                            onChange={e => setWfhReason(e.target.value)}
                            placeholder="Reason (optional)"
                            rows={2}
                            className="w-full text-[13px] rounded-xl p-3 resize-none outline-none"
                            style={{ border: "1px solid #E5E7EB", color: "#111", background: "#fff" }}
                          />
                          <div className="flex gap-2">
                            <button
                              disabled={wfhSubmitting}
                              onClick={async () => {
                                setWfhSubmitting(true)
                                const res = await submitWfhAttendanceRequest(wfhPopup, wfhReason.trim())
                                setWfhSubmitting(false)
                                if (!res.success) { setError(res.error ?? "Failed"); return }
                                setWfhPendingAt(res.created_at ?? null)
                                setWfhPopup(null)
                                setWfhReason("")
                                router.refresh()
                              }}
                              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold"
                              style={{ background: "#6366F1", color: "#fff" }}>
                              {wfhSubmitting ? <Loader2 size={13} className="animate-spin" /> : "Submit Request"}
                            </button>
                            <button onClick={() => { setWfhPopup(null); setWfhReason("") }}
                              className="px-4 py-2.5 rounded-xl text-[13px] font-semibold"
                              style={{ background: "#F3F4F6", color: "#6B7280" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <p className="text-[12px] font-semibold mb-3" style={{ color: "#9CA3AF" }}>Select Work Mode</p>
                            <div className="flex gap-2 flex-wrap">
                              {(isMedia ? ["office", "wfh", "shoot"] as const : ["office", "wfh"] as const).map((mode) => {
                                const Icon = mode === "wfh" ? Home : mode === "shoot" ? Camera : Building2
                                const label = mode === "wfh" ? "Work From Home" : mode === "shoot" ? "Shoot" : "Office"
                                const isWfhMode = mode === "wfh" || mode === "shoot"
                                const wfhApproved = todayWfhLeave?.status === "approved"
                                const wfhApprovedType = todayWfhLeave?.leave_type
                                const active = selectedMode === mode
                                const clickHandler = () => {
                                  if (mode === "office") { setSelectedMode("office"); return }
                                  // WFH/Shoot: if pre-approved for this type, just select it
                                  if (isWfhMode && wfhApproved && ((mode === "wfh" && wfhApprovedType !== "shoot_day") || (mode === "shoot" && wfhApprovedType === "shoot_day"))) {
                                    setSelectedMode(mode); return
                                  }
                                  // Otherwise open popup for same-day request
                                  if (isWfhMode) setWfhPopup(mode === "shoot" ? "shoot_day" : "wfh")
                                }
                                return (
                                  <button key={mode} onClick={clickHandler} disabled={isPending}
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
                                    style={{ background: active ? "#de1a1a" : "#F9FAFB", color: active ? "#FFFFFF" : "#6B7280", border: active ? "none" : "1px solid #E5E7EB" }}>
                                    <Icon size={14} />{label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-2">
                            <button onClick={handleLogIn} disabled={isPending || geoLoading || (selectedMode !== "office" && todayWfhLeave?.status !== "approved") || (yesterdayStatus === 'no_logout' && !yesLogoutSaved)}
                              className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[14px] font-bold disabled:opacity-50 transition-all"
                              style={{ background: "#de1a1a", color: "#FFFFFF" }}>
                              {geoLoading ? <><MapPin size={14} className="animate-pulse" />Verifying…</> : isPending ? <Loader2 size={14} className="animate-spin" /> : <><LogIn size={14} />Log In</>}
                            </button>
                          </div>
                        </>
                      ))}
                    </>
                  )}
                  {error && <p className="text-[12px] font-medium" style={{ color: "#EF4444" }}>{error}</p>}
                </div>
              )}

              {/* CLOCKED IN */}
              {isIn && todayLog?.clock_in && (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-[13px] font-bold" style={{ color: "#111111" }}>
                        Logged in at {fmtTime(todayLog.clock_in)}
                      </p>
                      <CheckCircle2 size={15} style={{ color: "#22C55E" }} />
                      {isOvertime && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                          style={{ background: "rgba(245,158,11,0.15)", color: "#D97706", border: "1px solid rgba(245,158,11,0.35)" }}>
                          ⚡ Overtime
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] mb-1.5" style={{ color: "#9CA3AF" }}>
                      {isOvertime ? "Overtime working for" : "Working for"}
                    </p>
                    <LiveTimer
                      clockInIso={todayLog.clock_in}
                      pausedSeconds={todayLog.paused_seconds}
                      breakTotalMins={cappedBreakMins}
                      currentBreakInIso={null}
                    />
                    <SegmentBar hoursWorked={hoursWorked} />
                    <p className="text-[12px] mb-1" style={{ color: "#9CA3AF" }}>
                      {fmtHoursShort(hoursWorked)} / 9h 30m
                    </p>
                    {todayPermissionHours > 0 && (
                      <p className="text-[11px] mb-3 font-semibold" style={{ color: "#7C3AED" }}>
                        −{todayPermissionHours}h permission deducted
                      </p>
                    )}
                    <button
                      onClick={() => {
                        const hrs = todayLog?.clock_in ? calcHours(todayLog.clock_in, null) : 0
                        if (hrs > 18) {
                          // Zone 2 — over 18h is treated as definitely forgotten, no live
                          // logout allowed at all; go straight to entering the real time.
                          openEditTimes(today, todayLog!.clock_in, null)
                        } else if (hrs > 12) {
                          // Zone 1 — 12-18h, ask before accepting the live logout time.
                          setShowClockOutConfirm(true)
                        } else {
                          handle(clockOut)
                        }
                      }}
                      disabled={isPending}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[14px] font-bold disabled:opacity-50 transition-all"
                      style={{ background: "#de1a1a", color: "#FFFFFF" }}>
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                      Log Out
                    </button>
                    {/* 12-18h overtime confirmation modal (Zone 1) */}
                    {showClockOutConfirm && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
                        <div className="rounded-2xl p-6 max-w-[340px] w-full mx-4 space-y-4" style={{ background: "#fff", boxShadow: "0 8px 48px rgba(0,0,0,0.18)" }}>
                          <div className="flex items-center gap-3">
                            <AlertTriangle size={22} style={{ color: "#D97706", flexShrink: 0 }} />
                            <p className="text-[15px] font-black" style={{ color: "#111" }}>Login Hours Exceed 12h</p>
                          </div>
                          <p className="text-[13px]" style={{ color: "#6B7280" }}>
                            Your login span is over 12 hours. Are you still working, or is your login time wrong?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setShowClockOutConfirm(false); handle(clockOut) }}
                              disabled={isPending}
                              className="flex-1 py-2.5 rounded-xl text-[13px] font-bold"
                              style={{ background: "#de1a1a", color: "#fff" }}>
                              Yes, Log Out Now
                            </button>
                            <button
                              onClick={() => { setShowClockOutConfirm(false); openEditTimes(today, todayLog!.clock_in, null) }}
                              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                              style={{ background: "#F3F4F6", color: "#6B7280" }}>
                              No, Enter Real Time
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    {error && <p className="text-[12px] mt-2" style={{ color: "#EF4444" }}>{error}</p>}
                  </div>
                  {/* Large alarm clock illustration */}
                  <div className="flex-shrink-0 relative w-[80px] h-[80px] sm:w-[160px] sm:h-[160px]">
                    <Image src="/brand/character-desk.png" alt="Alarm clock" fill style={{ objectFit: "contain" }} />
                  </div>
                </div>
              )}

              {/* DONE */}
              {isDone && todayLog?.clock_in && todayLog?.clock_out && (
                <div className="flex items-start gap-4">
                  {/* Left: completion info */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: "rgba(34,197,94,0.1)" }}>
                      <CheckCircle2 size={22} style={{ color: "#22C55E" }} />
                    </div>
                    <div>
                      <p className="text-[14px] font-bold mb-2" style={{ color: "#111111" }}>Day complete ✓</p>
                      <div className="flex gap-4 flex-wrap">
                        {[
                          { label: "In",     value: fmtTime(todayLog.clock_in),  color: "#111111" },
                          { label: "Out",    value: fmtTime(todayLog.clock_out), color: "#111111" },
                          { label: "Span",   value: fmtHoursShort(calcHours(todayLog.clock_in, todayLog.clock_out)), color: "#6366F1" },
                          { label: "Break",  value: cappedBreakMins > 0 ? fmtHoursShort(cappedBreakMins / 60) : "—", color: "#F59E0B" },
                          { label: "Worked", value: fmtHoursShort(hoursWorked), color: "#22C55E" },
                        ].map(r => (
                          <div key={r.label}>
                            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{r.label}</p>
                            <p className="text-[13px] font-bold" style={{ color: r.color }}>{r.value}</p>
                          </div>
                        ))}
                      </div>
                      {error && <p className="text-[12px] mt-2" style={{ color: "#EF4444" }}>{error}</p>}
                    </div>
                  </div>
                  {/* Right: Continue button — resumes session, gap added to paused_seconds */}
                  <button
                    onClick={() => handle(() => resumeAttendance(today))}
                    disabled={isPending}
                    className="flex-shrink-0 flex flex-col items-center justify-center gap-1.5 rounded-2xl transition-all"
                    style={{ background: "rgba(99,102,241,0.08)", border: "1.5px solid rgba(99,102,241,0.25)", color: "#6366F1", padding: "12px 16px", minWidth: 72 }}>
                    {isPending ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                    <span className="text-[11px] font-bold leading-none">Continue</span>
                  </button>
                </div>
              )}

              {/* ON LEAVE */}
              {isAbsent && (
                <div className="flex items-center gap-4 rounded-2xl p-4" style={{
                  background: "linear-gradient(135deg, #FFF7ED 0%, #FFEDD5 100%)",
                  border: "1px solid rgba(217,119,6,0.18)",
                  boxShadow: "0 1px 0 rgba(255,255,255,0.8) inset, 0 10px 24px -12px rgba(217,119,6,0.35)",
                }}>
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 relative"
                    style={{
                      background: "linear-gradient(155deg, #FBBF24 0%, #D97706 100%)",
                      boxShadow: "0 1px 0 rgba(255,255,255,0.5) inset, 0 -3px 6px rgba(0,0,0,0.18) inset, 0 8px 16px -4px rgba(217,119,6,0.6)",
                    }}>
                    <Palmtree size={26} strokeWidth={2.25} style={{ color: "#fff", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.2))" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-[15px] font-black" style={{ color: "#111111" }}>On Leave Today</p>
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide" style={{
                        background: "linear-gradient(135deg, #34D399, #059669)",
                        color: "#fff",
                        boxShadow: "0 1px 0 rgba(255,255,255,0.3) inset, 0 3px 8px -2px rgba(5,150,105,0.6)",
                      }}>
                        ✓ Approved
                      </span>
                    </div>
                    <p className="text-[12.5px] font-medium" style={{ color: "#92400E" }}>Enjoy your day off — no clock-in needed.</p>
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
                { label: "Status",     value: isAbsent ? "On Leave" : (isIn || isDone) ? "Present" : "Not Logged", color: isAbsent ? "#EF4444" : (isIn || isDone) ? "#22C55E" : "#9CA3AF" },
                { label: "Work Mode",  value: todayLog?.work_type === "wfh" ? "Work From Home" : todayLog?.work_type === "shoot" ? "Shoot (Outside)" : todayLog?.work_type === "office" ? "Office" : "—", color: "#111111" },
                { label: "Log In",     value: fmtTime(todayLog?.clock_in ?? null), color: "#111111" },
                { label: "Log Out",    value: fmtTime(todayLog?.clock_out ?? null), color: "#111111" },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-[13px]" style={{ color: "#9CA3AF" }}>{row.label}</span>
                  <span className="text-[13px] font-semibold" style={{ color: row.color }}>{row.value}</span>
                </div>
              ))}
              {/* Time breakdown */}
              {todayLog?.clock_in && (() => {
                const spanH      = Math.max(0, calcHours(todayLog.clock_in, todayLog.clock_out))
                // Include the half-day-leave overlap here too so it's a visible part of the
                // equation, not another silently-vanishing number (see paused_seconds above).
                const totalBreakMins = breakTotalMins + halfDayLeaveOverlapMins
                const breakH     = totalBreakMins / 60
                return (
                  <div style={{ borderTop: "1px solid #F3F4F6", paddingTop: 12, marginTop: 4 }}>
                    {/* Visual equation: span − break = worked */}
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto 1fr", alignItems: "center", gap: 4, marginBottom: 10, minWidth: 260 }}>
                        {/* Span */}
                        <div style={{ textAlign: "center", background: "rgba(99,102,241,0.07)", borderRadius: 10, padding: "8px 4px", border: "1px solid rgba(99,102,241,0.15)" }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "#6366F1", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 2px", whiteSpace: "nowrap" }}>Logged</p>
                          <p style={{ fontSize: 15, fontWeight: 900, color: "#6366F1", margin: 0, fontFamily: "var(--font-jakarta)" }}>{fmtHoursShort(spanH)}</p>
                        </div>
                        <span style={{ fontSize: 16, fontWeight: 900, color: "#D1D5DB" }}>−</span>
                        {/* Break */}
                        <div style={{ textAlign: "center", background: "rgba(245,158,11,0.06)", borderRadius: 10, padding: "8px 4px", border: "1px solid rgba(245,158,11,0.15)" }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "#D97706", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 2px", whiteSpace: "nowrap" }}>Break</p>
                          <p style={{ fontSize: 15, fontWeight: 900, color: "#D97706", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                            {totalBreakMins > 0 ? fmtHoursShort(breakH) : "0h"}
                          </p>
                        </div>
                        <span style={{ fontSize: 16, fontWeight: 900, color: "#D1D5DB" }}>=</span>
                        {/* Worked */}
                        <div style={{ textAlign: "center", background: "rgba(34,197,94,0.08)", borderRadius: 10, padding: "8px 4px", border: "1px solid rgba(34,197,94,0.2)" }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: "#16A34A", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 2px", whiteSpace: "nowrap" }}>Worked</p>
                          <p style={{ fontSize: 15, fontWeight: 900, color: "#16A34A", margin: 0, fontFamily: "var(--font-jakarta)" }}>
                            {hoursWorked > 0 ? fmtHoursShort(hoursWorked) : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                    {halfDayLeaveOverlapMins > 0 && (
                      <p style={{ fontSize: 10, color: "#D97706", margin: "-4px 0 8px", fontWeight: 600 }}>
                        Includes {fmtHoursShort(halfDayLeaveOverlapMins / 60)} during your approved Half Day Leave — not counted as worked
                      </p>
                    )}
                    {/* Target bar */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "nowrap", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "#9CA3AF", whiteSpace: "nowrap" }}>Target: {fmtHoursShort(SHIFT_HOURS)}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: hoursWorked >= SHIFT_HOURS ? "#16A34A" : "#de1a1a", whiteSpace: "nowrap" }}>
                        {hoursWorked >= SHIFT_HOURS ? "Target reached ✓" : `${fmtHoursShort(Math.max(0, SHIFT_HOURS - hoursWorked))} remaining`}
                      </span>
                    </div>
                  </div>
                )
              })()}
            </div>
            {isBelowExpected && (
              <div className="flex items-center gap-2 mt-4 px-3 py-2.5 rounded-xl"
                style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <AlertTriangle size={13} style={{ color: "#F59E0B" }} />
                <p className="text-[12px] font-semibold" style={{ color: "#D97706" }}>
                  You are below expected {fmtHoursShort(SHIFT_HOURS)}
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
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(222,26,26,0.1)" }}>
                <Calendar size={16} style={{ color: "#de1a1a" }} />
              </div>
              <div className="flex-1">
                <h3 className="text-[15px] font-bold leading-tight" style={{ color: "#111111" }}>
                  {weekOff === 0 ? "This Week" : weekOff === -1 ? "Last Week" : `${Math.abs(weekOff)}w ago`}
                </h3>
                <p className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#9CA3AF" }}>Working Hrs</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleWeekNav(weekOff - 1)} disabled={navLoading || weekOff <= -12}
                  style={{ width:24, height:24, borderRadius:6, background:"rgba(0,0,0,0.06)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#374151" }}>‹</button>
                {weekOff !== 0 && (
                  <button onClick={() => handleWeekNav(0)} style={{ fontSize:10, fontWeight:700, color:"#de1a1a", background:"none", border:"none", cursor:"pointer", padding:"0 2px" }}>Now</button>
                )}
                <button onClick={() => handleWeekNav(weekOff + 1)} disabled={navLoading || weekOff >= 0}
                  style={{ width:24, height:24, borderRadius:6, background:"rgba(0,0,0,0.06)", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:700, color:"#374151", opacity: weekOff >= 0 ? 0.3 : 1 }}>›</button>
              </div>
            </div>

            <div className="space-y-1 pr-20">
              {weekDates.map((date, i) => {
                const log        = logByDate[date]
                const isFuture   = date > today
                const isToday    = date === today
                const present    = log?.status === "present"
                const absent     = log?.status === "leave"
                // Prefer daily_updates.working_hours (accurate entry-based calc) for past days;
                // fall back to clock_in/clock_out span minus breaks for today or when no update
                const navWorkedH = weekOff !== 0 ? (log as unknown as { worked_hours?: number })?.worked_hours : undefined
                const updateH = !isToday ? (navWorkedH ?? weekUpdatesByDate[date]) : undefined
                const rawH = log?.clock_in
                  ? (log.clock_out ? calcHours(log.clock_in, log.clock_out) : (isToday ? calcHours(log.clock_in, null) : 0))
                  : 0
                const h = (updateH != null && updateH > 0)
                  ? updateH
                  : Math.max(0, rawH - (log?.break_total_mins ?? 0) / 60 - (permHoursByDate[date] ?? 0))

                let dot = "#D1D5DB"; let label = "No record"; let color = "#9CA3AF"
                if (isFuture)    { dot = "#E5E7EB"; label = "—"; color = "rgba(0,0,0,0.1)" }
                else if (absent) { dot = "#EF4444"; label = "On Leave"; color = "#EF4444" }
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

          {/* Monthly Performance */}
          <div className="rounded-3xl p-5" style={{ background: "#FFFFFF", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(99,102,241,0.1)" }}>
                <Target size={16} style={{ color: "#6366F1" }} />
              </div>
              <div>
                <h3 className="text-[15px] font-bold leading-none" style={{ color: "#111111" }}>Monthly Performance</h3>
                <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>{new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}</p>
              </div>
            </div>

            {/* 2×3 grid: Present, Absent, Office, WFH, Leave, Pending */}
            {(() => {
              const d = new Date(today)
              const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
              const workingDaysInMonth = daysInMonth  // full calendar days in month
              const presentDays = monthlyPerf?.presentDays ?? 0
              const remainingDays = Math.max(0, workingDaysInMonth - presentDays - (monthlyPerf?.leaveDays ?? 0))
              return (
                <>
                  {/* Present fraction bar */}
                  <div className="rounded-2xl p-3 mb-2" style={{ background: "rgba(34,197,94,0.08)" }}>
                    <div className="flex items-end justify-between mb-1.5">
                      <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "#16A34A" }}>Days Present</p>
                      <p className="text-[10px] font-bold" style={{ color: "#9CA3AF" }}>{remainingDays} remaining</p>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[28px] font-black leading-none" style={{ color: "#22C55E", fontFamily: "var(--font-jakarta)" }}>{presentDays}</span>
                      <span className="text-[16px] font-black" style={{ color: "#9CA3AF" }}>/{workingDaysInMonth}</span>
                    </div>
                    <div className="mt-2 rounded-full overflow-hidden" style={{ height: 4, background: "rgba(0,0,0,0.06)" }}>
                      <div style={{ height: "100%", width: `${Math.min(100, Math.round((presentDays / workingDaysInMonth) * 100))}%`, background: "#22C55E", borderRadius: 99 }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: "Office",  value: monthlyPerf?.officeDays   ?? 0, color: "#6366F1", bg: "rgba(99,102,241,0.08)" },
                      { label: isMedia ? "Shoot" : "WFH", value: isMedia ? (monthlyPerf?.shootDays ?? 0) : (monthlyPerf?.wfhDays ?? 0), color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
                      { label: "Leave",   value: (monthlyPerf?.absentDays ?? 0) + (monthlyPerf?.leaveDays ?? 0), color: "#EF4444", bg: "rgba(239,68,68,0.08)" },
                    ].map(stat => (
                      <div key={stat.label} className="rounded-2xl p-3 text-center" style={{ background: stat.bg }}>
                        <p className="text-[22px] font-black leading-none mb-1" style={{ color: stat.color, fontFamily: "var(--font-jakarta)" }}>
                          {stat.value}
                        </p>
                        <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: stat.color }}>{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}

          </div>

        </div>{/* end third col */}

      </div>

      {/* ── Daily Insight — 2 separate boxes in one line ── */}
      <div className="rounded-3xl p-5" style={{ background: "#FFFFFF", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
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

        {/* Two boxes side by side */}
        <div className="flex flex-col md:flex-row gap-3">

          {/* LOGIN box */}
          {(() => {
            const loginHrs = todayLog?.clock_in ? calcHours(todayLog.clock_in, todayLog.clock_out) : 0
            const loginAchieved = loginHrs >= 9.5
            return (
              <div className="flex-1 rounded-2xl p-4" style={{
                background: loginAchieved ? "rgba(22,163,74,0.05)" : "rgba(99,102,241,0.04)",
                border: `1.5px solid ${loginAchieved ? "rgba(22,163,74,0.3)" : "rgba(99,102,241,0.15)"}`,
              }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: loginAchieved ? "#16A34A" : "#6366F1" }}>Login</p>
                  {loginAchieved && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A" }}>✓ Achieved</span>}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-xl px-3 py-2" style={{ background: "rgba(99,102,241,0.08)", minWidth: 0 }}>
                    <p className="text-[9px] font-bold uppercase tracking-wide mb-1 whitespace-nowrap" style={{ color: "#6366F1" }}>Login Hrs</p>
                    <p className="text-[16px] font-black leading-none" style={{ color: "#6366F1", fontFamily: "var(--font-jakarta)" }}>
                      {loginHrs > 0 ? fmtHoursShort(loginHrs) : "0h"}
                    </p>
                  </div>
                  <div className="flex-1 rounded-xl px-3 py-2" style={{ background: "rgba(245,158,11,0.08)", minWidth: 0 }}>
                    <p className="text-[9px] font-bold uppercase tracking-wide mb-1 whitespace-nowrap" style={{ color: "#D97706" }}>Target</p>
                    <p className="text-[16px] font-black leading-none" style={{ color: "#D97706", fontFamily: "var(--font-jakarta)" }}>9h 30m</p>
                  </div>
                  <div className="flex-1 rounded-xl px-3 py-2" style={{ background: loginAchieved ? "rgba(22,163,74,0.08)" : "rgba(222,26,26,0.06)", minWidth: 0 }}>
                    <p className="text-[9px] font-bold uppercase tracking-wide mb-1 whitespace-nowrap" style={{ color: loginAchieved ? "#16A34A" : "#de1a1a" }}>Remaining</p>
                    <p className="text-[16px] font-black leading-none" style={{ color: loginAchieved ? "#16A34A" : "#de1a1a", fontFamily: "var(--font-jakarta)" }}>
                      {loginAchieved ? "0h" : loginHrs > 0 ? fmtHoursShort(Math.max(0, 9.5 - loginHrs)) : "9h 30m"}
                    </p>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* WORKING box */}
          {(() => {
            const todayWorkHrs = todayUpdate?.working_hours ?? 0
            const workAchieved = todayWorkHrs >= 8.5
            return (
              <div className="flex-1 rounded-2xl p-4" style={{
                background: workAchieved ? "rgba(22,163,74,0.05)" : "rgba(99,102,241,0.04)",
                border: `1.5px solid ${workAchieved ? "rgba(22,163,74,0.3)" : "rgba(99,102,241,0.15)"}`,
              }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: workAchieved ? "#16A34A" : "#6366F1" }}>Working</p>
                  {workAchieved && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(22,163,74,0.12)", color: "#16A34A" }}>✓ Achieved</span>}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 rounded-xl px-3 py-2" style={{ background: "rgba(34,197,94,0.08)", minWidth: 0 }}>
                    <p className="text-[9px] font-bold uppercase tracking-wide mb-1 whitespace-nowrap" style={{ color: "#16A34A" }}>Working Hrs</p>
                    <p className="text-[16px] font-black leading-none" style={{ color: "#16A34A", fontFamily: "var(--font-jakarta)" }}>
                      {todayWorkHrs > 0 ? fmtHoursShort(todayWorkHrs) : "0h"}
                    </p>
                  </div>
                  <div className="flex-1 rounded-xl px-3 py-2" style={{ background: "rgba(245,158,11,0.08)", minWidth: 0 }}>
                    <p className="text-[9px] font-bold uppercase tracking-wide mb-1 whitespace-nowrap" style={{ color: "#D97706" }}>Target</p>
                    <p className="text-[16px] font-black leading-none" style={{ color: "#D97706", fontFamily: "var(--font-jakarta)" }}>8h 30m</p>
                  </div>
                  <div className="flex-1 rounded-xl px-3 py-2" style={{ background: workAchieved ? "rgba(22,163,74,0.08)" : "rgba(222,26,26,0.06)", minWidth: 0 }}>
                    <p className="text-[9px] font-bold uppercase tracking-wide mb-1 whitespace-nowrap" style={{ color: workAchieved ? "#16A34A" : "#de1a1a" }}>Remaining</p>
                    <p className="text-[16px] font-black leading-none" style={{ color: workAchieved ? "#16A34A" : "#de1a1a", fontFamily: "var(--font-jakarta)" }}>
                      {workAchieved ? "0h" : todayWorkHrs > 0 ? fmtHoursShort(Math.max(0, 8.5 - todayWorkHrs)) : "8h 30m"}
                    </p>
                  </div>
                </div>
              </div>
            )
          })()}

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
            <p className="text-[11px]" style={{ color: "#9CA3AF" }}>Filter by range or pick a custom date range</p>
          </div>
        </div>

        {/* Quick filter pills */}
        <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 mb-4">
          {([
            { mode: "date" as RangeMode,      label: "📅 Custom Range" },
            { mode: "last7" as RangeMode,     label: "Last 7 Days" },
            { mode: "thisMonth" as RangeMode, label: "This Month" },
            { mode: "lastMonth" as RangeMode, label: "Last Month" },
          ]).map(f => (
            <button key={f.mode} onClick={() => handleRangeFilter(f.mode)}
              style={{
                padding:"6px 14px", borderRadius:99, fontSize:12, fontWeight:700, cursor:"pointer",
                background: rangeMode === f.mode ? "#6366F1" : "#F5F6FA",
                color:      rangeMode === f.mode ? "#FFFFFF"  : "#6B7280",
                border:     rangeMode === f.mode ? "1.5px solid #6366F1" : "1.5px solid transparent",
              }}>
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Custom date range mode ── */}
        {rangeMode === "date" && (
          <>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <div>
                <label className="block text-[10px] font-bold mb-1.5" style={{ color: "#6B7280" }}>FROM DATE</label>
                <input type="date" min="2025-01-01" max={today} value={customFrom}
                  onChange={e => { setCustomFrom(e.target.value); setRangeLogs(null) }}
                  className="rounded-xl px-3 py-2 text-[13px] font-semibold"
                  style={{ border: "1.5px solid #EBEDF2", outline: "none", color: "#111111", background: "#F9FAFB" }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold mb-1.5" style={{ color: "#6B7280" }}>TO DATE</label>
                <input type="date" min={customFrom || "2025-01-01"} max={today} value={customTo}
                  onChange={e => { setCustomTo(e.target.value); setRangeLogs(null) }}
                  className="rounded-xl px-3 py-2 text-[13px] font-semibold"
                  style={{ border: "1.5px solid #EBEDF2", outline: "none", color: "#111111", background: "#F9FAFB" }}
                />
              </div>
              <button
                onClick={() => handleCustomRange(customFrom, customTo)}
                disabled={!customFrom || !customTo || customFrom > customTo || rangeLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-[13px] font-bold disabled:opacity-40"
                style={{ background: "#6366F1", color: "#FFFFFF" }}>
                {rangeLoading ? <Loader2 size={13} className="animate-spin" /> : <CalendarSearch size={13} />}
                Search
              </button>
              {customFrom && customTo && customFrom > customTo && (
                <p className="text-[12px] font-semibold" style={{ color: "#EF4444" }}>From date must be before To date</p>
              )}
            </div>
            {rangeLoading && <p className="text-[13px]" style={{ color: "#9CA3AF" }}>Loading…</p>}
            {!rangeLoading && rangeLogs !== null && (() => {
              return (
                <>
                  {rangeLogs.length === 0
                    ? <p className="text-[13px]" style={{ color: "#9CA3AF" }}>No attendance records found for this range.</p>
                    : (
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead>
                            <tr style={{ background:"#F5F6FA" }}>
                              {["Date","Day","Status","Mode","Login","Logout","Worked",""].map(h => (
                                <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontWeight:700, color:"#6B7280", fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", whiteSpace:"nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(rangeFrom ? allDatesInRange(rangeFrom, rangeTo, today) : rangeLogs.map(l=>l.date)).map(date => {
                              const l = rangeLogs.find(r => r.date === date)
                              const dayLabel  = new Date(date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"})
                              const dateLabel = new Date(date+"T12:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short"})
                              // Gap row — no attendance record exists
                              if (!l) {
                                const isLeaveDay   = rangeLeaveDates.includes(date)
                                const holidayInfo  = rangeHolidayDates.find(h => h.date === date)
                                const isHoliday    = !!holidayInfo
                                return (
                                  <tr key={date} style={{ borderBottom:"1px solid #F5F6FA", background: isLeaveDay ? "rgba(239,68,68,0.02)" : isHoliday ? "rgba(99,102,241,0.02)" : undefined }}>
                                    <td style={{ padding:"9px 10px", fontWeight:700, color:"#111111", whiteSpace:"nowrap" }}>{dateLabel}</td>
                                    <td style={{ padding:"9px 10px", color:"#9CA3AF" }}>{dayLabel}</td>
                                    <td style={{ padding:"9px 10px" }}>
                                      {isLeaveDay
                                        ? <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"rgba(239,68,68,0.1)", color:"#EF4444" }}>On Leave</span>
                                        : isHoliday
                                        ? <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"rgba(99,102,241,0.1)", color:"#6366F1" }}>Holiday</span>
                                        : <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"rgba(0,0,0,0.04)", color:"#9CA3AF" }}>No Record</span>
                                      }
                                    </td>
                                    <td colSpan={3} style={{ padding:"9px 10px", color: isHoliday ? "#6366F1" : "#D1D5DB", fontSize: isHoliday ? 11 : undefined, fontWeight: isHoliday ? 600 : undefined }}>{isHoliday ? holidayInfo!.name : "—"}</td>
                                    <td style={{ padding:"9px 10px" }} />
                                    <td style={{ padding:"9px 10px" }} />
                                  </tr>
                                )
                              }
                              const workedH = l.worked_hours ?? 0
                              const isEditing = editingDate === l.date
                              return (
                                <Fragment key={l.date}>
                                  <tr style={{ borderBottom:"1px solid #F5F6FA", background: l.date===today ? "rgba(222,26,26,0.03)" : "transparent" }}>
                                    <td style={{ padding:"9px 10px", fontWeight:700, color:"#111111", whiteSpace:"nowrap" }}>{dateLabel}</td>
                                    <td style={{ padding:"9px 10px", color:"#9CA3AF" }}>{dayLabel}</td>
                                    <td style={{ padding:"9px 10px" }}>
                                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background: l.status==="present" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: l.status==="present" ? "#16A34A" : "#EF4444" }}>
                                        {l.status === "present" ? "Present" : "On Leave"}
                                      </span>
                                    </td>
                                    <td style={{ padding:"9px 10px", color:"#6B7280", textTransform:"capitalize" }}>{l.work_type ?? "—"}</td>
                                    <td style={{ padding:"9px 10px", color:"#111111", whiteSpace:"nowrap" }}>{fmtTime(l.clock_in)}</td>
                                    <td style={{ padding:"9px 10px", color: l.clock_out ? "#111111" : "#EF4444", whiteSpace:"nowrap" }}>{l.clock_out ? fmtTime(l.clock_out) : "—"}</td>
                                    <td style={{ padding:"9px 10px", fontWeight:700, color:"#374151" }}>{workedH > 0 ? fmtHoursShort(Math.round(workedH*10)/10) : "—"}</td>
                                    <td style={{ padding:"9px 10px" }}>
                                      {l.status === "present" && (
                                        <button onClick={() => isEditing ? setEditingDate(null) : openEditTimes(l.date, l.clock_in, l.clock_out)}
                                          style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8, background: isEditing ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", color:"#6366F1", cursor:"pointer" }}>
                                          ✏️ Edit
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                  {isEditing && (
                                    <tr style={{ background:"rgba(99,102,241,0.03)" }}>
                                      <td colSpan={8} style={{ padding:"12px 10px" }}>
                                        <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"flex-end" }}>
                                          <div>
                                            <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", marginBottom:3 }}>LOGIN</label>
                                            <input type="time" value={editCIn} onChange={e => setEditCIn(e.target.value)}
                                              style={{ padding:"6px 10px", borderRadius:8, border:"1.5px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none" }}/>
                                          </div>
                                          <div>
                                            <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", marginBottom:3 }}>LOGOUT</label>
                                            <input type="time" value={editCOut} onChange={e => setEditCOut(e.target.value)}
                                              style={{ padding:"6px 10px", borderRadius:8, border:"1.5px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none" }}/>
                                          </div>
                                          <button onClick={() => handleEditTimes()} disabled={editSaving || !editCIn}
                                            style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:8, background:"#6366F1", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:editSaving?0.6:1 }}>
                                            {editSaving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>} Save
                                          </button>
                                          <button onClick={() => setEditingDate(null)} style={{ padding:"7px 12px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                          {editError && <span style={{ fontSize:11, color:"#EF4444", fontWeight:600 }}>{editError}</span>}
                                          {editSaved  && <span style={{ fontSize:11, color:"#16A34A", fontWeight:600 }}>✓ Saved</span>}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  }
                </>
              )
            })()}
            {!rangeLoading && rangeLogs === null && customFrom === "" && (
              <p className="text-[13px]" style={{ color: "#9CA3AF" }}>Select a From and To date, then click Search.</p>
            )}
          </>
        )}

        {/* ── Range mode (Last 7 / This Month / Last Month) ── */}
        {rangeMode !== "date" && (
          <>
            {rangeLoading && <p className="text-[13px]" style={{ color: "#9CA3AF" }}>Loading…</p>}
            {!rangeLoading && rangeLogs && (
              <>

                {/* Table */}
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ background:"#F5F6FA" }}>
                        {["Date","Day","Status","Mode","Login","Logout","Break","Office Hrs","Worked",""].map(h => (
                          <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontWeight:700, color:"#6B7280", fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(rangeFrom ? allDatesInRange(rangeFrom, rangeTo, today) : rangeLogs.map(l=>l.date)).map(date => {
                        const l = rangeLogs.find(r => r.date === date)
                        const dayLabel  = new Date(date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"})
                        const dateLabel = new Date(date+"T12:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short"})
                        if (!l) {
                          const isLeaveDay  = rangeLeaveDates.includes(date)
                          const holidayInfo = rangeHolidayDates.find(h => h.date === date)
                          const isHoliday   = !!holidayInfo
                          return (
                          <tr key={date} style={{ borderBottom:"1px solid #F5F6FA", background: isLeaveDay ? "rgba(239,68,68,0.02)" : isHoliday ? "rgba(99,102,241,0.02)" : undefined }}>
                            <td style={{ padding:"9px 10px", fontWeight:700, color:"#111111", whiteSpace:"nowrap" }}>{dateLabel}</td>
                            <td style={{ padding:"9px 10px", color:"#9CA3AF" }}>{dayLabel}</td>
                            <td style={{ padding:"9px 10px" }}>
                              {isLeaveDay
                                ? <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"rgba(239,68,68,0.1)", color:"#EF4444" }}>On Leave</span>
                                : isHoliday
                                ? <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"rgba(99,102,241,0.1)", color:"#6366F1" }}>Holiday</span>
                                : <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:"rgba(0,0,0,0.04)", color:"#9CA3AF" }}>No Record</span>
                              }
                            </td>
                            <td colSpan={5} style={{ padding:"9px 10px", color: isHoliday ? "#6366F1" : "#D1D5DB", fontSize: isHoliday ? 11 : undefined, fontWeight: isHoliday ? 600 : undefined }}>{isHoliday ? holidayInfo!.name : "—"}</td>
                            <td style={{ padding:"9px 10px" }} />
                            <td style={{ padding:"9px 10px" }} />
                          </tr>
                        )}
                        const isToday   = l.date === today
                        const isInProgress = isToday && !!l.clock_in && !l.clock_out
                        const officeH  = l.clock_in
                          ? calcHours(l.clock_in, l.clock_out)   // uses Date.now() when clock_out=null
                          : 0
                        const workedH  = l.worked_hours && l.worked_hours > 0
                          ? l.worked_hours
                          : (isInProgress && l.clock_in ? Math.max(0, calcHoursNet(l.clock_in, null, l.break_total_mins ?? 0, null) ) : 0)
                        // Break: use work_entries-based break; fall back to clock break only for in-progress today
                        const breakH = (l.entries_break_hours ?? 0) > 0
                          ? l.entries_break_hours
                          : (isInProgress ? (l.break_total_mins ?? 0) / 60 : 0)
                        const isEditing = editingDate === l.date
                        return (
                          <Fragment key={l.date}>
                            <tr style={{ borderBottom:"1px solid #F5F6FA", background: isToday ? "rgba(222,26,26,0.03)" : "transparent" }}>
                              <td style={{ padding:"9px 10px", fontWeight:700, color:"#111111", whiteSpace:"nowrap" }}>{dateLabel}</td>
                              <td style={{ padding:"9px 10px", color:"#9CA3AF" }}>{dayLabel}</td>
                              <td style={{ padding:"9px 10px" }}>
                                <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background: l.status==="present" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: l.status==="present" ? "#16A34A" : "#EF4444" }}>
                                  {l.status === "present" ? "Present" : "On Leave"}
                                </span>
                              </td>
                              <td style={{ padding:"9px 10px", color:"#6B7280", textTransform:"capitalize" }}>{l.work_type ?? "—"}</td>
                              <td style={{ padding:"9px 10px", color:"#111111", whiteSpace:"nowrap" }}>{fmtTime(l.clock_in)}</td>
                              <td style={{ padding:"9px 10px", color: l.clock_out ? "#111111" : isInProgress ? "#F59E0B" : "#EF4444", whiteSpace:"nowrap", fontStyle: isInProgress ? "italic" : "normal", fontSize: isInProgress ? 10 : 12 }}>
                                {l.clock_out ? fmtTime(l.clock_out) : isInProgress ? "In Progress…" : "—"}
                              </td>
                              <td style={{ padding:"9px 10px", fontWeight:600, color: breakH > 0 ? "#F59E0B" : "#D1D5DB" }}>{breakH > 0 ? fmtHoursShort(Math.round(breakH*10)/10) : "—"}</td>
                              <td style={{ padding:"9px 10px", fontWeight:700, color: isInProgress ? "#9CA3AF" : "#374151" }}>{officeH > 0 ? `${fmtHoursShort(Math.round(officeH*10)/10)}${isInProgress ? "~" : ""}` : "—"}</td>
                              <td style={{ padding:"9px 10px", fontWeight:700, color: isInProgress ? "#F59E0B" : "#111111" }}>{workedH > 0 ? `${fmtHoursShort(Math.round(workedH*10)/10)}${isInProgress ? "~" : ""}` : "—"}</td>
                              <td style={{ padding:"9px 10px" }}>
                                {l.status === "present" && (
                                  <button onClick={() => isEditing ? setEditingDate(null) : openEditTimes(l.date, l.clock_in, l.clock_out, l.break_in, l.break_out)}
                                    style={{ fontSize:10, fontWeight:700, padding:"3px 10px", borderRadius:8, background: isEditing ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.08)", border:"1px solid rgba(99,102,241,0.2)", color:"#6366F1", cursor:"pointer" }}>
                                    ✏️ Edit
                                  </button>
                                )}
                              </td>
                            </tr>
                            {isEditing && (
                              <tr style={{ background:"rgba(99,102,241,0.03)" }}>
                                <td colSpan={9} style={{ padding:"12px 10px" }}>
                                  <div style={{ display:"flex", flexWrap:"wrap", gap:10, alignItems:"flex-end" }}>
                                    <div>
                                      <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", marginBottom:3 }}>LOGIN</label>
                                      <input type="time" value={editCIn} onChange={e => setEditCIn(e.target.value)}
                                        style={{ padding:"6px 10px", borderRadius:8, border:"1.5px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none" }}/>
                                    </div>
                                    <div>
                                      <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#6B7280", marginBottom:3 }}>LOGOUT</label>
                                      <input type="time" value={editCOut} onChange={e => setEditCOut(e.target.value)}
                                        style={{ padding:"6px 10px", borderRadius:8, border:"1.5px solid #E5E7EB", fontSize:12, color:"#111111", outline:"none" }}/>
                                    </div>
                                    <button onClick={() => handleEditTimes()} disabled={editSaving || !editCIn}
                                      style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 14px", borderRadius:8, background:"#6366F1", border:"none", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", opacity:editSaving?0.6:1 }}>
                                      {editSaving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>} Save
                                    </button>
                                    <button onClick={() => setEditingDate(null)} style={{ padding:"7px 12px", borderRadius:8, background:"#F3F4F6", border:"none", fontSize:12, fontWeight:600, color:"#6B7280", cursor:"pointer" }}>Cancel</button>
                                    {editError && <span style={{ fontSize:11, color:"#EF4444", fontWeight:600 }}>{editError}</span>}
                                    {editSaved  && <span style={{ fontSize:11, color:"#16A34A", fontWeight:600 }}>✓ Saved</span>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </div>

    </div>

    {/* 13h+ confirmation for a manually-entered logout time (yesterday-block / edit-times) */}
    {pendingTimeConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.45)" }}>
        <div className="rounded-2xl p-6 max-w-[340px] w-full mx-4 space-y-4" style={{ background: "#fff", boxShadow: "0 8px 48px rgba(0,0,0,0.18)" }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={22} style={{ color: "#D97706", flexShrink: 0 }} />
            <p className="text-[15px] font-black" style={{ color: "#111" }}>Long Work Span</p>
          </div>
          <p className="text-[13px]" style={{ color: "#6B7280" }}>{pendingTimeConfirm.message}</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const kind = pendingTimeConfirm.kind
                setPendingTimeConfirm(null)
                if (kind === "yesterday") {
                  setYesLogoutSaving(true); setYesLogoutError(null)
                  startTransition(async () => {
                    const res = await manualClockOut(yesterdayStr, yesLogoutTime, true)
                    setYesLogoutSaving(false)
                    if (res.success) setYesLogoutSaved(true)
                    else setYesLogoutError(res.error ?? "Failed to save")
                  })
                } else {
                  handleEditTimes(true)
                }
              }}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-bold"
              style={{ background: "#de1a1a", color: "#fff" }}>
              Yes, That&apos;s Correct
            </button>
            <button
              onClick={() => setPendingTimeConfirm(null)}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
              style={{ background: "#F3F4F6", color: "#6B7280" }}>
              No, Let Me Fix It
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  )
}
