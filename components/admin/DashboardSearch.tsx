"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"

export default function DashboardSearch() {
  const router = useRouter()
  const [value, setValue] = useState("")

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim()) {
      router.push(`/admin/team?search=${encodeURIComponent(value.trim())}`)
    }
  }

  return (
    <>
      <Search size={13} style={{ color: "rgba(255,255,255,0.6)", flexShrink: 0 }} />
      <input
        placeholder="Search..."
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        style={{ border: "none", outline: "none", background: "transparent", fontSize: 12, color: "#FFFFFF", width: 80, minWidth: 60 }}
      />
    </>
  )
}
