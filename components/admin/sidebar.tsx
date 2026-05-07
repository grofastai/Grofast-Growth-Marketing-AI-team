"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Users, Clock, Target,
  CalendarOff, Megaphone, Briefcase, LogOut, BarChart2,
  Receipt, IndianRupee, FolderOpen,
} from "lucide-react"
import { logoutAction } from "@/lib/actions/auth"

const navItems = [
  { label: "Dashboard",     href: "/admin/dashboard",     icon: LayoutDashboard },
  { label: "Team",          href: "/admin/team",          icon: Users },
  { label: "Attendance",    href: "/admin/attendance",    icon: Clock },
  { label: "Tasks",         href: "/admin/goals",         icon: Target },
  { label: "Clients",       href: "/admin/clients",       icon: Briefcase },
  { label: "Reports",       href: "/admin/reports",       icon: BarChart2 },
  { label: "Leaves",        href: "/admin/leaves",        icon: CalendarOff },
  { label: "Announcements", href: "/admin/announcements", icon: Megaphone },
  { label: "Expenses",      href: "/admin/expenses",      icon: Receipt },
  { label: "Payroll",       href: "/admin/payroll",       icon: IndianRupee },
  { label: "Documents",     href: "/admin/documents",     icon: FolderOpen },
]

const bottomNavItems = [
  { label: "Home",    href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Team",    href: "/admin/team",      icon: Users },
  { label: "Tasks",   href: "/admin/goals",     icon: Target },
  { label: "Leaves",  href: "/admin/leaves",    icon: CalendarOff },
  { label: "Reports", href: "/admin/reports",   icon: BarChart2 },
]

const SIDEBAR_BG   = "linear-gradient(160deg, #000000 0%, #520000 55%, #C90D16 100%)"
const MOBILE_BG    = "linear-gradient(90deg, #000000 0%, #C90D16 100%)"
const ACTIVE_BG    = "rgba(255,255,255,0.14)"
const HOVER_BG     = "rgba(255,255,255,0.07)"
const DIVIDER      = "rgba(255,255,255,0.1)"

export default function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    return pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(href))
  }

  return (
    <>
      {/* ── Desktop Sidebar (lg+) ─────────────────────────── */}
      <aside
        className="hidden lg:flex fixed left-0 top-0 h-screen w-[240px] flex-col z-50 select-none"
        style={{ background: SIDEBAR_BG, borderRight: "1px solid rgba(201,13,22,0.25)" }}
      >
        {/* Logo */}
        <div className="px-5 py-[20px]" style={{ borderBottom: `1px solid ${DIVIDER}` }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1.5px solid rgba(255,255,255,0.25)",
                backdropFilter: "blur(6px)",
              }}
            >
              <span className="text-[16px] font-black" style={{ color: "#FFFFFF" }}>G</span>
            </div>
            <div>
              <p className="text-[14px] tracking-[0.14em] font-black" style={{ color: "#FFFFFF" }}>GROFAST</p>
              <p className="text-[9px] tracking-[0.22em] uppercase font-semibold mt-0.5"
                style={{ color: "rgba(255,255,255,0.5)" }}>Admin Portal</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-5 pb-2 overflow-y-auto">
          <p className="text-[9px] tracking-[0.28em] uppercase px-3 pb-3 font-bold"
            style={{ color: "rgba(255,255,255,0.3)" }}>Navigation</p>
          <div className="space-y-[1px]">
            {navItems.map(({ label, href, icon: Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className="relative flex items-center gap-3 px-3 py-[10px] rounded-lg transition-all duration-150 group"
                  style={active
                    ? { background: ACTIVE_BG, color: "#FFFFFF" }
                    : { color: "rgba(255,255,255,0.65)" }
                  }
                  onMouseEnter={e => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = HOVER_BG
                      ;(e.currentTarget as HTMLElement).style.color = "#FFFFFF"
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = "transparent"
                      ;(e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.65)"
                    }
                  }}
                >
                  {/* Active left indicator */}
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                      style={{ height: "22px", background: "#FFFFFF" }}
                    />
                  )}
                  <Icon size={15} className="flex-shrink-0" strokeWidth={active ? 2.2 : 1.7} />
                  <span className="text-[13px] font-semibold">{label}</span>
                  {active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: "#FFFFFF", opacity: 0.7 }} />
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Bottom — user + logout */}
        <div className="px-3 pb-4 pt-3" style={{ borderTop: `1px solid ${DIVIDER}` }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1"
            style={{ background: "rgba(255,255,255,0.07)" }}>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.3)" }}
            >
              <span className="text-[11px] font-bold" style={{ color: "#FFFFFF" }}>AD</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold leading-none" style={{ color: "#FFFFFF" }}>Admin</p>
              <p className="text-[10px] mt-0.5 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Administrator</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full"
              style={{ color: "rgba(255,255,255,0.55)" }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = HOVER_BG
                ;(e.currentTarget as HTMLElement).style.color = "#FFFFFF"
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "transparent"
                ;(e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.55)"
              }}
            >
              <LogOut size={14} />
              <span className="text-[13px] font-medium">Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      {/* ── Mobile Top Bar (< lg) ─────────────────────────── */}
      <header
        className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 h-14"
        style={{ background: MOBILE_BG, borderBottom: `1px solid ${DIVIDER}` }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}
          >
            <span className="text-[13px] font-black" style={{ color: "#FFFFFF" }}>G</span>
          </div>
          <span className="text-[14px] tracking-[0.12em] font-black" style={{ color: "#FFFFFF" }}>GROFAST</span>
        </div>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
          style={{ background: "rgba(255,255,255,0.2)", border: "1.5px solid rgba(255,255,255,0.3)", color: "#FFFFFF" }}
        >
          AD
        </div>
      </header>

      {/* ── Mobile Bottom Nav (< lg) ──────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2"
        style={{
          background: "linear-gradient(90deg, #000000 0%, #C90D16 100%)",
          borderTop: `1px solid ${DIVIDER}`,
          height: "64px",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {bottomNavItems.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-1 flex-1 py-2 rounded-xl transition-all"
              style={active
                ? { color: "#FFFFFF", background: "rgba(255,255,255,0.12)" }
                : { color: "rgba(255,255,255,0.5)" }
              }
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-semibold leading-none">{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
