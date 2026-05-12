"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

type Props = { completed: number; inProgress: number; todo: number; overdue: number }

const SLICES = [
  { key: "completed",  label: "Completed",   color: "#16A34A" },
  { key: "inProgress", label: "In Progress",  color: "#DE1A1A" },
  { key: "todo",       label: "To Do",        color: "#D97706" },
  { key: "overdue",    label: "Overdue",      color: "#7F1D1D" },
] as const

export default function TaskSummaryChart({ completed, inProgress, todo, overdue }: Props) {
  const vals: Record<string, number> = { completed, inProgress, todo, overdue }
  const data = SLICES.map(s => ({ name: s.label, value: vals[s.key], color: s.color })).filter(d => d.value > 0)
  const total = completed + inProgress + todo + overdue

  return (
    <div>
      <div style={{ position: "relative", height: 168 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={total === 0 ? [{ name: "No tasks", value: 1, color: "#E5E7EB" }] : data}
              cx="50%" cy="50%"
              innerRadius={50} outerRadius={76}
              dataKey="value"
              strokeWidth={2}
              stroke="#FFFFFF"
            >
              {(total === 0 ? [{ color: "#E5E7EB" }] : data).map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            {total > 0 && <Tooltip formatter={(v) => [`${v} tasks`]} />}
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: "#111827", lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 10, color: "#6B7280", fontWeight: 600, marginTop: 2 }}>Total Tasks</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px", marginTop: 10 }}>
        {SLICES.map(s => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#6B7280", fontWeight: 500, flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#111827" }}>{vals[s.key]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
