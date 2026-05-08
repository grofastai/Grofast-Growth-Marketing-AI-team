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
      setTimeout(() => {
        setSlide(s => (s + 1) % SLIDES.length)
        setFading(false)
      }, 500)
    }, 4000)
    return () => clearInterval(t)
  }, [])

  const current = SLIDES[slide]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Manrope:wght@300;400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        .lg-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: 'Manrope', sans-serif;
          background: linear-gradient(145deg, #E8F0FE 0%, #EDE8FF 50%, #E8F4FF 100%);
        }

        /* ── Main card ── */
        .lg-card {
          display: flex;
          width: 100%;
          max-width: 920px;
          min-height: 580px;
          border-radius: 28px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.7),
            0 4px 6px rgba(0,0,0,0.03),
            0 12px 40px rgba(0,0,0,0.1),
            0 40px 80px rgba(0,0,0,0.08);
          background: #FFFFFF;
        }

        /* ── Left image panel ── */
        .lg-image-panel {
          width: 42%;
          flex-shrink: 0;
          position: relative;
          overflow: hidden;
          background: linear-gradient(170deg, #0D0707 0%, #1C0404 35%, #3D0000 70%, #5C1010 100%);
          display: flex;
          flex-direction: column;
        }

        /* Dot-grid texture overlay */
        .lg-image-panel::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 24px 24px;
          pointer-events: none;
        }

        /* Ambient red glow */
        .panel-glow {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
        }

        /* ── Service icon area ── */
        .service-stage {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 32px 24px;
          position: relative;
          z-index: 2;
        }

        .service-icon-wrap {
          position: relative;
          width: 260px;
          height: 260px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.5s ease, transform 0.5s ease;
        }

        .service-icon-wrap.fading {
          opacity: 0;
          transform: scale(0.92) translateY(8px);
        }

        .icon-glow {
          position: absolute;
          inset: -20px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(222,26,26,0.35) 0%, transparent 70%);
          animation: breathe 3s ease-in-out infinite;
        }

        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50%       { transform: scale(1.12); opacity: 1; }
        }

        .service-tag {
          margin-top: 20px;
          padding: 6px 16px;
          border-radius: 100px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.55);
          transition: opacity 0.5s ease;
        }

        /* Slide dots */
        .slide-dots {
          display: flex;
          gap: 7px;
          margin-top: 18px;
          position: relative;
          z-index: 2;
        }

        .dot {
          height: 5px;
          border-radius: 100px;
          background: rgba(255,255,255,0.25);
          cursor: pointer;
          transition: width 0.35s ease, background 0.35s ease;
        }

        /* ── Bottom text overlay ── */
        .panel-bottom {
          position: relative;
          z-index: 2;
          padding: 24px 32px 32px;
          background: linear-gradient(0deg, rgba(0,0,0,0.55) 0%, transparent 100%);
        }

        .panel-tagline {
          font-family: 'Sora', sans-serif;
          font-size: 28px;
          font-weight: 800;
          line-height: 1.1;
          color: #FFFFFF;
          letter-spacing: -0.01em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .panel-tagline span {
          color: rgba(255,255,255,0.5);
          display: block;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .panel-features {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 12px;
        }

        .panel-feat-chip {
          font-size: 10px;
          font-weight: 500;
          color: rgba(255,255,255,0.4);
          padding: 3px 8px;
          border-radius: 100px;
          border: 1px solid rgba(255,255,255,0.1);
          letter-spacing: 0.05em;
        }

        /* ── Right form panel ── */
        .lg-form-panel {
          flex: 1;
          background: #FFFFFF;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 52px 52px 44px;
        }

        .form-inner {
          width: 100%;
          max-width: 320px;
        }

        /* Logo */
        .form-logo {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          margin-bottom: 28px;
        }

        .form-logo-img {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(220,38,38,0.18);
          border: 1.5px solid rgba(220,38,38,0.12);
        }

        .form-logo-text {
          font-family: 'Sora', sans-serif;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.18em;
          color: #0F172A;
          text-transform: uppercase;
        }

        /* Heading */
        .form-heading {
          font-family: 'Sora', sans-serif;
          font-size: 26px;
          font-weight: 800;
          color: #0F172A;
          letter-spacing: -0.01em;
          text-align: center;
          margin-bottom: 6px;
          text-transform: uppercase;
        }

        .form-subheading {
          font-size: 13.5px;
          color: #94A3B8;
          text-align: center;
          line-height: 1.5;
          margin-bottom: 28px;
        }

        /* Divider */
        .form-divider {
          height: 1px;
          background: #F1F5F9;
          margin-bottom: 24px;
        }

        /* Inputs */
        .lf-group {
          margin-bottom: 16px;
        }

        .lf-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #334155;
          margin-bottom: 7px;
          letter-spacing: 0.01em;
        }

        .lf-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1.5px solid #E2E8F0;
          background: #FFFFFF;
          font-size: 14px;
          font-family: 'Manrope', sans-serif;
          color: #0F172A;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
        }

        .lf-input::placeholder { color: #C8D3DE; }

        .lf-input:focus {
          border-color: #0F172A;
          box-shadow: 0 0 0 3px rgba(15,23,42,0.06);
        }

        /* Sign in button */
        .lf-btn {
          width: 100%;
          padding: 14px;
          border-radius: 10px;
          border: none;
          cursor: pointer;
          font-family: 'Sora', sans-serif;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #FFFFFF;
          background: #0F172A;
          margin-top: 8px;
          transition: background 0.15s, transform 0.12s, box-shadow 0.15s;
          box-shadow: 0 4px 16px rgba(15,23,42,0.2);
        }

        .lf-btn:hover:not(:disabled) {
          background: #1E293B;
          transform: translateY(-1px);
          box-shadow: 0 6px 20px rgba(15,23,42,0.28);
        }

        .lf-btn:active:not(:disabled) {
          transform: translateY(0);
          background: #0F172A;
        }

        .lf-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* Error */
        .lf-error {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 11px 13px;
          border-radius: 9px;
          background: rgba(220,38,38,0.05);
          border: 1px solid rgba(220,38,38,0.15);
          color: #DC2626;
          font-size: 13px;
          margin-bottom: 6px;
        }

        /* Footer */
        .form-footer {
          margin-top: 22px;
          text-align: center;
          font-size: 12px;
          color: #94A3B8;
          line-height: 1.6;
        }

        /* Animations */
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }

        @keyframes card-enter {
          from { opacity: 0; transform: translateY(20px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .card-enter { animation: card-enter 0.6s cubic-bezier(0.34,1.1,0.64,1) forwards; }

        /* Eye button */
        .eye-btn {
          position: absolute;
          right: 13px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          color: #C8D3DE;
          line-height: 0;
          transition: color 0.15s;
        }

        .eye-btn:hover { color: #64748B; }

        /* Show password wrapper */
        .pass-wrap { position: relative; }

        .pass-wrap .lf-input { padding-right: 44px; }

        /* Mobile */
        @media (max-width: 700px) {
          .lg-image-panel { display: none; }
          .lg-page { padding: 16px; }
          .lg-card { max-width: 400px; }
          .lg-form-panel { padding: 44px 32px 40px; }
        }
      `}</style>

      <div className="lg-page">
        <div className="lg-card card-enter">

          {/* ══════════════════════════════
               LEFT — IMAGE PANEL
          ══════════════════════════════ */}
          <div className="lg-image-panel">

            {/* Glow accents */}
            <div className="panel-glow" style={{
              width: 280, height: 280,
              top: '25%', left: '50%', transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, rgba(220,38,38,0.3) 0%, transparent 70%)',
            }}/>
            <div className="panel-glow" style={{
              width: 160, height: 160,
              bottom: 80, right: -40,
              background: 'radial-gradient(circle, rgba(220,38,38,0.15) 0%, transparent 70%)',
            }}/>

            {/* Service icon stage */}
            <div className="service-stage">
              <div className={`service-icon-wrap ${fading ? 'fading' : ''}`}>
                <div className="icon-glow"/>
                <Image
                  src={current.img}
                  alt={current.tag}
                  width={220}
                  height={220}
                  style={{
                    width: 220, height: 220,
                    objectFit: 'contain',
                    filter: 'brightness(0) invert(1)',
                    opacity: 0.9,
                    position: 'relative',
                    zIndex: 1,
                  }}
                />
              </div>

              <div className="service-tag" style={{ opacity: fading ? 0 : 1 }}>
                {current.tag}
              </div>

              {/* Slide dots */}
              <div className="slide-dots">
                {SLIDES.map((_, i) => (
                  <div
                    key={i}
                    className="dot"
                    onClick={() => { setFading(true); setTimeout(() => { setSlide(i); setFading(false) }, 500) }}
                    style={{
                      width: slide === i ? 22 : 5,
                      background: slide === i ? '#DC2626' : 'rgba(255,255,255,0.25)',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Bottom text */}
            <div className="panel-bottom">
              <p className="panel-tagline">
                <span>Your Team</span>
                Track.<br/>Grow.<br/>Succeed.
              </p>
            </div>
          </div>

          {/* ══════════════════════════════
               RIGHT — FORM PANEL
          ══════════════════════════════ */}
          <div className="lg-form-panel">
            <div className="form-inner">

              {/* Logo */}
              <div className="form-logo">
                <div className="form-logo-img">
                  <Image src="/brand/logo.jpg" alt="GroFast" width={48} height={48}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                </div>
                <span className="form-logo-text">GROFAST</span>
              </div>

              {/* Heading */}
              <h1 className="form-heading">Welcome Back</h1>
              <p className="form-subheading">
                Enter your email and password<br/>to access your account
              </p>

              <div className="form-divider"/>

              {/* Form */}
              <form action={action}>
                <div className="lf-group">
                  <label className="lf-label">Email</label>
                  <input
                    className="lf-input" name="email" type="email"
                    placeholder="Enter your email" required
                    autoComplete="email" autoCapitalize="none"
                  />
                </div>

                <div className="lf-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                    <label className="lf-label" style={{ margin: 0 }}>Password</label>
                    <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500, cursor: 'default' }}>
                      Forgot Password?
                    </span>
                  </div>
                  <div className="pass-wrap">
                    <input
                      className="lf-input" name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password" required
                      autoComplete="current-password"
                    />
                    <button type="button" className="eye-btn" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
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
                  <div className="lf-error">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {state.error}
                  </div>
                )}

                <button type="submit" disabled={pending} className="lf-btn">
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

              <p className="form-footer">
                Forgot your password? Contact your administrator.
              </p>
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
