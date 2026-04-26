"use client"

import dynamic from "next/dynamic"

function ChartSkeleton() {
  return (
    <div className="flex items-center justify-center h-[210px]">
      <div className="w-40 h-40 rounded-full border-8 border-cream-dark animate-pulse" />
    </div>
  )
}

export const GoalsPieChart = dynamic(
  () => import("@/components/charts/goals-pie-chart"),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

export const AttendanceRadial = dynamic(
  () => import("@/components/charts/attendance-radial"),
  { ssr: false, loading: () => <ChartSkeleton /> }
)

export const WeeklyActivityChart = dynamic(
  () => import("@/components/charts/weekly-activity-chart"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] animate-pulse bg-cream-dark rounded-xl" />
    ),
  }
)
