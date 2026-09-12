"use client"

import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts"

// Pulled out of history-client.tsx purely so recharts can be code-split away from it.
// History is the highest-traffic member page and this 80px sparkline was dragging the
// whole charting library into its initial bundle — see the dynamic() call at the top of
// history-client.tsx. Keep this file a leaf: importing it statically anywhere undoes that.
export default function HoursTrendChart({ data }: { data: { day: string; hours: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top:4, right:4, left:-28, bottom:0 }}>
        <XAxis dataKey="day" tick={{ fontSize:9, fill:"#9CA3AF" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize:9, fill:"#9CA3AF" }} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{ fontSize:11, borderRadius:8, border:"1px solid #E5E7EB", background:"#fff" }} formatter={(v) => [`${v as number}h`, "Hours"]} labelFormatter={l => `Day ${l}`} />
        <ReferenceLine y={8.5} stroke="#F59E0B" strokeDasharray="4 3" strokeWidth={1.5} label={{ value:"8.5h", fontSize:9, fill:"#F59E0B", position:"right" }} />
        <Line type="monotone" dataKey="hours" stroke="#DE1A1A" strokeWidth={2} dot={{ r:2, fill:"#DE1A1A" }} activeDot={{ r:4 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
