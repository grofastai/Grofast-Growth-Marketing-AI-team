"use client"

import { useTransition } from "react"
import { LogIn, LogOut, Loader2 } from "lucide-react"
import { clockIn, clockOut } from "@/lib/actions/attendance"

interface Props {
  clockInTime: string | null
  clockOutTime: string | null
}

function fmtTime(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })
}

function calcDuration(clockInIso: string) {
  const mins = Math.floor((Date.now() - new Date(clockInIso).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export default function ClockWidget({ clockInTime, clockOutTime }: Props) {
  const [isPending, startTransition] = useTransition()

  const isIn = !!clockInTime && !clockOutTime
  const isDone = !!clockInTime && !!clockOutTime
  const notStarted = !clockInTime

  function handleClock() {
    startTransition(async () => {
      if (notStarted) await clockIn()
      else if (isIn) await clockOut()
    })
  }

  return (
    <div className="rounded-xl p-5 flex items-center justify-between"
      style={{
        background: "#262626",
        border: isIn
          ? "1px solid rgba(163,230,53,0.25)"
          : isDone
          ? "1px solid #2A2A2A"
          : "1px solid #2A2A2A",
      }}>
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold mb-1.5"
          style={{ color: isIn ? "#A3E635" : isDone ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.25)" }}>
          {isIn ? "Currently Working" : isDone ? "Work Complete" : "Not Clocked In"}
        </p>
        {notStarted && (
          <p className="text-[13px]" style={{ color: "rgba(255,255,255,0.5)" }}>
            Clock in to start tracking your day
          </p>
        )}
        {(isIn || isDone) && (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[13px]" style={{ color: "#FFFFFF" }}>
              In: <strong>{fmtTime(clockInTime)}</strong>
            </span>
            {isDone && (
              <span className="text-[13px]" style={{ color: "#FFFFFF" }}>
                Out: <strong>{fmtTime(clockOutTime)}</strong>
              </span>
            )}
            {isIn && clockInTime && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(163,230,53,0.1)", color: "#A3E635" }}>
                {calcDuration(clockInTime)}
              </span>
            )}
          </div>
        )}
      </div>

      {!isDone && (
        <button
          onClick={handleClock}
          disabled={isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-bold disabled:opacity-50 flex-shrink-0 transition-all"
          style={isIn
            ? { background: "#262626", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }
            : { background: "#A3E635", color: "#0D0D0D" }
          }>
          {isPending ? (
            <Loader2 size={13} className="animate-spin" />
          ) : isIn ? (
            <LogOut size={13} />
          ) : (
            <LogIn size={13} />
          )}
          {isIn ? "Clock Out" : "Clock In"}
        </button>
      )}

      {isDone && (
        <span className="text-[11px] font-bold px-3 py-1.5 rounded-full flex-shrink-0"
          style={{ background: "rgba(163,230,53,0.08)", color: "#A3E635", border: "1px solid rgba(163,230,53,0.15)" }}>
          Day Complete ✓
        </span>
      )}
    </div>
  )
}
