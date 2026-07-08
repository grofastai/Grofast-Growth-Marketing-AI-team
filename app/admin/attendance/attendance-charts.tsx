"use client"

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts"

// ── Attendance Overview Donut ─────────────────────────────────────────────────
type DonutProps = { present: number; notLogged: number; absent: number; total: number }

export function AttendanceDonut({ present, notLogged, absent, total }: DonutProps) {
  const slices = [
    { name: "Present",      value: present,   color: "#DE1A1A" },
    { name: "Not Logged In",value: notLogged,  color: "#F59E0B" },
    { name: "Absent",       value: absent,     color: "#1b365d" },
  ]
  const data = slices.filter(s => s.value > 0)
  const display = data.length === 0 ? [{ name: "No Data", value: 1, color: "#E5E7EB" }] : data

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div style={{ position: "relative", width: 130, height: 130, flexShrink: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={display} cx="50%" cy="50%" innerRadius={40} outerRadius={60}
              dataKey="value" strokeWidth={2} stroke="#FFFFFF">
              {display.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            {data.length > 0 && <Tooltip formatter={(v) => [`${v} members`]} />}
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <span style={{ fontSize: 22, fontWeight: 900, color: "#111827", lineHeight: 1 }}>{total}</span>
          <span style={{ fontSize: 9, color: "#1b365d", fontWeight: 700, marginTop: 1 }}>Total</span>
        </div>
      </div>

      <div className="flex-1 min-w-0" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {slices.map(s => (
          <div key={s.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#1b365d", fontWeight: 600 }}>{s.name}</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#111827" }}>
              {s.value} ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Weekly Trend AreaChart ────────────────────────────────────────────────────
type TrendPoint = { day: string; count: number }

export function WeeklyTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="w-full" style={{ height: 130 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#DE1A1A" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#DE1A1A" stopOpacity={0}    />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#1b365d" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#1b365d" }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip formatter={(v) => [`${v} present`, "Attendance"]} />
          <Area
            type="monotone" dataKey="count"
            stroke="#DE1A1A" strokeWidth={2}
            fill="url(#trendGrad)"
            dot={{ r: 3, fill: "#DE1A1A", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#DE1A1A" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
