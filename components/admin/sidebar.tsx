"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Users, Clock, Target, Activity,
  CalendarOff, Megaphone, Briefcase, LogOut, BarChart2,
} from "lucide-react"
import { logoutAction } from "@/lib/actions/auth"

const navItems = [
  { label: "Dashboard",     href: "/admin/dashboard",     icon: LayoutDashboard },
  { label: "Team",          href: "/admin/team",          icon: Users },
  { label: "Attendance",    href: "/admin/attendance",    icon: Clock },
  { label: "Tasks",         href: "/admin/goals",         icon: Target },
  { label: "Clients",       href: "/admin/clients",       icon: Briefcase },
  { label: "Activities",    href: "/admin/activities",    icon: Activity },
  { label: "Reports",       href: "/admin/reports",       icon: BarChart2 },
  { label: "Leaves",        href: "/admin/leaves",        icon: CalendarOff },
  { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-[240px] flex flex-col z-50 select-none"
      style={{ background: "#0D0D0D", borderRight: "1px solid #1A1A1A" }}
    >
      {/* Logo */}
      <div className="px-5 py-[18px]" style={{ borderBottom: "1px solid #1A1A1A" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: "#A3E635" }}
          >
            <span className="text-[15px] font-black" style={{ color: "#0D0D0D", fontFamily: "var(--font-jakarta)" }}>G</span>
          </div>
          <div>
            <p className="text-[13px] tracking-[0.12em] font-black" style={{ fontFamily: "var(--font-jakarta)", color: "#FFFFFF" }}>
              GROFAST
            </p>
            <p className="text-[9px] tracking-[0.2em] uppercase font-medium mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
              Admin Portal
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-5 pb-2 overflow-y-auto">
        <p className="text-[9px] tracking-[0.28em] uppercase px-3 pb-3 font-bold" style={{ color: "rgba(255,255,255,0.15)" }}>
          Menu
        </p>
        <div className="space-y-[2px]">
          {navItems.map(({ label, href, icon: Icon }) => {
            const isActive = pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className="relative flex items-center gap-3 px-3 py-[9px] rounded-lg transition-all duration-150 group"
                style={isActive
                  ? { background: "rgba(163,230,53,0.08)", color: "#A3E635" }
                  : { color: "rgba(255,255,255,0.32)" }
                }
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)" }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.32)" }}
              >
                {isActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                    style={{ height: "18px", background: "#A3E635" }}
                  />
                )}
                <Icon size={15} className="flex-shrink-0" />
                <span className="text-[13px] font-medium">{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User + Logout */}
      <div className="px-3 pb-4 pt-3" style={{ borderTop: "1px solid #1A1A1A" }}>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(163,230,53,0.1)", border: "1px solid rgba(163,230,53,0.2)" }}
          >
            <span className="text-[11px] font-bold" style={{ fontFamily: "var(--font-jakarta)", color: "#A3E635" }}>AD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold leading-none" style={{ color: "#FFFFFF" }}>Admin</p>
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.22)" }}>Administrator</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full hover:bg-white/[0.03]"
            style={{ color: "rgba(255,255,255,0.28)" }}
          >
            <LogOut size={14} />
            <span className="text-[13px] font-medium">Sign Out</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
