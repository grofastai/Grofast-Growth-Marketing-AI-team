"use client"

import { ChevronDown } from "lucide-react"

export const OWN_BRANDS = ["Masala Unlimit", "Kutty Karthi Vlog", "GroFast Digital", "A2Z Automobile", "Kaka Mutta"]

interface Props {
  clientOptions: string[]
  value: string          // "Promotion" | "__custom__" | "<client name>" | ""
  brand?: string         // selected brand when value="Promotion"
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
  clientOptions, value, brand = "", customClient = "",
  onValueChange, onBrandChange, onCustomChange,
  label = "Client / Project", required = false, fieldStyle,
}: Props) {
  return (
    <div>
      {label && <label style={LABEL}>{label}{required && " *"}</label>}

      {/* Main dropdown */}
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={e => {
            const v = e.target.value
            onValueChange(v)
            if (v !== "Promotion") onBrandChange?.("")
            if (v !== "__custom__") onCustomChange?.("")
          }}
          style={{ ...BASE, ...fieldStyle }}
        >
          <option value="">Select client…</option>
          <option value="Promotion">📣 Our Brand</option>
          {clientOptions.map(n => <option key={n} value={n}>{n}</option>)}
          <option value="__custom__">✏️ Other (type manually)</option>
        </select>
        <ChevronDown size={11} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
      </div>

      {/* Our Brand → brand picker */}
      {value === "Promotion" && (
        <div style={{ position: "relative", marginTop: 6 }}>
          <select
            value={brand}
            onChange={e => onBrandChange?.(e.target.value)}
            style={{ ...BASE, ...fieldStyle, color: "#D97706", background: "rgba(245,158,11,0.05)", border: "1.5px solid rgba(245,158,11,0.3)" }}
          >
            <option value="">📣 Select brand…</option>
            {OWN_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <ChevronDown size={11} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#D97706", pointerEvents: "none" }} />
        </div>
      )}

      {/* Other → text input */}
      {value === "__custom__" && (
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
  if (value === "Promotion") return brand || "Our Brand"
  if (value === "__custom__") return customClient || ""
  return value
}
