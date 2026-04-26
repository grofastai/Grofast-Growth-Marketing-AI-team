"use client"

import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts"

const present = 24
const total = 30
const pct = Math.round((present / total) * 100)

const data = [{ value: pct, fill: "#CD0000" }]

export default function AttendanceRadial() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full" style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="62%"
            outerRadius="84%"
            startAngle={220}
            endAngle={-40}
            data={data}
            barSize={14}
          >
            <RadialBar
              dataKey="value"
              cornerRadius={8}
              background={{ fill: "#E3E0D8" }}
            />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-ink leading-none"
            style={{ fontFamily: "var(--font-syne)", fontWeight: 800, fontSize: "38px" }}
          >
            {pct}%
          </span>
          <span className="text-ink-muted font-sans mt-1.5" style={{ fontSize: "11px" }}>
            Attendance Rate
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="w-full grid grid-cols-2 gap-3 pt-4 border-t border-border">
        <div className="text-center">
          <p
            className="text-ink leading-none"
            style={{ fontFamily: "var(--font-syne)", fontWeight: 700, fontSize: "22px" }}
          >
            {present}
          </p>
          <p className="text-[11px] text-ink-muted font-sans mt-1">Present</p>
        </div>
        <div className="text-center">
          <p
            className="text-brand leading-none"
            style={{ fontFamily: "var(--font-syne)", fontWeight: 700, fontSize: "22px" }}
          >
            {total - present}
          </p>
          <p className="text-[11px] text-ink-muted font-sans mt-1">Absent</p>
        </div>
      </div>
    </div>
  )
}
