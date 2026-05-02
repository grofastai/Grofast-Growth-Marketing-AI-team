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

const bottomNavItems = [
  { label: "Home",       href: "/admin/dashboard",  icon: LayoutDashboard },
  { label: "Team",       href: "/admin/team",       icon: Users },
  { label: "Activities", href: "/admin/activities", icon: Activity },
  { label: "Leaves",     href: "/admin/leaves",     icon: CalendarOff },
  { label: "Reports",    href: "/admin/reports",    icon: BarChart2 },
]

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
        style={{
          background: "linear-gradient(180deg, #0D0D0D 0%, #1A1A1A 100%)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Logo */}
        <div className="px-5 py-[18px]" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)" }}
            >
              <span className="text-[15px] font-black" style={{ color: "#FFFFFF" }}>G</span>
            </div>
            <div>
              <p className="text-[13px] tracking-[0.12em] font-black" style={{ color: "#FFFFFF" }}>GROFAST</p>
              <p className="text-[9px] tracking-[0.2em] uppercase font-medium mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                Admin Portal
              </p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pt-5 pb-2 overflow-y-auto">
          <p className="text-[9px] tracking-[0.28em] uppercase px-3 pb-3 font-bold" style={{ color: "rgba(255,255,255,0.22)" }}>
            Menu
          </p>
          <div className="space-y-[2px]">
            {navItems.map(({ label, href, icon: Icon }) => {
              const active = isActive(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className="relative flex items-center gap-3 px-3 py-[9px] rounded-lg transition-all duration-150"
                  style={active
                    ? { background: "rgba(220,38,38,0.15)", color: "#F87171" }
                    : { color: "rgba(255,255,255,0.42)" }
                  }
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.85)" }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.42)" }}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full"
                      style={{ height: "18px", background: "#DC2626" }}
                    />
                  )}
                  <Icon size={15} className="flex-shrink-0" />
                  <span className="text-[13px] font-medium">{label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Logout */}
        <div className="px-3 pb-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.35)" }}
            >
              <span className="text-[11px] font-bold" style={{ color: "#F87171" }}>AD</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold leading-none" style={{ color: "#FFFFFF" }}>Admin</p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>Administrator</p>
            </div>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all w-full hover:opacity-80"
              style={{ color: "rgba(255,255,255,0.32)" }}
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
        style={{
          background: "linear-gradient(90deg, #0D0D0D 0%, #1A1A1A 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #DC2626 0%, #991B1B 100%)" }}
          >
            <span className="text-[12px] font-black" style={{ color: "#FFFFFF" }}>G</span>
          </div>
          <span className="text-[13px] tracking-[0.1em] font-black" style={{ color: "#FFFFFF" }}>GROFAST</span>
        </div>
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold"
          style={{ background: "rgba(220,38,38,0.2)", border: "1px solid rgba(220,38,38,0.35)", color: "#F87171" }}
        >
          AD
        </div>
      </header>

      {/* ── Mobile Bottom Nav (< lg) ──────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2"
        style={{
          background: "#0D0D0D",
          borderTop: "1px solid rgba(255,255,255,0.08)",
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
              style={active ? { color: "#F87171" } : { color: "rgba(255,255,255,0.32)" }}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
