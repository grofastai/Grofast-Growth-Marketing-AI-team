import { Plus, Briefcase, MapPin, Package, Store } from "lucide-react"

export default function ClientsPage() {
  return (
    <div className="p-8 max-w-[1400px]">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-[28px] leading-tight" style={{ fontFamily: "var(--font-jakarta)", fontWeight: 800, color: "#0D1117" }}>
            Clients
          </h1>
          <p className="text-sm mt-1 font-sans" style={{ color: "#9CA3AF" }}>
            Manage your client list and link them to tasks
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold font-sans text-white"
          style={{
            background: "linear-gradient(135deg, #ee0039, #c8002f)",
            boxShadow: "0 3px 10px rgba(238,0,57,0.3)",
          }}
        >
          <Plus size={15} />
          Add Client
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Clients", value: "0", icon: Briefcase },
          { label: "Active Projects", value: "0", icon: Package },
          { label: "Locations", value: "0", icon: MapPin },
        ].map((s) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className="rounded-2xl p-5 flex items-center gap-4"
              style={{ background: "#fff", border: "1px solid #EBEBEB" }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#FFF1F3" }}>
                <Icon size={18} style={{ color: "#ee0039" }} />
              </div>
              <div>
                <p className="text-[22px] font-black leading-none" style={{ fontFamily: "var(--font-jakarta)", color: "#0D1117" }}>
                  {s.value}
                </p>
                <p className="text-[12px] font-sans mt-0.5" style={{ color: "#9CA3AF" }}>{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Empty state */}
      <div
        className="rounded-2xl p-16 flex flex-col items-center justify-center text-center"
        style={{ background: "#fff", border: "1px solid #EBEBEB" }}
      >
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#FFF1F3" }}>
          <Store size={28} style={{ color: "#ee0039" }} />
        </div>
        <h3 className="text-[16px] font-bold mb-2" style={{ fontFamily: "var(--font-jakarta)", color: "#0D1117" }}>
          No clients yet
        </h3>
        <p className="text-[13px] max-w-sm font-sans mb-6" style={{ color: "#9CA3AF" }}>
          Add your clients with their shop name, business type, services package, and location. You can then link them to tasks.
        </p>

        {/* Fields preview */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-md mb-6 text-left">
          {[
            { icon: "👤", label: "Client Name", hint: "Contact person's name" },
            { icon: "🏪", label: "Shop Name", hint: "Business or shop name" },
            { icon: "📋", label: "Business Type", hint: "What they do" },
            { icon: "📦", label: "Package", hint: "Service package chosen" },
            { icon: "📍", label: "Location", hint: "Shop / office address" },
            { icon: "🔗", label: "Link to Task", hint: "Attach to existing task" },
          ].map((f) => (
            <div
              key={f.label}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: "#F9FAFB", border: "1px solid #F3F4F6" }}
            >
              <span className="text-base flex-shrink-0 mt-0.5">{f.icon}</span>
              <div>
                <p className="text-[12px] font-semibold font-sans" style={{ color: "#0D1117" }}>{f.label}</p>
                <p className="text-[11px] font-sans" style={{ color: "#9CA3AF" }}>{f.hint}</p>
              </div>
            </div>
          ))}
        </div>

        <button
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-[13px] font-semibold font-sans text-white"
          style={{
            background: "linear-gradient(135deg, #ee0039, #c8002f)",
            boxShadow: "0 3px 10px rgba(238,0,57,0.3)",
          }}
        >
          <Plus size={15} />
          Add First Client
        </button>
      </div>

    </div>
  )
}
