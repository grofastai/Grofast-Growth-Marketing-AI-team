"use client"

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts"

export type ChartPoint = {
  day: string
  present: number
  absent: number
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: "#FFFFFF", border: "1px solid #E5E7EB",
      borderRadius: 10, padding: "8px 12px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ fontSize: 11, color: p.color, fontWeight: 600 }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

export default function AnalyticsChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={190}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#DC2626" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#DC2626" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="grayGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9CA3AF" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#9CA3AF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 11, fill: "#9CA3AF", fontWeight: 500 }}
          tickLine={false} axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#9CA3AF" }}
          tickLine={false} axisLine={false}
          allowDecimals={false}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          iconType="circle" iconSize={7}
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(v) => <span style={{ color: "#6B7280", fontWeight: 600 }}>{v}</span>}
        />
        <Area
          type="monotone" dataKey="present" name="Present"
          stroke="#DC2626" strokeWidth={2.5}
          fill="url(#redGrad)"
          dot={{ fill: "#DC2626", r: 3.5, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: "#DC2626", stroke: "#fff", strokeWidth: 2 }}
        />
        <Area
          type="monotone" dataKey="absent" name="Absent"
          stroke="#9CA3AF" strokeWidth={2}
          fill="url(#grayGrad)"
          dot={{ fill: "#9CA3AF", r: 3, strokeWidth: 0 }}
          activeDot={{ r: 4.5, fill: "#9CA3AF", stroke: "#fff", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
