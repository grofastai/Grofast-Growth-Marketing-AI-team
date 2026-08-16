"use client"

import dynamic from "next/dynamic"

// Recharts is a sizeable client bundle for a single pie chart — loading it lazily
// keeps it out of the dashboard's initial JS/hydration path. ssr:false is only
// valid from a Client Component, hence this wrapper around the Server Component page.
const TaskSummaryChart = dynamic(() => import("./task-summary-chart"), {
  ssr: false,
  loading: () => <div style={{ height: 168 }} />,
})

export default TaskSummaryChart
