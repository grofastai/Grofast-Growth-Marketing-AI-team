"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Target,
  Activity,
  CalendarOff,
  Megaphone,
  Briefcase,
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { logoutAction } from "@/lib/actions/auth"

const navItems = [
  { label: "Dashboard",     href: "/admin/dashboard",     icon: LayoutDashboard },
  { label: "Team",          href: "/admin/team",          icon: Users },
  { label: "Projects",      href: "/admin/projects",      icon: FolderKanban },
  { label: "Tasks",         href: "/admin/goals",         icon: Target },
  { label: "Clients",       href: "/admin/clients",       icon: Briefcase },
  { label: "Activities",    href: "/admin/activities",    icon: Activity },
  { label: "Leaves",        href: "/admin/leaves",        icon: CalendarOff },
  { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-screen w-[240px] flex flex-col z-50 select-none"
      style={{ background: "#071515", borderRight: "1px solid rgba(255,255,255,0.04)" }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, #6D5DF6, #0E3B3B)",
              boxShadow: "0 4px 14px rgba(109,93,246,0.4)",
            }}
          >
            <span className="text-white text-base" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800 }}>
              G
            </span>
          </div>
          <div>
            <p className="text-white text-[14px] tracking-[0.07em]" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800 }}>
              GROFAST
            </p>
            <p className="text-[9px] tracking-[0.18em] uppercase font-sans mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
              Team Tracking
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-4 pb-2 overflow-y-auto">
        <p className="text-[9px] tracking-[0.2em] uppercase px-3 pb-3 font-sans font-medium" style={{ color: "rgba(255,255,255,0.18)" }}>
          Main Menu
        </p>
        <div className="space-y-0.5">
          {navItems.map(({ label, href, icon: Icon }) => {
            const isActive =
              pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-[9px] rounded-xl transition-all duration-150 group",
                  isActive
                    ? "text-white"
                    : "text-white/35 hover:text-white/75 hover:bg-white/[0.04]"
                )}
                style={isActive ? {
                  background: "rgba(109,93,246,0.14)",
                  border: "1px solid rgba(109,93,246,0.2)",
                } : { border: "1px solid transparent" }}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-accent" />
                )}
                <Icon
                  size={15}
                  className={cn("flex-shrink-0 transition-colors", isActive ? "text-accent" : "text-current")}
                />
                <span className="text-[13px] font-medium">{label}</span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User + Logout */}
      <div className="px-3 pb-4 pt-3 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: "rgba(109,93,246,0.15)", border: "1.5px solid rgba(109,93,246,0.3)" }}
          >
            <span className="text-[11px]" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 700, color: "#6D5DF6" }}>
              AD
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium font-sans text-white leading-none">Admin</p>
            <p className="text-[10px] font-sans mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>Administrator</p>
          </div>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors w-full text-white/35 hover:text-white/70 hover:bg-white/[0.04]"
          >
            <LogOut size={14} />
            <span className="text-[13px] font-sans">Sign Out</span>
          </button>
        </form>
      </div>
    </aside>
  )
}
