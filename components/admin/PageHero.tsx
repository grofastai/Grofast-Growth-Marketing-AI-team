import { Sparkles } from "lucide-react"
import type { ReactNode } from "react"

export type HeroChip = { icon: ReactNode; label: string }

// Shared hero header used at the top of every admin page (Support, Documents,
// Payroll, Notes, Announcements, Content Calendar, etc). Each page previously
// hand-coded its own version of this card with slightly different padding,
// title size, and minHeight, which is why they looked inconsistently sized
// on mobile. Using this component everywhere guarantees they can't drift
// apart again — sizing is driven by clamp()s that scale with viewport width
// instead of fixed px values or isMobile ternaries, and there's no fixed
// minHeight so the card's height is always just "consistent padding around
// whatever content this page actually has."
export function PageHero({
  eyebrow = "ADMIN DASHBOARD",
  eyebrowIcon,
  title,
  subtitle,
  chips,
  actions,
  rightSlot,
  illustration,
  maxContentWidth,
  belowSubtitle,
}: {
  eyebrow?: string
  eyebrowIcon?: ReactNode
  title: string
  subtitle: string
  chips?: HeroChip[]
  actions?: ReactNode
  rightSlot?: ReactNode
  /** Optional page-specific decorative image/character, absolutely
   * positioned by the caller and rendered behind the text content
   * (z-index 1) — e.g. the Support page's illustration or Content
   * Calendar's character. Hidden on mobile is the caller's responsibility. */
  illustration?: ReactNode
  /** Caps the text column width so it doesn't run under a right-side
   * illustration on wide screens. */
  maxContentWidth?: number | string
  /** Custom content below the subtitle, for pages whose "chips" don't fit
   * the simple icon+label shape (e.g. Documents' value+label stat chips).
   * Ignored if `chips` is also provided — use one or the other. */
  belowSubtitle?: ReactNode
}) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #DE1A1A 0%, #8B1212 55%, #1A0808 100%)",
      borderRadius: 20,
      boxShadow: "0 8px 32px rgba(180,0,0,0.4)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Decorative circles — same two everywhere */}
      <div style={{ position: "absolute", top: -40, right: -30, width: 160, height: 160, borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -30, right: 100, width: 100, height: 100, borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
      {illustration}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between"
        style={{ padding: "clamp(16px,4vw,24px) clamp(18px,5vw,28px)", gap: 16, position: "relative", zIndex: 2 }}>
        <div
          className={maxContentWidth ? "max-w-[var(--hero-content-max)]" : undefined}
          style={{
            minWidth: 0,
            // Cap applies at every width (not just sm+) so text can never run
            // under a caller's absolutely-positioned illustration on mobile.
            // px values are additionally capped to 68% of the row on phones.
            ...(maxContentWidth
              ? ({ "--hero-content-max": typeof maxContentWidth === "number" ? `min(${maxContentWidth}px, 68%)` : maxContentWidth } as React.CSSProperties)
              : {}),
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ background: "rgba(255,255,255,0.2)", borderRadius: 10, padding: "5px 7px", display: "flex", alignItems: "center" }}>
              {eyebrowIcon ?? <Sparkles size={14} style={{ color: "#FFD700" }} />}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.15em" }}>{eyebrow}</span>
          </div>
          <h1 style={{ fontSize: "clamp(22px,5.5vw,30px)", fontWeight: 900, color: "#FFFFFF", margin: "0 0 5px", fontFamily: "var(--font-jakarta)", lineHeight: 1.15 }}>
            {title}
          </h1>
          <p style={{ fontSize: "clamp(12px,2.8vw,13px)", color: "rgba(255,255,255,0.68)", margin: 0 }}>
            {subtitle}
          </p>
          {chips && chips.length > 0 ? (
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {chips.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 12px" }}>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", display: "flex", alignItems: "center" }}>{c.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#FFFFFF" }}>{c.label}</span>
                </div>
              ))}
            </div>
          ) : belowSubtitle ? (
            <div style={{ marginTop: 12 }}>{belowSubtitle}</div>
          ) : null}
        </div>

        {(actions || rightSlot) && (
          <div className="flex items-center flex-wrap gap-2 sm:flex-shrink-0" style={{
            position: "relative",
            // Same safety net as the text column above: when a caller supplies an
            // illustration, cap this row so action buttons can't stretch out past it
            // and collide with the artwork on phones, where the row sits full-width
            // below the title instead of beside it. Harmless with no illustration —
            // buttons already wrap via flex-wrap regardless.
            ...(illustration ? { maxWidth: "68%" } : {}),
          }}>
            {actions}
            {rightSlot}
          </div>
        )}
      </div>
    </div>
  )
}
