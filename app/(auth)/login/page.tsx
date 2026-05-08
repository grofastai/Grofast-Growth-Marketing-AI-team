'use client'

import { useActionState, useState } from 'react'
import { loginAction } from '@/lib/actions/auth'
import Image from 'next/image'

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Manrope:wght@400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

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

        /* ─── CARD ─── */
        .lp-card {
          position: relative; z-index: 10;
          display: flex;
          width: 100%; max-width: 960px;
          min-height: 620px;
          border-radius: 24px;
          overflow: hidden;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.06),
            0 8px 16px rgba(0,0,0,0.4),
            0 32px 80px rgba(0,0,0,0.55);
          animation: card-rise 0.65s cubic-bezier(0.22,1,0.36,1) both;
        }

        @keyframes card-rise {
          from { opacity: 0; transform: translateY(28px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        /* ─── LEFT PANEL ─── */
        .lp-left {
          width: 44%; flex-shrink: 0;
          position: relative; overflow: hidden;
          background: linear-gradient(155deg, #160202 0%, #2a0404 30%, #4a0808 65%, #6b1010 100%);
          display: flex; flex-direction: column;
          justify-content: flex-end;
          padding: 48px 44px;
        }

        /* Subtle grid */
        .lp-left::before {
          content: '';
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 36px 36px;
          pointer-events: none;
        }

        /* Glow orbs */
        .lp-orb {
          position: absolute; border-radius: 50%; pointer-events: none;
        }

        /* ─── LEFT: TOP LOGO AREA ─── */
        .lp-left-logo {
          position: relative; z-index: 2;
          display: flex; align-items: center; gap: 12px;
        }
        .lp-left-logo-img {
          width: 40px; height: 40px; border-radius: 10px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.15);
          flex-shrink: 0;
        }
        .lp-left-logo-name {
          font-family: 'Sora', sans-serif;
          font-size: 13px; font-weight: 700;
          letter-spacing: 0.2em; color: #FFFFFF;
          text-transform: uppercase;
        }
        .lp-left-logo-sub {
          font-size: 9px; letter-spacing: 0.18em;
          color: rgba(255,255,255,0.3);
          text-transform: uppercase; font-weight: 500;
          margin-top: 2px;
        }

        /* ─── LEFT: CENTER ABSTRACT ─── */
        .lp-center-art { display: none; }

        /* ─── LEFT: BOTTOM TAGLINE ─── */
        .lp-tagline-block {
          position: relative; z-index: 2;
        }
        .lp-eyebrow {
          font-size: 10px; font-weight: 600;
          letter-spacing: 0.22em; text-transform: uppercase;
          color: rgba(255,255,255,0.28);
          margin-bottom: 12px; display: block;
        }
        .lp-tagline {
          font-family: 'Sora', sans-serif;
          font-size: 72px; font-weight: 800;
          line-height: 1.0; letter-spacing: -0.03em;
          color: #FFFFFF; text-transform: uppercase;
        }
        .lp-tagline em {
          font-style: normal;
          color: rgba(255,255,255,0.22);
        }
        .lp-services {
          display: flex; gap: 8px; margin-top: 20px; flex-wrap: wrap;
        }
        .lp-svc {
          font-size: 10.5px; font-weight: 600;
          color: rgba(255,255,255,0.38);
          letter-spacing: 0.05em;
          display: flex; align-items: center; gap: 5px;
        }
        .lp-svc::before {
          content: '';
          width: 3px; height: 3px; border-radius: 50%;
          background: rgba(220,38,38,0.7);
          flex-shrink: 0;
        }

        /* ─── RIGHT PANEL ─── */
        .lp-right {
          flex: 1; background: #FFFFFF;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 56px 52px;
          position: relative;
        }
        .lp-right::before {
          content: '';
          position: absolute; top: 0; left: 0;
          width: 140px; height: 140px;
          background: radial-gradient(circle at top left, rgba(220,38,38,0.04) 0%, transparent 70%);
          pointer-events: none;
        }

        .lp-form-wrap {
          width: 100%; max-width: 340px;
          position: relative; z-index: 1;
        }

        /* Logo */
        .lp-logo {
          display: flex; flex-direction: column;
          align-items: center; margin-bottom: 32px;
        }
        .lp-logo-img {
          width: 52px; height: 52px; border-radius: 16px; overflow: hidden;
          border: 1.5px solid rgba(220,38,38,0.15);
          box-shadow: 0 4px 20px rgba(220,38,38,0.12);
          margin-bottom: 10px;
        }
        .lp-logo-name {
          font-family: 'Sora', sans-serif;
          font-size: 12px; font-weight: 700;
          letter-spacing: 0.22em; color: #1A1A1A;
          text-transform: uppercase;
        }

        .lp-h1 {
          font-family: 'Sora', sans-serif;
          font-size: 28px; font-weight: 800;
          color: #0D0D12; letter-spacing: -0.02em;
          text-align: center; line-height: 1.15;
          margin-bottom: 8px; text-transform: uppercase;
        }
        .lp-sub {
          font-size: 13.5px; color: #94A3B8;
          text-align: center; line-height: 1.6;
          font-weight: 400; margin-bottom: 32px;
        }

        .lp-sep {
          display: flex; align-items: center; gap: 12px; margin-bottom: 24px;
        }
        .lp-sep-line { flex: 1; height: 1px; background: #F1F5F9; }
        .lp-sep-text { font-size: 11px; color: #CBD5E1; font-weight: 500; letter-spacing: 0.08em; white-space: nowrap; }

        /* Inputs */
        .lp-field { margin-bottom: 18px; }
        .lp-label {
          display: block; font-size: 12px; font-weight: 600;
          color: #374151; margin-bottom: 7px; letter-spacing: 0.01em;
        }
        .lp-input {
          width: 100%; padding: 13px 16px; border-radius: 12px;
          border: 1.5px solid #E5E9F0; background: #FAFBFC;
          font-size: 14px; font-family: 'Manrope', sans-serif;
          font-weight: 500; color: #0D0D12; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
        }
        .lp-input::placeholder { color: #BDC5D1; font-weight: 400; }
        .lp-input:focus {
          border-color: #DC2626; background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(220,38,38,0.08);
        }

        .lp-pass-header {
          display: flex; justify-content: space-between;
          align-items: center; margin-bottom: 7px;
        }
        .lp-forgot {
          font-size: 12px; color: #9CA3AF; font-weight: 500; cursor: default;
        }
        .lp-eye {
          position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; line-height: 0;
          color: #BDC5D1; padding: 4px; transition: color 0.15s;
        }
        .lp-eye:hover { color: #6B7280; }
        .lp-pw-wrap { position: relative; }
        .lp-pw-wrap .lp-input { padding-right: 46px; }

        /* Button */
        .lp-btn {
          width: 100%; padding: 15px; margin-top: 6px;
          border-radius: 12px; border: none; cursor: pointer;
          font-family: 'Sora', sans-serif;
          font-size: 14px; font-weight: 700; letter-spacing: 0.05em;
          color: #FFFFFF;
          background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%);
          box-shadow: 0 4px 20px rgba(220,38,38,0.3), 0 1px 4px rgba(220,38,38,0.2);
          transition: transform 0.15s, box-shadow 0.15s;
          position: relative; overflow: hidden;
        }
        .lp-btn::before {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%);
          pointer-events: none;
        }
        .lp-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 28px rgba(220,38,38,0.4);
        }
        .lp-btn:active:not(:disabled) { transform: translateY(0); }
        .lp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .lp-error {
          display: flex; gap: 9px; align-items: flex-start;
          padding: 11px 14px; border-radius: 10px;
          background: #FEF2F2; border: 1px solid #FECACA;
          color: #DC2626; font-size: 13px; font-weight: 500; margin-bottom: 4px;
        }

        .lp-footer {
          margin-top: 24px; padding-top: 20px;
          border-top: 1px solid #F1F5F9;
          text-align: center; font-size: 12px;
          color: #B0BAC8; line-height: 1.6;
        }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }

        /* Abstract ring animations */
        @keyframes slow-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes slow-spin-r {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
        @keyframes float-y {
          0%,100% { transform: translateY(0); }
          50%      { transform: translateY(-14px); }
        }
        @keyframes pulse-dot {
          0%,100% { opacity: 0.4; transform: scale(1); }
          50%      { opacity: 1; transform: scale(1.3); }
        }

        @media (max-width: 720px) {
          .lp-left { display: none; }
          .lp-page { padding: 0; background: #FFFFFF; }
          .lp-card { border-radius: 0; box-shadow: none; min-height: 100vh; }
          .lp-right { padding: 44px 28px; }
          .lp-page::before { display: none; }
        }
      `}</style>

      <div className="lp-page">
        <div className="lp-card">

          {/* ══ LEFT PANEL ══ */}
          <div className="lp-left">

            {/* Glow orbs */}
            <div className="lp-orb" style={{
              width: 340, height: 340, top: '5%', right: '-80px',
              background: 'radial-gradient(circle, rgba(220,38,38,0.2) 0%, transparent 65%)',
            }}/>
            <div className="lp-orb" style={{
              width: 180, height: 180, bottom: '18%', left: '-50px',
              background: 'radial-gradient(circle, rgba(220,38,38,0.1) 0%, transparent 65%)',
            }}/>

            {/* Top: logo */}
            <div className="lp-left-logo" style={{ marginBottom: 'auto' }}>
              <div className="lp-left-logo-img">
                <Image src="/brand/logo.jpg" alt="GroFast" width={40} height={40}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              </div>
              <div>
                <div className="lp-left-logo-name">GroFast</div>
                <div className="lp-left-logo-sub">Growth & AI Solutions</div>
              </div>
            </div>

            {/* Bottom: tagline */}
            <div className="lp-tagline-block">
              <span className="lp-eyebrow">Your Team Portal</span>
              <div className="lp-tagline">
                Track.<br/>
                Grow.<br/>
                <em>Succeed.</em>
              </div>
              <div className="lp-services">
                {['AI Automation', 'Digital Growth', 'Influencer Marketing'].map(s => (
                  <span key={s} className="lp-svc">{s}</span>
                ))}
              </div>
            </div>
          </div>

          {/* ══ RIGHT PANEL ══ */}
          <div className="lp-right">
            <div className="lp-form-wrap">

              <div className="lp-logo">
                <div className="lp-logo-img">
                  <Image src="/brand/logo.jpg" alt="GroFast" width={52} height={52}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                </div>
                <span className="lp-logo-name">GROFAST</span>
              </div>

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
