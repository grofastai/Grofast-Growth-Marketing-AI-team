"use client"
import { useState, useEffect } from "react"

// Parses stored duration strings (old: "30 sec", "1 min", "4.5 min"; new: "1 min 30 sec")
function parseDuration(val: string): { mins: number; secs: number } {
  if (!val) return { mins: 0, secs: 0 }
  // New format: "X min Y sec" or "X min" or "Y sec"
  const full = val.match(/^(\d+)\s*min\s+(\d+)\s*sec$/)
  if (full) return { mins: parseInt(full[1]), secs: parseInt(full[2]) }
  const minOnly = val.match(/^([\d.]+)\s*min$/)
  if (minOnly) {
    const m = parseFloat(minOnly[1])
    return { mins: Math.floor(m), secs: Math.round((m % 1) * 60) }
  }
  const secOnly = val.match(/^(\d+)\s*sec$/)
  if (secOnly) return { mins: 0, secs: parseInt(secOnly[1]) }
  return { mins: 0, secs: 0 }
}

function formatDuration(mins: number, secs: number): string {
  if (mins === 0 && secs === 0) return ""
  if (mins === 0) return `${secs} sec`
  if (secs === 0) return `${mins} min`
  return `${mins} min ${secs} sec`
}

interface Props {
  value: string
  onChange: (val: string) => void
  style?: React.CSSProperties
  inputStyle?: React.CSSProperties
}

export function VideoDurationPicker({ value, onChange, style, inputStyle }: Props) {
  const parsed = parseDuration(value)
  const [mins, setMins] = useState(parsed.mins)
  const [secs, setSecs] = useState(parsed.secs)

  // Sync when external value changes (e.g. editing an existing entry)
  useEffect(() => {
    const p = parseDuration(value)
    setMins(p.mins)
    setSecs(p.secs)
  }, [value])

  function handleMins(v: number) {
    const m = Math.max(0, Math.min(999, v || 0))
    setMins(m)
    onChange(formatDuration(m, secs))
  }

  function handleSecs(v: number) {
    const s = Math.max(0, Math.min(59, v || 0))
    setSecs(s)
    onChange(formatDuration(mins, s))
  }

  const base: React.CSSProperties = {
    background: "#F9FAFB", border: "1.5px solid #EBEDF2", color: "#111827",
    borderRadius: 8, padding: "7px 10px", fontSize: 13, outline: "none",
    width: 64, textAlign: "center", boxSizing: "border-box",
    ...inputStyle,
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, ...style }}>
      <input
        type="number" min={0} max={999} value={mins === 0 ? "" : mins}
        placeholder="0"
        onChange={ev => handleMins(parseInt(ev.target.value) || 0)}
        style={base}
      />
      <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>min</span>
      <input
        type="number" min={0} max={59} value={secs === 0 ? "" : secs}
        placeholder="0"
        onChange={ev => handleSecs(parseInt(ev.target.value) || 0)}
        style={base}
      />
      <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 600 }}>sec</span>
      {(mins > 0 || secs > 0) && (
        <span style={{ fontSize: 11, fontWeight: 700, color: "#6366F1", background: "rgba(99,102,241,0.08)", padding: "3px 8px", borderRadius: 6 }}>
          {formatDuration(mins, secs)}
        </span>
      )}
    </div>
  )
}
