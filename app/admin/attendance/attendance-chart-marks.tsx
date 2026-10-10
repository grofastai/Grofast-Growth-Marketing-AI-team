"use client"

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts"

// The only two things on the attendance page that actually need recharts. They live in
// their own module so attendance-charts.tsx can pull them in with next/dynamic — the
// surrounding numbers (donut centre total, legend counts) are plain HTML and must stay
// eager, since they are the information the admin came for. Both marks are on the same
// page, so keeping them in one file gives them one shared chunk.

type Slice = { name: string; value: number; color: string }

export function DonutPie({ display, showTooltip }: { display: Slice[]; showTooltip: boolean }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={display} cx="50%" cy="50%" innerRadius={30} outerRadius={46}
          dataKey="value" strokeWidth={2} stroke="#FFFFFF">
          {display.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Pie>
        {showTooltip && <Tooltip formatter={(v) => [`${v} members`]} />}
      </PieChart>
    </ResponsiveContainer>
  )
}

export function TrendArea({ data }: { data: { day: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#DE1A1A" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#DE1A1A" stopOpacity={0}    />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#0F4C4C" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "#0F4C4C" }} axisLine={false} tickLine={false} allowDecimals={false} />
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
  )
}
