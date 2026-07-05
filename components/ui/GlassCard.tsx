"use client"

import type { ReactNode, CSSProperties, MouseEventHandler } from "react"

// Shared "frosted glass" surface used across the Expenses and Freelancers
// redesigns — frosted translucent background, soft border, and a diffuse
// shadow. `hover` adds a lift-on-hover affordance for clickable cards.
export function GlassCard({
  children,
  className,
  style,
  hover = false,
  onClick,
}: {
  children: ReactNode
  className?: string
  style?: CSSProperties
  hover?: boolean
  onClick?: MouseEventHandler<HTMLDivElement>
}) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        background: "rgba(255,255,255,0.55)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.8)",
        borderRadius: 20,
        boxShadow: "0 8px 32px rgba(31,38,135,0.08)",
        transition: hover ? "transform 0.15s ease, box-shadow 0.15s ease" : undefined,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
      onMouseEnter={hover ? (e) => {
        e.currentTarget.style.transform = "translateY(-2px)"
        e.currentTarget.style.boxShadow = "0 12px 40px rgba(31,38,135,0.14)"
      } : undefined}
      onMouseLeave={hover ? (e) => {
        e.currentTarget.style.transform = "translateY(0)"
        e.currentTarget.style.boxShadow = "0 8px 32px rgba(31,38,135,0.08)"
      } : undefined}
    >
      {children}
    </div>
  )
}
