// Small embossed "AUTO" chip — marks a leave record that was inserted as a historical
// correction (from the 2026-07-29 break-entry cleanup) rather than submitted live by the
// employee. The raw "[BACKFILL] " prefix stays in the DB reason for our own audit trail;
// this is the display-side replacement so employees never see that word.
export default function AutoBadge() {
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
        background: "linear-gradient(180deg, #FFFFFF 0%, #E5E7EB 100%)",
        color: "#4B5563",
        border: "1px solid #D1D5DB",
        boxShadow: "0 1px 0 rgba(255,255,255,0.9) inset, 0 1.5px 2px rgba(0,0,0,0.18)",
        textShadow: "0 1px 0 rgba(255,255,255,0.7)",
      }}
    >
      AUTO
    </span>
  )
}
