"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

interface Props {
  clientOptions: string[]
  pastClientOptions?: string[]
  value: string
  onValueChange: (v: string) => void
  label?: string
  required?: boolean
  fieldStyle?: React.CSSProperties
  excludeOptions?: string[]
  placeholder?: string
  // Deprecated — kept only so older call sites compile unchanged. The
  // "Other (type manually)" free-text option has been removed everywhere;
  // client_name must always come from the real client list now.
  brand?: string
  customClient?: string
  onBrandChange?: (b: string) => void
  onCustomChange?: (c: string) => void
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

// Single shared client picker used throughout the app (Daily Update, History,
// Tasks, Freelancers, Content Calendar, Goals, ...) — Active list, then a
// "Past Clients →" browse toggle, no free-typing.
//
// `value=""` with no matching <option value=""> is what causes a native
// <select> to silently pre-highlight its first listed option without it
// actually being selected — clicking that same option again then fires no
// onChange at all (nothing "changed" as far as the browser is concerned).
// That's why the past-clients view always renders an explicit
// `<option value="">` first: it guarantees there's a real option matching
// the empty value, so "← Back to Active Clients" always fires onChange.
export default function ClientSelector({
  clientOptions, pastClientOptions = [], value, onValueChange,
  label = "Client / Project", required = false, fieldStyle,
  excludeOptions = [], placeholder = "Select client…",
}: Props) {
  const [browsingPast, setBrowsingPast] = useState(false)
  const inPastView = browsingPast || (value !== "" && pastClientOptions.includes(value))

  return (
    <div>
      {label && <label style={LABEL}>{label}{required && " *"}</label>}
      <div style={{ position: "relative" }}>
        <select
          value={value}
          onChange={e => {
            const v = e.target.value
            if (v === "__back__") {
              setBrowsingPast(false)
              // Only clear if there was a real (already-picked past-client) value showing —
              // for multi-select callers `value` is always "" while browsing, so this is a no-op for them.
              if (value !== "") onValueChange("")
              return
            }
            if (v === "__past__") { setBrowsingPast(true); return }
            if (!v) return
            setBrowsingPast(false)
            onValueChange(v)
          }}
          style={{ ...BASE, ...fieldStyle }}
        >
          {inPastView ? (
            <>
              <option value="">📁 Past Clients</option>
              <option value="__back__">← Back to Active Clients</option>
              {pastClientOptions.filter(n => !excludeOptions.includes(n)).map(n => <option key={n} value={n}>{n}</option>)}
            </>
          ) : (
            <>
              <option value="">{placeholder}</option>
              {clientOptions.filter(n => !excludeOptions.includes(n)).map(n => <option key={n} value={n}>{n}</option>)}
              {pastClientOptions.length > 0 && <option value="__past__">📁 Past Clients →</option>}
            </>
          )}
        </select>
        <ChevronDown size={11} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }} />
      </div>
    </div>
  )
}

/** Resolve the final client name string to save. Kept for older call sites — always just the picked value now. */
export function resolveClientName(value: string, ..._unused: unknown[]): string {
  return value
}
