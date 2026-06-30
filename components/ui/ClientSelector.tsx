"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

interface Props {
  clientOptions: string[]
  pastClientOptions?: string[]
  value: string          // "__custom__" | "<client name>" | ""
  brand?: string
  customClient?: string  // typed name when value="__custom__"
  onValueChange: (v: string) => void
  onBrandChange?: (b: string) => void
  onCustomChange?: (c: string) => void
  label?: string
  required?: boolean
  fieldStyle?: React.CSSProperties
}

const BASE: React.CSSProperties = {
  width: "100%", fontSize: 12, fontWeight: 600, color: "#374151",
  background: "#fff", border: "1.5px solid #EBEDF2", borderRadius: 10,
  padding: "8px 28px 8px 10px", cursor: "pointer", outline: "none", appearance: "none" as const,
}

const LABEL: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, color: "#374151",
  textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: 5,
}

export default function ClientSelector({
  clientOptions, pastClientOptions = [], value, brand = "", customClient = "",
  onValueChange, onBrandChange, onCustomChange,
  label = "Client / Project", required = false, fieldStyle,
}: Props) {
  const [showPast, setShowPast] = useState(false)

  return (
    <div>
      {label && <label style={LABEL}>{label}{required && " *"}</label>}

      {/* Main dropdown */}
      <div style={{ position: "relative" }}>
        {showPast ? (
          <select
            value=""
            onChange={e => {
              const v = e.target.value
              if (v === "__back__") { setShowPast(false); return }
              onValueChange(v)
              onCustomChange?.("")
              setShowPast(false)
            }}
            style={{ ...BASE, ...fieldStyle }}
          >
            <option value="__back__">← Back to Active Clients</option>
            {pastClientOptions.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        ) : (
          <select
            value={value}
            onChange={e => {
              const v = e.target.value
              if (v === "__past__") { setShowPast(true); return }
              onValueChange(v)
              if (v !== "__custom__") onCustomChange?.("")
            }}
            style={{ ...BASE, ...fieldStyle }}
          >
            <option value="">Select client…</option>
            {clientOptions.map(n => <option key={n} value={n}>{n}</option>)}
            {value && !clientOptions.includes(value) && pastClientOptions.includes(value) && (
              <option key={value} value={value}>{value}</option>
            )}
            {pastClientOptions.length > 0 && <option value="__past__">📁 Past Clients →</option>}
            <option value="__custom__">✏️ Other (type manually)</option>
          </select>
        )}
        <ChevronDown size={11} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
      </div>

      {/* Other → text input */}
      {value === "__custom__" && !showPast && (
        <input
          value={customClient}
          onChange={e => onCustomChange?.(e.target.value)}
          placeholder="Type client name…"
          style={{ ...BASE, ...fieldStyle, marginTop: 6, padding: "8px 10px" }}
        />
      )}
    </div>
  )
}

/** Resolve the final client name string to save */
export function resolveClientName(value: string, brand: string, customClient: string): string {
  if (value === "__custom__") return customClient || ""
  return value
}
