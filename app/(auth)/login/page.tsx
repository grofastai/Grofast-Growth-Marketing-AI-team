'use client'

import { useActionState, useState, useEffect } from 'react'
import { loginAction } from '@/lib/actions/auth'
import Image from 'next/image'

const SLIDES = [
  {
    img:     '/brand/ai.png',
    title:   'AI Automation',
    desc:    'Streamline workflows with smart automation that works for you 24/7.',
    accent:  '#de1a1a',
  },
  {
    img:     '/brand/dg.png',
    title:   'Digital Growth',
    desc:    'Data-driven strategies that scale your brand across every channel.',
    accent:  '#B91C1C',
  },
  {
    img:     '/brand/influencer.png',
    title:   'Influencer Marketing',
    desc:    'Connect with creators who amplify your message to the right audience.',
    accent:  '#991B1B',
  },
]

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)
  const [slide, setSlide] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t = setInterval(() => {
      setFading(true)
      setTimeout(() => {
        setSlide(s => (s + 1) % SLIDES.length)
        setFading(false)
      }, 400)
    }, 3500)
    return () => clearInterval(t)
  }, [])

  const current = SLIDES[slide]

  return (
    <div className="min-h-screen flex" style={{ background: '#080808' }}>

      {/* ── Left brand panel ─────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col w-[58%] relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #0a100d 0%, #3d0000 50%, #de1a1a 100%)' }}
      >
        {/* Diagonal decorative lines */}
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.04 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} className="absolute" style={{
              width: '2px', height: '200%',
              background: '#FFFFFF',
              left: `${i * 14}%`,
              top: '-50%',
              transform: 'rotate(20deg)',
            }} />
          ))}
        </div>

        {/* Corner glow */}
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] pointer-events-none" style={{
          background: 'radial-gradient(circle, rgba(222,26,26,0.25) 0%, transparent 70%)',
        }} />

        {/* Top bar — logo */}
        <div className="relative z-10 flex items-center gap-3 px-12 pt-10">
          <div className="w-12 h-12 rounded-2xl overflow-hidden flex-shrink-0"
            style={{ border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 0 24px rgba(222,26,26,0.4)' }}>
            <Image src="/brand/logo.jpg" alt="GroFast" width={48} height={48} className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="text-[15px] tracking-[0.18em] font-black" style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>GROFAST</p>
            <p className="text-[9px] tracking-[0.24em] uppercase font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>Growth Marketing &amp; AI Solutions</p>
          </div>
        </div>

        {/* Center — headline + service showcase */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-12 py-8">
          <div className="mb-10">
            <p className="text-[11px] tracking-[0.3em] uppercase font-bold mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>Team Management Portal</p>
            <h1 className="text-[44px] font-black leading-[1.08]" style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>
              Your team,<br />
              <span style={{ color: '#ff4444', textShadow: '0 0 40px rgba(222,26,26,0.6)' }}>supercharged.</span>
            </h1>
          </div>

          {/* Rotating service card */}
          <div
            className="rounded-3xl p-7 transition-all duration-400"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(12px)',
              opacity: fading ? 0 : 1,
              transform: fading ? 'translateY(8px)' : 'translateY(0)',
              transition: 'opacity 0.4s ease, transform 0.4s ease',
              maxWidth: '460px',
            }}
          >
            <div className="flex items-center gap-5">
              <div className="w-28 h-28 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Image
                  src={current.img}
                  alt={current.title}
                  width={96}
                  height={96}
                  className="w-20 h-20 object-contain"
                  style={{ filter: 'brightness(0) invert(1)', opacity: 0.85 }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#ff4444', boxShadow: '0 0 8px rgba(222,26,26,0.8)' }} />
                  <span className="text-[10px] tracking-[0.22em] uppercase font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>Our Services</span>
                </div>
                <h3 className="text-[22px] font-black mb-2" style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>{current.title}</h3>
                <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>{current.desc}</p>
              </div>
            </div>

            {/* Slide dots */}
            <div className="flex items-center gap-2 mt-5">
              {SLIDES.map((_, i) => (
                <button key={i} onClick={() => { setFading(true); setTimeout(() => { setSlide(i); setFading(false) }, 400) }}
                  className="rounded-full transition-all duration-300"
                  style={{ width: slide === i ? '24px' : '6px', height: '6px', background: slide === i ? '#ff4444' : 'rgba(255,255,255,0.25)' }}
                />
              ))}
            </div>
          </div>

          {/* Thumbnail previews */}
          <div className="flex items-center gap-3 mt-5">
            {SLIDES.map((s, i) => (
              <button key={i} onClick={() => { setFading(true); setTimeout(() => { setSlide(i); setFading(false) }, 400) }}
                className="rounded-xl flex items-center gap-2 px-3 py-2 transition-all"
                style={{
                  background: slide === i ? 'rgba(222,26,26,0.2)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${slide === i ? 'rgba(222,26,26,0.4)' : 'rgba(255,255,255,0.08)'}`,
                }}>
                <Image src={s.img} alt={s.title} width={20} height={20} className="w-5 h-5 object-contain" style={{ filter: 'brightness(0) invert(1)', opacity: 0.7 }} />
                <span className="text-[11px] font-semibold" style={{ color: slide === i ? '#ff8888' : 'rgba(255,255,255,0.4)' }}>{s.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom strip */}
        <div className="relative z-10 px-12 pb-8">
          <div className="flex items-center gap-6">
            {['Real-time Tracking', 'Daily Reports', 'Payroll & Leaves', 'Client Management'].map(f => (
              <div key={f} className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full" style={{ background: 'rgba(222,26,26,0.8)' }} />
                <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative"
        style={{ background: '#080808' }}>

        {/* Subtle top-right glow */}
        <div className="absolute top-0 right-0 w-80 h-80 pointer-events-none" style={{
          background: 'radial-gradient(circle, rgba(222,26,26,0.06) 0%, transparent 70%)',
        }} />

        <div className="w-full max-w-[360px] relative z-10">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-10 h-10 rounded-xl overflow-hidden" style={{ border: '1.5px solid rgba(222,26,26,0.4)' }}>
              <Image src="/brand/logo.jpg" alt="GroFast" width={40} height={40} className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-[14px] tracking-[0.14em] font-black" style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>GROFAST</p>
              <p className="text-[9px] tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>Team Portal</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-[2px] rounded-full" style={{ background: '#de1a1a' }} />
              <span className="text-[10px] tracking-[0.24em] uppercase font-bold" style={{ color: 'rgba(255,255,255,0.3)' }}>Secure Login</span>
            </div>
            <h2 className="text-[30px] font-black leading-tight" style={{ color: '#FFFFFF', fontFamily: 'var(--font-jakarta)' }}>
              Welcome back
            </h2>
            <p className="text-[13px] mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Sign in to your team portal
            </p>
          </div>

          <style>{`
            .lg-input { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #FFFFFF; width: 100%; border-radius: 12px; padding: 14px 16px; font-size: 14px; outline: none; font-family: inherit; transition: border-color 0.2s, background 0.2s; }
            .lg-input::placeholder { color: rgba(255,255,255,0.2); }
            .lg-input:focus { border-color: rgba(222,26,26,0.5) !important; background: rgba(222,26,26,0.04) !important; }
            .lg-label { display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; margin-bottom: 8px; color: rgba(255,255,255,0.3); }
          `}</style>

          <form action={action} className="space-y-4">
            <div>
              <label className="lg-label">Email</label>
              <input className="lg-input" name="email" type="email"
                placeholder="you@example.com" required autoComplete="email" autoCapitalize="none" />
            </div>

            <div>
              <label className="lg-label">Password</label>
              <div className="relative">
                <input className="lg-input" name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password" required autoComplete="current-password"
                  style={{ paddingRight: '48px' }} />
                <button type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(255,255,255,0.28)', lineHeight: 0 }}>
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {state?.error && (
              <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
                style={{ background: 'rgba(222,26,26,0.08)', border: '1px solid rgba(222,26,26,0.2)', color: '#ff8888' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span className="text-[13px]">{state.error}</span>
              </div>
            )}

            <div className="pt-1">
              <button type="submit" disabled={pending}
                className="w-full font-black rounded-xl py-4 text-[14px] transition-all relative overflow-hidden"
                style={{
                  background: pending ? 'rgba(222,26,26,0.5)' : 'linear-gradient(135deg, #de1a1a 0%, #7F1D1D 100%)',
                  color: '#FFFFFF',
                  cursor: pending ? 'not-allowed' : 'pointer',
                  boxShadow: pending ? 'none' : '0 8px 32px rgba(222,26,26,0.35)',
                  fontFamily: 'var(--font-jakarta)',
                  letterSpacing: '0.04em',
                }}>
                {pending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Signing in…
                  </span>
                ) : 'Sign In →'}
              </button>
            </div>
          </form>

          <p className="text-center text-[11px] mt-8" style={{ color: 'rgba(255,255,255,0.15)' }}>
            Forgot your password? Contact your administrator.
          </p>

          {/* Bottom brand mark */}
          <div className="flex items-center justify-center gap-2 mt-10">
            <div className="h-[1px] flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <span className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: 'rgba(255,255,255,0.12)' }}>Grofast Digital</span>
            <div className="h-[1px] flex-1" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
