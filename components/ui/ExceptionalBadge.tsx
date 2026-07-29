// Small embossed "EXCEPTIONAL" chip — marks a leave that bypassed the normal monthly
// cap or a date-collision block and needed direct admin approval. Same treatment as
// AutoBadge: the raw "[EXCEPTIONAL] " prefix stays in the DB reason, this is the
// display-side replacement so employees never see the bracket tag itself.
export default function ExceptionalBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: "0.04em",
        padding: "2px 7px",
        borderRadius: 6,
        flexShrink: 0,
        background: "linear-gradient(180deg, #FEF3C7 0%, #FDE68A 100%)",
        color: "#92400E",
        border: "1px solid #F59E0B",
        boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 1.5px 2px rgba(146,64,14,0.25)",
        textShadow: "0 1px 0 rgba(255,255,255,0.4)",
      }}
    >
      EXCEPTIONAL
    </span>
  )
}
