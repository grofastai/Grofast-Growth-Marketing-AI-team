"use client"

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

const data = [
  { day: "Mon", tasks: 18, updates: 14 },
  { day: "Tue", tasks: 22, updates: 20 },
  { day: "Wed", tasks: 15, updates: 12 },
  { day: "Thu", tasks: 28, updates: 25 },
  { day: "Fri", tasks: 24, updates: 19 },
  { day: "Sat", tasks: 8, updates: 6 },
  { day: "Sun", tasks: 3, updates: 2 },
]

const CustomDot = (props: {
  cx?: number
  cy?: number
  payload?: { day: string }
  dataKey?: string
}) => {
  const { cx, cy } = props
  if (!cx || !cy) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill="#CD0000"
      stroke="#FFFFFF"
      strokeWidth={2}
    />
  )
}

export default function WeeklyActivityChart() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="tasksGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CD0000" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#CD0000" stopOpacity={0.01} />
          </linearGradient>
          <linearGradient id="updatesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#111111" stopOpacity={0.07} />
            <stop offset="100%" stopColor="#111111" stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid
          strokeDasharray="4 4"
          stroke="#E3E0D8"
          vertical={false}
        />

        <XAxis
          dataKey="day"
          axisLine={false}
          tickLine={false}
          tick={{
            fill: "#7A7874",
            fontSize: 11,
            fontFamily: "var(--font-dm-sans)",
          }}
          dy={8}
        />

        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{
            fill: "#7A7874",
            fontSize: 11,
            fontFamily: "var(--font-dm-sans)",
          }}
        />

        <Tooltip
          contentStyle={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #DDD9D0",
            borderRadius: "10px",
            fontFamily: "var(--font-dm-sans)",
            fontSize: "12px",
            color: "#111111",
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            padding: "8px 12px",
          }}
          cursor={{ stroke: "#DDD9D0", strokeWidth: 1, strokeDasharray: "4 2" }}
          formatter={(value, name) => [value, String(name) === "tasks" ? "Tasks" : "Updates"]}
        />

        <Area
          type="monotone"
          dataKey="tasks"
          stroke="#CD0000"
          strokeWidth={2.5}
          fill="url(#tasksGrad)"
          dot={false}
          activeDot={{ r: 5, fill: "#CD0000", stroke: "#FFFFFF", strokeWidth: 2.5 }}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <Area
          type="monotone"
          dataKey="updates"
          stroke="#3D3D3D"
          strokeWidth={2}
          strokeDasharray="6 3"
          fill="url(#updatesGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "#3D3D3D", stroke: "#FFFFFF", strokeWidth: 2 }}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
