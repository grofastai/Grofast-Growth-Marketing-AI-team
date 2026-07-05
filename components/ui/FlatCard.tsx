"use client"

import type { ReactNode, CSSProperties, MouseEventHandler } from "react"

// Shared flat surface used across the Expenses and Freelancers redesigns —
// solid background, a plain 1px border, no shadow, no blur. Deliberately
// avoids the "soft glass card" look. `hover` adds a subtle border-color
// change for clickable cards, without any elevation/shadow motion.
export function FlatCard({
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
        background: "#FFFFFF",
        border: "1px solid #EDEDED",
        borderRadius: 16,
        transition: hover ? "border-color 0.15s ease" : undefined,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
      onMouseEnter={hover ? (e) => {
        e.currentTarget.style.borderColor = "#DE1A1A"
      } : undefined}
      onMouseLeave={hover ? (e) => {
        e.currentTarget.style.borderColor = "#EDEDED"
      } : undefined}
    >
      {children}
    </div>
  )
}
