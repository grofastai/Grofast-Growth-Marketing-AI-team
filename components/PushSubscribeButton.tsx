"use client"

import { useState, useEffect } from "react"
import { Bell, BellOff, Loader2 } from "lucide-react"

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export default function PushSubscribeButton() {
  const [state, setState] = useState<"loading" | "unsupported" | "subscribed" | "unsubscribed">("loading")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported"); return
    }
    navigator.serviceWorker.ready.then(reg =>
      reg.pushManager.getSubscription().then(sub => {
        setState(sub ? "subscribed" : "unsubscribed")
      })
    ).catch(() => setState("unsupported"))
  }, [])

  async function toggle() {
    if (!VAPID_PUBLIC) {
      alert("Notifications are not configured yet. Please contact your admin.")
      return
    }

    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready

      if (state === "subscribed") {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await sub.unsubscribe()
          await fetch("/api/push", { method: "DELETE" })
        }
        setState("unsubscribed")
      } else {
        // Check if already denied
        const permission = await Notification.requestPermission()
        if (permission === "denied") {
          alert("Notifications are blocked. To enable:\n\n1. Click the lock icon (🔒) in your browser's address bar\n2. Set Notifications → Allow\n3. Refresh the page and try again")
          setBusy(false)
          return
        }
        if (permission !== "granted") {
          setBusy(false)
          return
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        })
        const res = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        })
        if (!res.ok) {
          throw new Error(`Server error: ${res.status}`)
        }
        setState("subscribed")
      }
    } catch (err) {
      console.error("Push notification error:", err)
      alert("Could not enable notifications. Please try again or contact support.")
    } finally {
      setBusy(false)
    }
  }

  if (state === "loading" || state === "unsupported") return null

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={state === "subscribed" ? "Disable notifications" : "Enable notifications"}
      className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
      style={{
        background: state === "subscribed" ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.07)",
        border: "1.5px solid rgba(255,255,255,0.25)",
      }}
    >
      {busy
        ? <Loader2 size={13} style={{ color: "#FFFFFF" }} className="animate-spin" />
        : state === "subscribed"
          ? <Bell size={13} style={{ color: "#FFFFFF" }} />
          : <BellOff size={13} style={{ color: "rgba(255,255,255,0.5)" }} />
      }
    </button>
  )
}
