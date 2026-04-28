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
    <div className="rounded-2xl p-5 flex items-center justify-between"
      style={{
        background: isIn
          ? "rgba(16,185,129,0.06)"
          : isDone
          ? "rgba(109,93,246,0.06)"
          : "rgba(255,255,255,0.03)",
        border: isIn
          ? "1px solid rgba(16,185,129,0.2)"
          : isDone
          ? "1px solid rgba(109,93,246,0.2)"
          : "1px solid rgba(255,255,255,0.08)",
      }}>
      <div>
        <p className="text-[11px] uppercase tracking-widest font-sans font-semibold mb-1"
          style={{ color: isIn ? "#10B981" : isDone ? "#6D5DF6" : "#6B7280" }}>
          {isIn ? "Currently Working" : isDone ? "Work Complete" : "Not Clocked In"}
        </p>
        {notStarted && (
          <p className="text-[13px] font-sans" style={{ color: "#E6EDF3" }}>
            Clock in to start tracking your day
          </p>
        )}
        {(isIn || isDone) && (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[13px] font-sans" style={{ color: "#E6EDF3" }}>
              In: <strong>{fmtTime(clockInTime)}</strong>
            </span>
            {isDone && (
              <span className="text-[13px] font-sans" style={{ color: "#E6EDF3" }}>
                Out: <strong>{fmtTime(clockOutTime)}</strong>
              </span>
            )}
            {isIn && clockInTime && (
              <span className="text-[12px] font-semibold font-sans px-2 py-0.5 rounded-full"
                style={{ background: "rgba(16,185,129,0.12)", color: "#10B981" }}>
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
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white disabled:opacity-60 flex-shrink-0"
          style={{
            background: isIn
              ? "linear-gradient(135deg, #FF6B57, #E85A45)"
              : "linear-gradient(135deg, #10B981, #059669)",
            boxShadow: isIn
              ? "0 4px 16px rgba(255,107,87,0.3)"
              : "0 4px 16px rgba(16,185,129,0.3)",
          }}>
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
        <span className="text-[11px] font-semibold font-sans px-3 py-1.5 rounded-full flex-shrink-0"
          style={{ background: "rgba(109,93,246,0.12)", color: "#6D5DF6" }}>
          Day Complete ✓
        </span>
      )}
    </div>
  )
}
