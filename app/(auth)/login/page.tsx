'use client'

import { useActionState, useState, useEffect } from 'react'
import { loginAction } from '@/lib/actions/auth'
import Image from 'next/image'

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        .lr-root {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 480px 1fr;
          font-family: 'DM Sans', sans-serif;
          background: #F8F6F2;
          overflow: hidden;
        }

        /* ─── AI PANEL ─── */
        .ai-panel {
          background: linear-gradient(160deg, #EBF5FF 0%, #DBEAFE 60%, #EFF6FF 100%);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 64px 48px 64px 56px;
        }

        .ai-panel::after {
          content: '';
          position: absolute;
          top: 0; right: 0; width: 1px; height: 100%;
          background: linear-gradient(180deg, transparent, rgba(59,130,246,0.2) 30%, rgba(220,38,38,0.3) 50%, rgba(249,115,22,0.2) 70%, transparent);
        }

        /* ─── DIGITAL PANEL ─── */
        .dg-panel {
          background: linear-gradient(200deg, #FFF7ED 0%, #FFEDD5 60%, #FFF7ED 100%);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 64px 56px 64px 48px;
          align-items: flex-end;
          text-align: right;
        }

        .dg-panel::before {
          content: '';
          position: absolute;
          top: 0; left: 0; width: 1px; height: 100%;
          background: linear-gradient(180deg, transparent, rgba(249,115,22,0.2) 30%, rgba(220,38,38,0.3) 50%, rgba(59,130,246,0.2) 70%, transparent);
        }

        /* ─── CENTER COLUMN ─── */
        .center-col {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 32px;
          background: #FAFAF8;
          position: relative;
          z-index: 10;
        }

        /* Subtle center column shadow on both sides */
        .center-col::before, .center-col::after {
          content: '';
          position: absolute;
          top: 0; bottom: 0; width: 40px;
          pointer-events: none;
        }
        .center-col::before {
          left: 0;
          background: linear-gradient(90deg, rgba(59,130,246,0.04), transparent);
        }
        .center-col::after {
          right: 0;
          background: linear-gradient(270deg, rgba(249,115,22,0.04), transparent);
        }

        /* ─── CARD ─── */
        .login-card {
          width: 100%;
          max-width: 400px;
          background: #FFFFFF;
          border-radius: 28px;
          padding: 44px 40px 40px;
          box-shadow:
            0 2px 4px rgba(0,0,0,0.04),
            0 8px 24px rgba(0,0,0,0.07),
            0 24px 60px rgba(0,0,0,0.06);
          position: relative;
          overflow: hidden;
        }

        /* Rainbow top border: AI blue → brand red → digital orange */
        .login-card::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; height: 3px;
          background: linear-gradient(90deg, #3B82F6 0%, #7C3AED 30%, #DC2626 50%, #EA580C 70%, #F97316 100%);
        }

        /* ─── PANEL ICON MARK ─── */
        .icon-mark {
          width: 60px; height: 60px;
          border-radius: 18px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 24px;
          flex-shrink: 0;
        }

        .ai-mark {
          background: linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%);
          border: 1px solid rgba(59,130,246,0.25);
          box-shadow: 0 8px 24px rgba(59,130,246,0.15);
        }

        .dg-mark {
          background: linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%);
          border: 1px solid rgba(249,115,22,0.25);
          box-shadow: 0 8px 24px rgba(249,115,22,0.15);
        }

        /* ─── PANEL HEADINGS ─── */
        .panel-title {
          font-family: 'Syne', sans-serif;
          font-weight: 800;
          font-size: 32px;
          line-height: 1.1;
          letter-spacing: -0.025em;
          margin-bottom: 12px;
        }

        .panel-desc {
          font-size: 13.5px;
          line-height: 1.65;
          color: #64748B;
          max-width: 270px;
          margin-bottom: 28px;
        }

        /* ─── PILLS ─── */
        .ai-pill, .dg-pill {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px 7px 10px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.01em;
          width: fit-content;
          transition: transform 0.2s;
        }

        .ai-pill {
          background: rgba(59,130,246,0.08);
          border: 1px solid rgba(59,130,246,0.18);
          color: #1D4ED8;
        }

        .dg-pill {
          background: rgba(249,115,22,0.08);
          border: 1px solid rgba(249,115,22,0.18);
          color: #C2410C;
        }

        .pill-dot {
          width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
        }

        /* ─── FORM ELEMENTS ─── */
        .lf-label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #94A3B8;
          margin-bottom: 8px;
        }

        .lf-input {
          width: 100%;
          padding: 13px 16px;
          border-radius: 13px;
          border: 1.5px solid #E8EDF3;
          background: #F8FAFC;
          font-size: 14px;
          font-family: 'DM Sans', sans-serif;
          color: #0F172A;
          outline: none;
          transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
        }

        .lf-input::placeholder { color: #C1CBD8; }

        .lf-input:focus {
          border-color: #DC2626;
          background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(220,38,38,0.07);
        }

        .lf-submit {
          width: 100%;
          padding: 15px;
          border-radius: 13px;
          border: none;
          cursor: pointer;
          font-family: 'Syne', sans-serif;
          font-size: 14.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          color: #FFFFFF;
          background: linear-gradient(135deg, #DC2626 0%, #B91C1C 100%);
          box-shadow: 0 6px 20px rgba(220,38,38,0.28), 0 2px 6px rgba(220,38,38,0.15);
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s;
          margin-top: 6px;
        }

        .lf-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(220,38,38,0.35), 0 4px 10px rgba(220,38,38,0.2);
        }

        .lf-submit:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 4px 12px rgba(220,38,38,0.25);
        }

        .lf-submit:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        /* ─── ANIMATIONS ─── */
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-10px); }
        }

        @keyframes pulse-node {
          0%, 100% { opacity: 0.12; r: attr(r); }
          50%       { opacity: 0.25; }
        }

        @keyframes draw-line {
          from { stroke-dashoffset: 800; }
          to   { stroke-dashoffset: 0; }
        }

        @keyframes grow-bar {
          from { transform: scaleY(0); }
          to   { transform: scaleY(1); }
        }

        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes node-pulse {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50%       { transform: scale(1.5); opacity: 0.4; }
        }

        .animated-node { animation: node-pulse 3s ease-in-out infinite; }

        .trend-line {
          stroke-dasharray: 800;
          stroke-dashoffset: 800;
          animation: draw-line 2.2s ease forwards 0.4s;
        }

        .bar-animated {
          transform-origin: bottom center;
          transform: scaleY(0);
          animation: grow-bar 0.8s cubic-bezier(0.34,1.56,0.64,1) forwards;
        }

        .card-enter {
          animation: fade-up 0.7s cubic-bezier(0.34,1.1,0.64,1) forwards;
        }

        .float-1 { animation: float 5s ease-in-out infinite; }
        .float-2 { animation: float 6s ease-in-out infinite 0.8s; }
        .float-3 { animation: float 4.5s ease-in-out infinite 1.4s; }
        .float-4 { animation: float 5.5s ease-in-out infinite 0.4s; }
        .spin { animation: spin 0.85s linear infinite; }

        /* ─── STAT BADGE ─── */
        .stat-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 14px;
          background: rgba(255,255,255,0.7);
          border: 1px solid rgba(255,255,255,0.9);
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
          backdrop-filter: blur(8px);
          font-size: 12.5px;
          font-weight: 500;
          color: #334155;
          width: fit-content;
        }

        .ai-stat-badge { border-color: rgba(59,130,246,0.15); }
        .dg-stat-badge { border-color: rgba(249,115,22,0.15); }

        /* ─── RESPONSIVE ─── */
        @media (max-width: 1100px) {
          .lr-root { grid-template-columns: 1fr; }
          .ai-panel, .dg-panel { display: none; }
          .center-col {
            min-height: 100vh;
            padding: 32px 20px;
            background: linear-gradient(135deg, #EFF6FF 0%, #FAFAF8 40%, #FFF7ED 100%);
          }
          .center-col::before, .center-col::after { display: none; }
        }
      `}</style>

      <div className="lr-root">

        {/* ══════════════════════════════
             LEFT — AI PANEL
        ══════════════════════════════ */}
        <div className="ai-panel">

          {/* Neural network SVG */}
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice"
          >
            {/* Connection edges */}
            {[
              [70,100,200,220],[70,100,140,340],[200,220,300,160],[200,220,260,400],
              [140,340,260,400],[300,160,380,300],[260,400,380,300],[260,400,200,540],
              [140,340,200,540],[380,300,340,500],[200,540,340,500],[60,500,200,540],
              [400,120,300,160],[400,120,380,300],
            ].map(([x1,y1,x2,y2], i) => (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#3B82F6" strokeWidth="1.2" opacity="0.13"/>
            ))}

            {/* Nodes with pulse animation */}
            {[
              [70,100,7,0],[200,220,11,0.4],[140,340,8,0.9],[300,160,6,1.3],
              [260,400,10,0.2],[380,300,7,0.7],[200,540,8,1.1],[340,500,6,0.5],
              [60,500,5,1.6],[400,120,5,0.9],
            ].map(([cx,cy,r,delay], i) => (
              <circle key={i} cx={cx} cy={cy} r={r}
                fill="#3B82F6"
                style={{ animation: `node-pulse 3s ease-in-out infinite ${delay}s` }}
              />
            ))}

            {/* Large ambient glow */}
            <circle cx="200" cy="350" r="180" fill="#3B82F6" opacity="0.025"/>
            <circle cx="200" cy="350" r="100" fill="#3B82F6" opacity="0.04"/>
          </svg>

          {/* AI icon mark */}
          <div className="icon-mark ai-mark">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 0 2h-1v1a2 2 0 0 1-2 2v1a1 1 0 0 1-2 0v-1H7v1a1 1 0 0 1-2 0v-1a2 2 0 0 1-2-2v-1H2a1 1 0 0 1 0-2h1a7 7 0 0 1 7-7h1V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2z" fill="rgba(59,130,246,0.25)"/>
              <circle cx="8.5" cy="14" r="1.5" fill="#2563EB"/>
              <circle cx="15.5" cy="14" r="1.5" fill="#2563EB"/>
              <path d="M8.5 17.5c.83 1 2.17 1.5 3.5 1.5s2.67-.5 3.5-1.5" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>

          {/* Text */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#93C5FD', marginBottom: 10 }}>
              AI Intelligence
            </p>
            <h2 className="panel-title" style={{ color: '#1E3A5F' }}>
              Intelligent<br/>
              <span style={{ color: '#3B82F6' }}>Automation</span>
            </h2>
            <p className="panel-desc">
              Neural networks, machine learning, and smart automation working together to transform how your team operates.
            </p>

            {/* Feature pills — floating */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Neural Network AI', cls: 'float-1', dot: '#3B82F6' },
                { label: 'Smart Automation', cls: 'float-2', dot: '#6366F1' },
                { label: 'Predictive Analytics', cls: 'float-3', dot: '#8B5CF6' },
                { label: 'NLP Processing', cls: 'float-4', dot: '#3B82F6' },
              ].map(({ label, cls, dot }) => (
                <div key={label} className={`ai-pill ${cls}`}>
                  <span className="pill-dot" style={{ background: dot }}/>
                  {label}
                </div>
              ))}
            </div>

            {/* Stat badge */}
            <div className="stat-badge ai-stat-badge float-1" style={{ marginTop: 28 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#3B82F6" opacity="0.8"/>
              </svg>
              <span style={{ color: '#1D4ED8', fontWeight: 600, fontSize: 12 }}>
                10× faster operations
              </span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════
             CENTER — LOGIN FORM
        ══════════════════════════════ */}
        <div className="center-col">
          <div className="login-card card-enter">

            {/* Logo row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
                border: '1.5px solid rgba(220,38,38,0.18)',
                boxShadow: '0 4px 16px rgba(220,38,38,0.14)',
              }}>
                <Image src="/brand/logo.jpg" alt="GroFast" width={44} height={44}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              </div>
              <div>
                <p style={{
                  fontFamily: 'Syne, sans-serif', fontSize: 15, fontWeight: 800,
                  letterSpacing: '0.12em', color: '#0F172A',
                }}>GROFAST</p>
                <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#94A3B8' }}>
                  Growth & AI Solutions
                </p>
              </div>
              {/* Status pill */}
              <div style={{ marginLeft: 'auto' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 100,
                  background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)',
                  fontSize: 10, fontWeight: 600, color: '#15803D', letterSpacing: '0.06em',
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', display: 'inline-block' }}/>
                  Secure
                </span>
              </div>
            </div>

            {/* Heading */}
            <div style={{ marginBottom: 28 }}>
              <h1 style={{
                fontFamily: 'Syne, sans-serif', fontSize: 28, fontWeight: 800,
                color: '#0F172A', letterSpacing: '-0.025em', lineHeight: 1.2,
                marginBottom: 6,
              }}>
                Welcome back
              </h1>
              <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.5 }}>
                Sign in to your team workspace
              </p>
            </div>

            {/* Form */}
            <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label className="lf-label">Email address</label>
                <input
                  className="lf-input" name="email" type="email"
                  placeholder="you@company.com" required autoComplete="email" autoCapitalize="none"
                />
              </div>

              <div>
                <label className="lf-label">Password</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="lf-input" name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password" required autoComplete="current-password"
                    style={{ paddingRight: 48 }}
                  />
                  <button
                    type="button" onClick={() => setShowPassword(v => !v)} tabIndex={-1}
                    style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0,
                      color: '#C1CBD8', padding: 4, transition: 'color 0.15s',
                    }}
                  >
                    {showPassword ? (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    ) : (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {state?.error && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 14px', borderRadius: 12,
                  background: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.14)',
                  color: '#DC2626', fontSize: 13,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {state.error}
                </div>
              )}

              <button type="submit" disabled={pending} className="lf-submit">
                {pending ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <svg className="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Signing in…
                  </span>
                ) : 'Sign In →'}
              </button>
            </form>

            {/* Footer */}
            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #F1F5F9' }}>
              <p style={{ fontSize: 11.5, color: '#CBD5E1', textAlign: 'center', letterSpacing: '0.01em' }}>
                Forgot your password? Contact your administrator.
              </p>
            </div>

            {/* AI / Digital dual badge at bottom */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20,
            }}>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 500,
                color: '#93C5FD', letterSpacing: '0.06em',
              }}>
                <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#3B82F6" opacity="0.5"/></svg>
                AI Powered
              </span>
              <span style={{ fontSize: 10, color: '#E2E8F0' }}>·</span>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 500,
                color: '#94A3B8', letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                GroFast Digital
              </span>
              <span style={{ fontSize: 10, color: '#E2E8F0' }}>·</span>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 500,
                color: '#FDBA74', letterSpacing: '0.06em',
              }}>
                Digital Growth
                <svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#F97316" opacity="0.5"/></svg>
              </span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════
             RIGHT — DIGITAL PANEL
        ══════════════════════════════ */}
        <div className="dg-panel">

          {/* Growth chart SVG background */}
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice"
          >
            {/* Horizontal grid lines */}
            {[120, 220, 320, 420, 520, 620].map(y => (
              <line key={y} x1="30" y1={y} x2="470" y2={y}
                stroke="#F97316" strokeWidth="0.6" opacity="0.07"/>
            ))}

            {/* Rising trend line */}
            <polyline
              points="50,620 110,560 180,490 250,400 310,320 370,240 430,160 470,110"
              fill="none" stroke="#F97316" strokeWidth="2.5" opacity="0.22"
              className="trend-line"
            />

            {/* Area fill under the trend */}
            <polyline
              points="50,620 110,560 180,490 250,400 310,320 370,240 430,160 470,110 470,700 50,700"
              fill="#F97316" opacity="0.04"
            />

            {/* Data point circles */}
            {[[50,620],[110,560],[180,490],[250,400],[310,320],[370,240],[430,160],[470,110]].map(([cx,cy],i) => (
              <circle key={i} cx={cx} cy={cy} r="5" fill="#F97316" opacity="0.25"
                style={{ animation: `node-pulse 3s ease-in-out infinite ${i * 0.3}s` }}/>
            ))}

            {/* Bar chart at bottom */}
            {[
              [60, 80, '0s'], [120, 110, '0.1s'], [180, 95, '0.2s'],
              [240, 140, '0.3s'], [300, 160, '0.4s'], [360, 195, '0.5s'], [420, 220, '0.6s'],
            ].map(([x, h, delay], i) => (
              <rect key={i} x={+x - 18} y={680 - +h} width={34} height={+h} rx={5}
                fill="#F97316" opacity="0.1" className="bar-animated"
                style={{ animationDelay: String(delay) }}/>
            ))}

            {/* Large ambient glow */}
            <circle cx="300" cy="350" r="180" fill="#F97316" opacity="0.025"/>
          </svg>

          {/* Digital icon mark */}
          <div className="icon-mark dg-mark" style={{ marginLeft: 'auto' }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path d="M3 3v18h18" stroke="#EA580C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M7 16l4-5 4 3 5-8" stroke="#EA580C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="19" cy="6" r="2.5" fill="#F97316" opacity="0.5"/>
            </svg>
          </div>

          {/* Text */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#FDBA74', marginBottom: 10 }}>
              Digital Growth
            </p>
            <h2 className="panel-title" style={{ color: '#431407' }}>
              Scale &<br/>
              <span style={{ color: '#F97316' }}>Dominate</span>
            </h2>
            <p className="panel-desc" style={{ marginLeft: 'auto' }}>
              Performance-driven campaigns, influencer partnerships, and data strategies that compound your brand's reach.
            </p>

            {/* Feature pills */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
              {[
                { label: 'Growth Marketing', cls: 'float-1', dot: '#F97316' },
                { label: 'Influencer Network', cls: 'float-2', dot: '#FB923C' },
                { label: 'SEO & SEM Mastery', cls: 'float-3', dot: '#EA580C' },
                { label: 'ROI Optimization', cls: 'float-4', dot: '#F97316' },
              ].map(({ label, cls, dot }) => (
                <div key={label} className={`dg-pill ${cls}`}>
                  <span className="pill-dot" style={{ background: dot }}/>
                  {label}
                </div>
              ))}
            </div>

            {/* Stat badge */}
            <div className="stat-badge dg-stat-badge float-2" style={{ marginTop: 28, marginLeft: 'auto' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="#F97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M17 6h6v6" stroke="#F97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ color: '#C2410C', fontWeight: 600, fontSize: 12 }}>
                340% avg client ROI
              </span>
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
