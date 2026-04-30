"use client"

import { useState, useTransition } from "react"
import {
  LogIn, LogOut, Loader2, Home, Building2, XCircle,
  CheckCircle2, Clock, Calendar,
} from "lucide-react"
import { clockIn, clockOut, markAbsent } from "@/lib/actions/attendance"
import { useRouter } from "next/navigation"

type AttLog = {
  id: string
  date: string
  clock_in: string | null
  clock_out: string | null
  work_type: string | null
  status: string
}

interface Props {
  todayLog: AttLog | null
  history: AttLog[]
  today: string
}

function fmtTime(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
}

function calcDuration(inIso: string, outIso: string | null) {
  const end = outIso ? new Date(outIso).getTime() : Date.now()
  const mins = Math.floor((end - new Date(inIso).getTime()) / 60000)
  if (mins < 1) return "< 1m"
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", day: "numeric", month: "short",
  })
}

export default function AttendanceClient({ todayLog, history, today }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedMode, setSelectedMode] = useState<"wfh" | "office">("office")
  const [error, setError] = useState<string | null>(null)

  const isAbsent  = todayLog?.status === "absent"
  const isIn      = !!todayLog?.clock_in && !todayLog?.clock_out && todayLog?.status === "present"
  const isDone    = !!todayLog?.clock_in && !!todayLog?.clock_out && todayLog?.status === "present"
  const notLogged = !todayLog

  function handle(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) setError(res.error ?? "Something went wrong")
      else router.refresh()
    })
  }

  const workTypeLabel: Record<string, string> = { wfh: "WFH", office: "Office" }
  const WorkIcon = todayLog?.work_type === "wfh" ? Home : Building2

  // ── Today card ─────────────────────────────────────────────────────────────
  let statusColor = "rgba(255,255,255,0.25)"
  let statusBg    = "rgba(255,255,255,0.03)"
  let statusBorder = "#1A1A1A"
  if (isIn)      { statusColor = "#A3E635"; statusBg = "rgba(163,230,53,0.04)"; statusBorder = "rgba(163,230,53,0.2)" }
  if (isDone)    { statusColor = "#A3E635"; statusBg = "rgba(163,230,53,0.04)"; statusBorder = "rgba(163,230,53,0.15)" }
  if (isAbsent)  { statusColor = "#FF6464"; statusBg = "rgba(255,100,100,0.04)"; statusBorder = "rgba(255,100,100,0.2)" }

  return (
    <div className="p-8 max-w-[720px]">
      {/* Header */}
      <div className="mb-7">
        <h1 className="text-[30px] font-black leading-tight"
          style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
          Attendance
        </h1>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* ── Today card ── */}
      <div className="rounded-xl p-6 mb-6"
        style={{ background: statusBg, border: `1px solid ${statusBorder}` }}>

        <div className="flex items-center gap-2 mb-5">
          <Calendar size={13} style={{ color: statusColor }} />
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: statusColor }}>
            Today
          </p>
        </div>

        {/* Not logged yet */}
        {notLogged && (
          <div className="space-y-4">
            {/* Work type selector */}
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] font-bold mb-2.5"
                style={{ color: "rgba(255,255,255,0.3)" }}>Work Location</p>
              <div className="flex gap-2">
                {(["office", "wfh"] as const).map((mode) => {
                  const Icon = mode === "wfh" ? Home : Building2
                  const active = selectedMode === mode
                  return (
                    <button
                      key={mode}
                      onClick={() => setSelectedMode(mode)}
                      disabled={isPending}
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

            {/* Action buttons */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => handle(() => clockIn(selectedMode))}
                disabled={isPending}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-[14px] font-bold disabled:opacity-50 transition-all"
                style={{ background: "#A3E635", color: "#0D0D0D" }}>
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
                Clock In
              </button>
              <button
                onClick={() => handle(markAbsent)}
                disabled={isPending}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-[13px] font-bold disabled:opacity-50 transition-all"
                style={{ background: "transparent", border: "1px solid rgba(255,100,100,0.25)", color: "rgba(255,100,100,0.7)" }}>
                {isPending ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                Mark Absent
              </button>
            </div>
            {error && <p className="text-[12px]" style={{ color: "#FF7070" }}>{error}</p>}
          </div>
        )}

        {/* Clocked in */}
        {isIn && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: "#A3E635" }} />
                <span className="text-[13px] font-bold" style={{ color: "#FFFFFF" }}>
                  Clocked in at {fmtTime(todayLog!.clock_in)}
                </span>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(163,230,53,0.1)", color: "#A3E635" }}>
                {calcDuration(todayLog!.clock_in!, null)}
              </span>
              {todayLog?.work_type && (
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>
                  <WorkIcon size={11} />
                  {workTypeLabel[todayLog.work_type]}
                </span>
              )}
            </div>
            <button
              onClick={() => handle(clockOut)}
              disabled={isPending}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-bold disabled:opacity-50 transition-all"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#FFFFFF" }}>
              {isPending ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />}
              Clock Out
            </button>
            {error && <p className="text-[12px]" style={{ color: "#FF7070" }}>{error}</p>}
          </div>
        )}

        {/* Day done */}
        {isDone && (
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={20} style={{ color: "#A3E635" }} />
              <div>
                <p className="text-[14px] font-bold" style={{ color: "#FFFFFF" }}>Present — Day Complete</p>
                <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.38)" }}>
                  {fmtTime(todayLog!.clock_in)} → {fmtTime(todayLog!.clock_out)}
                  &nbsp;·&nbsp;{calcDuration(todayLog!.clock_in!, todayLog!.clock_out)}
                </p>
              </div>
            </div>
            {todayLog?.work_type && (
              <span className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-1.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid #2A2A2A" }}>
                <WorkIcon size={12} />
                {workTypeLabel[todayLog.work_type]}
              </span>
            )}
          </div>
        )}

        {/* Absent */}
        {isAbsent && (
          <div className="flex items-center gap-3">
            <XCircle size={20} style={{ color: "#FF6464" }} />
            <div>
              <p className="text-[14px] font-bold" style={{ color: "#FFFFFF" }}>Absent Today</p>
              <p className="text-[12px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                Absence has been recorded for today.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── History ── */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={13} style={{ color: "rgba(255,255,255,0.3)" }} />
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold"
              style={{ color: "rgba(255,255,255,0.3)" }}>Recent History</p>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1A1A1A" }}>
            {history.map((log, i) => {
              const present = log.status === "present"
              const absent  = log.status === "absent"
              const HistIcon = log.work_type === "wfh" ? Home : Building2
              return (
                <div key={log.id}
                  className="flex items-center gap-4 px-5 py-3.5"
                  style={{
                    background: i % 2 === 0 ? "#111" : "#0D0D0D",
                    borderTop: i > 0 ? "1px solid #1A1A1A" : "none",
                  }}>
                  {/* Date */}
                  <p className="text-[12px] font-semibold w-24 flex-shrink-0"
                    style={{ color: "rgba(255,255,255,0.55)" }}>
                    {fmtDate(log.date)}
                  </p>

                  {/* Status badge */}
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full w-16 text-center flex-shrink-0"
                    style={present
                      ? { background: "rgba(163,230,53,0.1)", color: "#A3E635" }
                      : { background: "rgba(255,100,100,0.1)", color: "#FF6464" }}>
                    {present ? "Present" : "Absent"}
                  </span>

                  {/* Work type */}
                  {log.work_type && (
                    <span className="flex items-center gap-1 text-[11px] flex-shrink-0"
                      style={{ color: "rgba(255,255,255,0.3)" }}>
                      <HistIcon size={10} />
                      {workTypeLabel[log.work_type]}
                    </span>
                  )}

                  {/* Times */}
                  {present && log.clock_in && (
                    <div className="flex items-center gap-3 ml-auto">
                      <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                        In: <span style={{ color: "#FFFFFF" }}>{fmtTime(log.clock_in)}</span>
                      </span>
                      {log.clock_out && (
                        <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                          Out: <span style={{ color: "#FFFFFF" }}>{fmtTime(log.clock_out)}</span>
                        </span>
                      )}
                      {log.clock_out && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}>
                          {calcDuration(log.clock_in, log.clock_out)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
