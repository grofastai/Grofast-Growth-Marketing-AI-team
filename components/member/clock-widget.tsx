"use client"

import { useState, useTransition } from "react"
import { LogIn, LogOut, Loader2, Home, Building2, XCircle, CheckCircle2 } from "lucide-react"
import { clockIn, clockOut, markAbsent } from "@/lib/actions/attendance"

interface Props {
  clockInTime: string | null
  clockOutTime: string | null
  workType: 'wfh' | 'office' | null
  attendanceStatus: 'present' | 'absent' | null
}

function fmtTime(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
}

function calcDuration(clockInIso: string, clockOutIso: string | null) {
  const end = clockOutIso ? new Date(clockOutIso).getTime() : Date.now()
  const mins = Math.floor((end - new Date(clockInIso).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function ClockWidget({ clockInTime, clockOutTime, workType, attendanceStatus }: Props) {
  const [isPending, startTransition] = useTransition()
  const [selectedMode, setSelectedMode] = useState<'wfh' | 'office'>('office')
  const [error, setError] = useState<string | null>(null)

  const isAbsent   = attendanceStatus === 'absent'
  const isIn       = !!clockInTime && !clockOutTime && attendanceStatus === 'present'
  const isDone     = !!clockInTime && !!clockOutTime && attendanceStatus === 'present'
  const notLogged  = !attendanceStatus

  function handleClockIn() {
    setError(null)
    startTransition(async () => {
      const res = await clockIn(selectedMode)
      if (!res.success) setError(res.error ?? 'Failed')
    })
  }

  function handleClockOut() {
    setError(null)
    startTransition(async () => {
      const res = await clockOut()
      if (!res.success) setError(res.error ?? 'Failed')
    })
  }

  function handleAbsent() {
    setError(null)
    startTransition(async () => {
      const res = await markAbsent()
      if (!res.success) setError(res.error ?? 'Failed')
    })
  }

  const WORK_TYPE_LABEL: Record<string, string> = { wfh: 'WFH', office: 'Office' }
  const WORK_TYPE_ICON = { wfh: Home, office: Building2 }

  // ── Absent state ───────────────────────────────────────────────────────────
  if (isAbsent) {
    return (
      <div className="rounded-xl p-5 flex items-center justify-between"
        style={{ background: "#262626", border: "1px solid rgba(255,100,100,0.2)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,100,100,0.1)" }}>
            <XCircle size={20} style={{ color: "#FF6464" }} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-0.5"
              style={{ color: "rgba(255,100,100,0.7)" }}>Marked Absent</p>
            <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.4)" }}>Absence recorded for today</p>
          </div>
        </div>
        <span className="text-[11px] font-bold px-3 py-1.5 rounded-full"
          style={{ background: "rgba(255,100,100,0.08)", color: "#FF6464", border: "1px solid rgba(255,100,100,0.15)" }}>
          Absent
        </span>
      </div>
    )
  }

  // ── Day complete ───────────────────────────────────────────────────────────
  if (isDone) {
    const WorkIcon = workType ? WORK_TYPE_ICON[workType] : Building2
    return (
      <div className="rounded-xl p-5 flex items-center justify-between"
        style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(163,230,53,0.08)" }}>
            <CheckCircle2 size={20} style={{ color: "#A3E635" }} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-1"
              style={{ color: "rgba(255,255,255,0.4)" }}>Day Complete</p>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-[13px]" style={{ color: "#FFFFFF" }}>
                In: <strong>{fmtTime(clockInTime)}</strong>
              </span>
              <span className="text-[13px]" style={{ color: "#FFFFFF" }}>
                Out: <strong>{fmtTime(clockOutTime)}</strong>
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(163,230,53,0.1)", color: "#A3E635" }}>
                {calcDuration(clockInTime!, clockOutTime)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {workType && (
            <span className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)", border: "1px solid #2A2A2A" }}>
              <WorkIcon size={11} />
              {WORK_TYPE_LABEL[workType]}
            </span>
          )}
          <span className="text-[11px] font-bold px-3 py-1.5 rounded-full"
            style={{ background: "rgba(163,230,53,0.08)", color: "#A3E635", border: "1px solid rgba(163,230,53,0.15)" }}>
            Present ✓
          </span>
        </div>
      </div>
    )
  }

  // ── Clocked in (working) ───────────────────────────────────────────────────
  if (isIn) {
    const WorkIcon = workType ? WORK_TYPE_ICON[workType] : Building2
    return (
      <div className="rounded-xl p-5 flex items-center justify-between"
        style={{ background: "#262626", border: "1px solid rgba(163,230,53,0.25)" }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center relative"
            style={{ background: "rgba(163,230,53,0.1)" }}>
            <LogIn size={18} style={{ color: "#A3E635" }} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
              style={{ background: "#A3E635", boxShadow: "0 0 0 2px #262626" }} />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-1"
              style={{ color: "#A3E635" }}>Currently Working</p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[13px]" style={{ color: "#FFFFFF" }}>
                Since <strong>{fmtTime(clockInTime)}</strong>
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(163,230,53,0.1)", color: "#A3E635" }}>
                {calcDuration(clockInTime!, null)}
              </span>
              {workType && (
                <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.5)" }}>
                  <WorkIcon size={10} />
                  {WORK_TYPE_LABEL[workType]}
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={handleClockOut}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-bold disabled:opacity-50 transition-all"
          style={{ background: "#262626", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}>
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
          Clock Out
        </button>
      </div>
    )
  }

  // ── Not logged yet ─────────────────────────────────────────────────────────
  return (
    <div className="rounded-xl p-5"
      style={{ background: "#262626", border: "1px solid #2A2A2A" }}>
      <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-3"
        style={{ color: "rgba(255,255,255,0.25)" }}>Attendance</p>

      <div className="flex items-center gap-3 flex-wrap">
        {/* WFH / Office toggle */}
        <div className="flex items-center rounded-lg overflow-hidden"
          style={{ border: "1px solid #333" }}>
          {(['office', 'wfh'] as const).map((mode) => {
            const Icon = WORK_TYPE_ICON[mode]
            const active = selectedMode === mode
            return (
              <button
                key={mode}
                onClick={() => setSelectedMode(mode)}
                disabled={isPending}
                className="flex items-center gap-1.5 px-4 py-2.5 text-[12px] font-bold transition-all"
                style={{
                  background: active ? "#A3E635" : "transparent",
                  color: active ? "#0D0D0D" : "rgba(255,255,255,0.35)",
                }}>
                <Icon size={12} />
                {mode === 'wfh' ? 'WFH' : 'Office'}
              </button>
            )
          })}
        </div>

        {/* Clock In */}
        <button
          onClick={handleClockIn}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-bold disabled:opacity-50 transition-all"
          style={{ background: "#A3E635", color: "#0D0D0D" }}>
          {isPending ? <Loader2 size={13} className="animate-spin" /> : <LogIn size={13} />}
          Clock In
        </button>

        {/* Mark Absent */}
        <button
          onClick={handleAbsent}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[12px] font-bold disabled:opacity-50 transition-all"
          style={{ background: "transparent", border: "1px solid rgba(255,100,100,0.2)", color: "rgba(255,100,100,0.6)" }}>
          {isPending ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
          Mark Absent
        </button>
      </div>

      {error && (
        <p className="mt-2 text-[12px]" style={{ color: "#FF7070" }}>{error}</p>
      )}
    </div>
  )
}
