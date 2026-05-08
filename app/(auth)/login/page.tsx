'use client'

import { useActionState, useState, useEffect } from 'react'
import { loginAction } from '@/lib/actions/auth'
import Image from 'next/image'

const SLIDES = [
  { img: '/brand/ai.png', tag: 'AI Automation' },
  { img: '/brand/dg.png', tag: 'Digital Growth' },
  { img: '/brand/influencer.png', tag: 'Influencer Marketing' },
]

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)
  const [slide, setSlide] = useState(0)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const t = setInterval(() => {
      setFading(true)
      setTimeout(() => { setSlide(s => (s + 1) % SLIDES.length); setFading(false) }, 450)
    }, 4000)
    return () => clearInterval(t)
  }, [])

  const current = SLIDES[slide]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Manrope:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ─── PAGE ─── */
        .lp-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          font-family: 'Manrope', sans-serif;
          background: #0C0C0F;
          position: relative;
          overflow: hidden;
        }

        /* Ambient glows in background */
        .lp-page::before {
          content: '';
          position: fixed;
          top: -20%; left: 50%;
          transform: translateX(-50%);
          width: 900px; height: 600px;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(180,10,10,0.12) 0%, transparent 65%);
          pointer-events: none;
        }
        .lp-page::after {
          content: '';
          position: fixed;
          bottom: -20%; left: 50%;
          transform: translateX(-50%);
          width: 700px; height: 500px;
          border-radius: 50%;
          background: radial-gradient(ellipse, rgba(60,20,120,0.08) 0%, transparent 65%);
          pointer-events: none;
        }

        /* ─── CARD ─── */
        .lp-card {
          position: relative;
          z-index: 10;
          display: flex;
          width: 100%;
          max-width: 960px;
          min-height: 620px;
          border-radius: 24px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.06),
            0 8px 16px rgba(0,0,0,0.4),
            0 32px 80px rgba(0,0,0,0.55),
            0 80px 120px rgba(0,0,0,0.3);
          animation: card-rise 0.65s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes card-rise {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* ─── LEFT PANEL ─── */
        .lp-left {
          width: 44%;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
          background: linear-gradient(155deg, #160202 0%, #2a0404 30%, #4a0808 65%, #6b1010 100%);
          display: flex;
          flex-direction: column;
        }

        /* Subtle grid pattern */
        .lp-left::before {
          content: '';
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
          background-size: 32px 32px;
          pointer-events: none;
        }

        /* Top-right corner radial glow */
        .lp-left-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }

        /* ─── ICON STAGE ─── */
        .lp-stage {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 52px 32px 20px;
          position: relative;
          z-index: 2;
        }

        .lp-icon-ring {
          position: relative;
          width: 270px; height: 270px;
          display: flex; align-items: center; justify-content: center;
          transition: opacity 0.45s ease, transform 0.45s ease;
        }
        .lp-icon-ring.fading {
          opacity: 0;
          transform: scale(0.9) translateY(10px);
        }

        /* Outer ring */
        .lp-icon-ring::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid rgba(220,38,38,0.2);
          animation: ring-pulse 3s ease-in-out infinite;
        }
        /* Inner ring */
        .lp-icon-ring::after {
          content: '';
          position: absolute;
          inset: 28px;
          border-radius: 50%;
          border: 1px solid rgba(220,38,38,0.12);
        }

        @keyframes ring-pulse {
          0%,100% { transform: scale(1); opacity: 0.6; }
          50%      { transform: scale(1.05); opacity: 1; }
        }

        .lp-icon-glow {
          position: absolute;
          inset: 20px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(200,30,30,0.35) 0%, transparent 70%);
          animation: glow-breathe 3s ease-in-out infinite;
        }

        @keyframes glow-breathe {
          0%,100% { transform: scale(0.9); opacity: 0.7; }
          50%      { transform: scale(1.15); opacity: 1; }
        }

        /* Service tag */
        .lp-tag {
          margin-top: 20px;
          padding: 7px 18px;
          border-radius: 100px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
          transition: opacity 0.45s;
        }

        /* Dots */
        .lp-dots {
          display: flex; gap: 8px; margin-top: 16px;
          position: relative; z-index: 2;
        }
        .lp-dot {
          height: 4px; border-radius: 100px;
          cursor: pointer;
          transition: width 0.35s ease, background 0.35s ease;
        }

        /* ─── LEFT BOTTOM ─── */
        .lp-bottom {
          position: relative; z-index: 2;
          padding: 0 36px 36px;
        }

        .lp-tagline {
          font-family: 'Sora', sans-serif;
          font-weight: 800;
          font-size: 34px;
          line-height: 1.08;
          color: #FFFFFF;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          margin-bottom: 14px;
        }

        .lp-tagline-eyebrow {
          display: block;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.3);
          margin-bottom: 10px;
          font-family: 'Manrope', sans-serif;
        }

        /* Thin divider line */
        .lp-line {
          width: 36px; height: 2px;
          background: linear-gradient(90deg, #DC2626, transparent);
          border-radius: 2px;
          margin-bottom: 14px;
        }

        /* ─── RIGHT PANEL ─── */
        .lp-right {
          flex: 1;
          background: #FFFFFF;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 56px 52px;
          position: relative;
        }

        /* Subtle top-left corner accent */
        .lp-right::before {
          content: '';
          position: absolute;
          top: 0; left: 0;
          width: 120px; height: 120px;
          background: radial-gradient(circle at top left, rgba(220,38,38,0.04) 0%, transparent 70%);
          pointer-events: none;
        }

        .lp-form-wrap {
          width: 100%;
          max-width: 340px;
          position: relative;
          z-index: 1;
        }

        /* Logo */
        .lp-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: 32px;
        }

        .lp-logo-img {
          width: 52px; height: 52px;
          border-radius: 16px;
          overflow: hidden;
          border: 1.5px solid rgba(220,38,38,0.15);
          box-shadow: 0 4px 20px rgba(220,38,38,0.12);
          margin-bottom: 10px;
        }

        .lp-logo-name {
          font-family: 'Sora', sans-serif;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.22em;
          color: #1A1A1A;
          text-transform: uppercase;
        }

        /* Heading */
        .lp-h1 {
          font-family: 'Sora', sans-serif;
          font-size: 28px;
          font-weight: 800;
          color: #0D0D12;
          letter-spacing: -0.02em;
          text-align: center;
          line-height: 1.15;
          margin-bottom: 8px;
          text-transform: uppercase;
        }

        .lp-sub {
          font-size: 13.5px;
          color: #94A3B8;
          text-align: center;
          line-height: 1.6;
          font-weight: 400;
          margin-bottom: 32px;
        }

        /* ─── INPUTS ─── */
        .lp-field { margin-bottom: 18px; }

        .lp-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #374151;
          margin-bottom: 7px;
          letter-spacing: 0.01em;
        }

        .lp-input {
          width: 100%;
          padding: 13px 16px;
          border-radius: 12px;
          border: 1.5px solid #E5E9F0;
          background: #FAFBFC;
          font-size: 14px;
          font-family: 'Manrope', sans-serif;
          font-weight: 500;
          color: #0D0D12;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
        }
        .lp-input::placeholder { color: #BDC5D1; font-weight: 400; }
        .lp-input:focus {
          border-color: #DC2626;
          background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(220,38,38,0.08);
        }

        /* Password row label */
        .lp-pass-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 7px;
        }
        .lp-forgot {
          font-size: 12px;
          color: #9CA3AF;
          font-weight: 500;
          cursor: default;
          transition: color 0.15s;
        }
        .lp-forgot:hover { color: #DC2626; }

        /* Eye toggle */
        .lp-eye {
          position: absolute;
          right: 14px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none;
          cursor: pointer; line-height: 0;
          color: #BDC5D1;
          padding: 4px;
          transition: color 0.15s;
        }
        .lp-eye:hover { color: #6B7280; }
        .lp-pw-wrap { position: relative; }
        .lp-pw-wrap .lp-input { padding-right: 46px; }

        /* ─── SUBMIT BUTTON ─── */
        .lp-btn {
          width: 100%;
          padding: 15px;
          margin-top: 6px;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: #FFFFFF;
          background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%);
          box-shadow: 0 4px 20px rgba(220,38,38,0.3), 0 1px 4px rgba(220,38,38,0.2);
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s;
          position: relative;
          overflow: hidden;
        }
        .lp-btn::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%);
          pointer-events: none;
        }
        .lp-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(220,38,38,0.4), 0 2px 8px rgba(220,38,38,0.25);
        }
        .lp-btn:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 3px 12px rgba(220,38,38,0.3);
        }
        .lp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Error */
        .lp-error {
          display: flex; gap: 9px; align-items: flex-start;
          padding: 11px 14px; border-radius: 10px;
          background: #FEF2F2; border: 1px solid #FECACA;
          color: #DC2626; font-size: 13px; font-weight: 500;
          margin-bottom: 4px;
        }

        /* Footer */
        .lp-footer {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid #F1F5F9;
          text-align: center;
          font-size: 12px;
          color: #B0BAC8;
          line-height: 1.6;
        }

        /* Divider between logo and form */
        .lp-sep {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 24px;
        }
        .lp-sep-line { flex: 1; height: 1px; background: #F1F5F9; }
        .lp-sep-text { font-size: 11px; color: #CBD5E1; font-weight: 500; letter-spacing: 0.08em; white-space: nowrap; }

        /* Animations */
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }

        /* Mobile */
        @media (max-width: 720px) {
          .lp-left { display: none; }
          .lp-page { padding: 0; background: #FFFFFF; }
          .lp-card { border-radius: 0; box-shadow: none; min-height: 100vh; }
          .lp-right { padding: 44px 28px; }
          .lp-page::before, .lp-page::after { display: none; }
        }
      `}</style>

      <div className="lp-page">
        <div className="lp-card">

          {/* ══════════════════════════════
               LEFT PANEL
          ══════════════════════════════ */}
          <div className="lp-left">

            {/* Background glows */}
            <div className="lp-left-glow" style={{
              width: 320, height: 320, top: '10%', right: '-60px',
              background: 'radial-gradient(circle, rgba(220,38,38,0.22) 0%, transparent 65%)',
            }}/>
            <div className="lp-left-glow" style={{
              width: 200, height: 200, bottom: '15%', left: '-40px',
              background: 'radial-gradient(circle, rgba(220,38,38,0.12) 0%, transparent 65%)',
            }}/>

            {/* Icon stage */}
            <div className="lp-stage">
              <div className={`lp-icon-ring ${fading ? 'fading' : ''}`}>
                <div className="lp-icon-glow"/>
                <Image
                  src={current.img}
                  alt={current.tag}
                  width={220} height={220}
                  style={{
                    width: 200, height: 200,
                    objectFit: 'contain',
                    filter: 'brightness(0) invert(1)',
                    opacity: 0.88,
                    position: 'relative', zIndex: 1,
                    dropShadow: '0 0 40px rgba(255,80,80,0.4)',
                  }}
                />
              </div>

              <div className="lp-tag" style={{ opacity: fading ? 0 : 1 }}>
                {current.tag}
              </div>

              <div className="lp-dots">
                {SLIDES.map((_, i) => (
                  <div key={i} className="lp-dot"
                    onClick={() => { setFading(true); setTimeout(() => { setSlide(i); setFading(false) }, 450) }}
                    style={{
                      width: slide === i ? 24 : 5,
                      background: slide === i ? '#EF4444' : 'rgba(255,255,255,0.2)',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Bottom tagline */}
            <div className="lp-bottom">
              <div className="lp-line"/>
              <p className="lp-tagline">
                <span className="lp-tagline-eyebrow">Your Team Portal</span>
                Track.<br/>Grow.<br/>Succeed.
              </p>
            </div>
          </div>

          {/* ══════════════════════════════
               RIGHT PANEL — FORM
          ══════════════════════════════ */}
          <div className="lp-right">
            <div className="lp-form-wrap">

              {/* Logo */}
              <div className="lp-logo">
                <div className="lp-logo-img">
                  <Image src="/brand/logo.jpg" alt="GroFast" width={52} height={52}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                </div>
                <span className="lp-logo-name">GROFAST</span>
              </div>

              {/* Heading */}
              <h1 className="lp-h1">Welcome Back</h1>
              <p className="lp-sub">
                Enter your email and password<br/>to access your account
              </p>

              <div className="lp-sep">
                <div className="lp-sep-line"/>
                <span className="lp-sep-text">Sign In</span>
                <div className="lp-sep-line"/>
              </div>

              <form action={action}>
                <div className="lp-field">
                  <label className="lp-label">Email</label>
                  <input className="lp-input" name="email" type="email"
                    placeholder="Enter your email" required
                    autoComplete="email" autoCapitalize="none"/>
                </div>

                <div className="lp-field">
                  <div className="lp-pass-header">
                    <label className="lp-label" style={{ margin: 0 }}>Password</label>
                    <span className="lp-forgot">Forgot Password?</span>
                  </div>
                  <div className="lp-pw-wrap">
                    <input className="lp-input" name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password" required
                      autoComplete="current-password"/>
                    <button type="button" className="lp-eye" tabIndex={-1}
                      onClick={() => setShowPassword(v => !v)}>
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
                  <div className="lp-error">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {state.error}
                  </div>
                )}

                <button type="submit" disabled={pending} className="lp-btn">
                  {pending ? (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Signing in…
                    </span>
                  ) : 'Sign In'}
                </button>
              </form>

              <div className="lp-footer">
                Forgot your password? Contact your administrator.
              </div>

            </div>
          </div>

        </div>
      </div>
    </>
  )
}
