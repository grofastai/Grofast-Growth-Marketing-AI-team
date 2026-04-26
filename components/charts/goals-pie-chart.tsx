"use client"

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts"

const data = [
  { name: "Completed", value: 12, color: "#CD0000" },
  { name: "In Progress", value: 8, color: "#111111" },
  { name: "Pending", value: 5, color: "#DDD9D0" },
]

const total = data.reduce((sum, d) => sum + d.value, 0)
const completedPct = Math.round((data[0].value / total) * 100)

export default function GoalsPieChart() {
  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <ResponsiveContainer width="100%" height={210}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={68}
              outerRadius={96}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
            >
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${value} tasks`, String(name)]}
              contentStyle={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #DDD9D0",
                borderRadius: "10px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "12px",
                color: "#111111",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
              cursor={false}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-brand leading-none"
            style={{ fontFamily: "var(--font-syne)", fontWeight: 800, fontSize: "32px" }}
          >
            {completedPct}%
          </span>
          <span
            className="text-ink-muted mt-1 font-sans"
            style={{ fontSize: "11px" }}
          >
            Done
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="space-y-2.5 px-1">
        {data.map((item) => {
          const pct = Math.round((item.value / total) * 100)
          return (
            <div key={item.name} className="flex items-center gap-3">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[12px] text-ink-muted font-sans flex-1">{item.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-cream-dark overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: item.color }}
                />
              </div>
              <span
                className="text-[12px] font-medium font-sans text-ink w-8 text-right"
              >
                {item.value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
