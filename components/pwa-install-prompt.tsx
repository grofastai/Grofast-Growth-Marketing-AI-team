'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (sessionStorage.getItem('pwa-dismissed')) return

    const handler = (e: Event) => {
      e.preventDefault()
      setPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  if (!prompt || dismissed) return null

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted' || outcome === 'dismissed') {
      sessionStorage.setItem('pwa-dismissed', '1')
      setDismissed(true)
    }
  }

  function dismiss() {
    sessionStorage.setItem('pwa-dismissed', '1')
    setDismissed(true)
  }

  return (
    <div
      className="fixed bottom-20 left-4 right-4 z-50 rounded-2xl p-4 flex items-center gap-3 shadow-2xl md:bottom-6 md:left-auto md:right-6 md:w-80"
      style={{ background: '#262626', border: '1px solid #383838' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center font-bold text-sm"
        style={{ background: '#de1a1a', color: '#FFFFFF' }}
      >
        GF
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm leading-tight" style={{ color: '#FFFFFF' }}>
          Install GroFast
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
          Add to home screen for quick access
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={dismiss}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
          style={{ color: 'rgba(255,255,255,0.45)' }}
          aria-label="Dismiss"
        >
          ✕
        </button>
        <button
          onClick={install}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: '#de1a1a', color: '#FFFFFF' }}
        >
          Install
        </button>
      </div>
    </div>
  )
}
