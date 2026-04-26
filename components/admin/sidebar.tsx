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
  LogOut,
} from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Team", href: "/team", icon: Users },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Goals", href: "/goals", icon: Target },
  { label: "Activities", href: "/activities", icon: Activity },
  { label: "Leaves", href: "/leaves", icon: CalendarOff },
  { label: "Announcements", href: "/announcements", icon: Megaphone },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed left-0 top-0 h-screen w-[260px] bg-sidebar flex flex-col z-50 select-none">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg shadow-brand/30">
            <span
              className="text-white text-base leading-none"
              style={{ fontFamily: "var(--font-syne)", fontWeight: 800 }}
            >
              G
            </span>
          </div>
          <div>
            <p
              className="text-white text-[15px] leading-none tracking-[0.08em]"
              style={{ fontFamily: "var(--font-syne)", fontWeight: 700 }}
            >
              GROFAST
            </p>
            <p className="text-[9px] text-sidebar-text mt-1 tracking-[0.18em] uppercase font-sans">
              Team Tracking
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-5 pb-2 overflow-y-auto">
        <p className="text-[9px] tracking-[0.2em] text-white/20 uppercase px-3 pb-3 font-sans font-medium">
          Main Menu
        </p>
        <div className="space-y-0.5">
          {navItems.map(({ label, href, icon: Icon }) => {
            const isActive =
              pathname === href || (href !== "/dashboard" && pathname.startsWith(href))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-[10px] rounded-xl transition-all duration-150 group overflow-hidden",
                  isActive
                    ? "bg-sidebar-active text-white"
                    : "text-sidebar-text hover:bg-white/[0.04] hover:text-white"
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-brand rounded-r-full" />
                )}
                <Icon
                  size={15}
                  className={cn(
                    "flex-shrink-0 transition-colors duration-150",
                    isActive ? "text-brand" : "text-current"
                  )}
                />
                <span
                  className="text-[13px] font-medium font-sans"
                >
                  {label}
                </span>
                {isActive && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                )}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* User + Logout */}
      <div className="px-3 pb-4 pt-3 border-t border-white/[0.06] space-y-1">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.04] transition-colors cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-brand/20 border border-brand/40 flex items-center justify-center flex-shrink-0">
            <span
              className="text-[11px] text-brand"
              style={{ fontFamily: "var(--font-syne)", fontWeight: 700 }}
            >
              AD
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium font-sans text-white leading-none truncate">
              Admin
            </p>
            <p className="text-[10px] text-sidebar-text mt-0.5 font-sans">Administrator</p>
          </div>
        </div>
        <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand/10 transition-colors w-full group">
          <LogOut
            size={14}
            className="text-sidebar-text group-hover:text-brand transition-colors duration-150"
          />
          <span className="text-[13px] font-sans text-sidebar-text group-hover:text-white transition-colors duration-150">
            Sign Out
          </span>
        </button>
      </div>
    </aside>
  )
}
