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
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        /* ─── PAGE ─── */
        .pg {
          min-height: 100vh;
          display: flex; align-items: center; justify-content: center;
          background: radial-gradient(ellipse 80% 60% at 30% 50%, #1a0404 0%, #0a0a0a 55%);
          font-family: 'DM Sans', sans-serif;
          padding: 24px;
        }

        /* ─── CARD ─── */
        .card {
          display: flex;
          width: 100%; max-width: 1060px;
          min-height: 660px;
          border-radius: 28px;
          overflow: visible;
          position: relative;
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.05),
            0 40px 100px rgba(0,0,0,0.75),
            0 0 120px rgba(180,0,0,0.08);
          animation: rise 0.65s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes rise {
          from { opacity:0; transform: translateY(28px) scale(0.98); }
          to   { opacity:1; transform: translateY(0) scale(1); }
        }

        /* ═══════════════════════════════
           LEFT PANEL
        ═══════════════════════════════ */
        .left {
          width: 52%; flex-shrink: 0;
          border-radius: 28px 0 0 28px;
          background: #060606;
          position: relative; overflow: hidden;
          display: flex; flex-direction: column;
          padding: 40px 44px 36px;
        }

        /* Cinematic ambient glow */
        .left::before {
          content: '';
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse 80% 70% at 90% 100%, rgba(160,0,0,0.35) 0%, transparent 60%),
            radial-gradient(ellipse 60% 50% at 10% 20%, rgba(140,10,10,0.15) 0%, transparent 55%),
            radial-gradient(ellipse 40% 35% at 50% 55%, rgba(200,20,20,0.07) 0%, transparent 50%);
          pointer-events: none; z-index: 0;
        }

        /* Futuristic grid */
        .left::after {
          content: '';
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none; z-index: 0;
        }

        /* ── Logo row ── */
        .l-logo {
          display: flex; align-items: center; gap: 12px;
          position: relative; z-index: 5; flex-shrink: 0;
        }
        .l-logo-img {
          width: 40px; height: 40px; border-radius: 10px; overflow: hidden;
          border: 1px solid rgba(255,255,255,0.14); flex-shrink: 0;
        }
        .l-logo-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 24px; letter-spacing: 0.14em; color: #fff;
        }
        .l-logo-dot { color: #DC2626; }

        /* ── Poster headline ── */
        .l-headline {
          position: relative; z-index: 2;
          margin-top: 30px; flex-shrink: 0;
          line-height: 1;
        }
        .l-word {
          display: block;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 124px;
          line-height: 0.84;
          letter-spacing: 0.02em;
          color: #FFFFFF;
          text-shadow:
            0 0 80px rgba(255,255,255,0.1),
            0 0 160px rgba(220,38,38,0.1),
            0 2px 0 rgba(0,0,0,0.5);
        }

        /* ── Sub tagline ── */
        .l-tagline {
          margin-top: 20px;
          position: relative; z-index: 5; flex-shrink: 0;
        }
        .l-tagline p {
          font-size: 10.5px; font-weight: 600;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: rgba(255,255,255,0.3); line-height: 2.2;
        }
        .l-tagline .red { color: #DC2626; }

        /* ── Floating UI badges ── */
        .fb {
          position: absolute; z-index: 6;
          background: rgba(18,18,18,0.92);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 14px;
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px;
          backdrop-filter: blur(12px);
          animation: badge-float ease-in-out infinite;
        }
        .fb-icon {
          width: 34px; height: 34px; border-radius: 9px;
          background: rgba(220,38,38,0.14);
          border: 1px solid rgba(220,38,38,0.2);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .fb-val { font-size: 14px; font-weight: 700; color: #fff; line-height: 1; }
        .fb-lbl { font-size: 9.5px; font-weight: 600; color: rgba(255,255,255,0.38); letter-spacing: 0.06em; text-transform: uppercase; margin-top: 2px; }

        .fb-1 { top: 112px; left: 22px; animation-delay: 0s; animation-duration: 5.2s; }
        .fb-2 { top: 210px; right: 80px; animation-delay: -1.8s; animation-duration: 4.6s; }
        .fb-3 { top: 320px; left: 16px; animation-delay: -3.2s; animation-duration: 5.8s; }

        @keyframes badge-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-9px); }
        }

        /* ── Red particles ── */
        .pt {
          position: absolute; border-radius: 50%;
          pointer-events: none; z-index: 1;
          animation: pt-rise linear infinite;
        }
        .pt:nth-child(1)  { width:3px; height:3px; left:12%; bottom:110px; animation-duration:4.2s; animation-delay:0s;    opacity:.65; background:#DC2626; }
        .pt:nth-child(2)  { width:2px; height:2px; left:28%; bottom:160px; animation-duration:5.8s; animation-delay:-1.1s; opacity:.4;  background:#DC2626; }
        .pt:nth-child(3)  { width:4px; height:4px; left:48%; bottom:90px;  animation-duration:3.8s; animation-delay:-2.3s; opacity:.5;  background:#E03030; }
        .pt:nth-child(4)  { width:2px; height:2px; left:68%; bottom:130px; animation-duration:6.1s; animation-delay:-0.6s; opacity:.35; background:#DC2626; }
        .pt:nth-child(5)  { width:3px; height:3px; left:22%; bottom:220px; animation-duration:4.7s; animation-delay:-3.1s; opacity:.5;  background:#DC2626; }
        .pt:nth-child(6)  { width:2px; height:2px; left:80%; bottom:170px; animation-duration:5.2s; animation-delay:-1.7s; opacity:.3;  background:#E03030; }
        @keyframes pt-rise {
          0%  { transform: translateY(0) scale(1); opacity: 0; }
          8%  { opacity: 1; }
          88% { opacity: .3; }
          100%{ transform: translateY(-320px) scale(0.2); opacity: 0; }
        }

        /* ── Glow orbs ── */
        .orb {
          position: absolute; border-radius: 50%;
          pointer-events: none; z-index: 0;
        }
        .orb-1 {
          width: 240px; height: 240px;
          background: radial-gradient(circle, rgba(160,0,0,0.22) 0%, transparent 68%);
          bottom: 40px; right: 0;
          animation: orb-pulse 3.4s ease-in-out infinite;
        }
        .orb-2 {
          width: 140px; height: 140px;
          background: radial-gradient(circle, rgba(220,38,38,0.14) 0%, transparent 70%);
          top: 160px; left: 10px;
          animation: orb-pulse 4.2s ease-in-out infinite;
          animation-delay: -1.8s;
        }
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.25); opacity: .65; }
        }

        /* ── Scan line accent ── */
        .scan-line {
          position: absolute; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(220,38,38,0.4), transparent);
          z-index: 1; pointer-events: none;
          animation: scan 8s linear infinite;
        }
        @keyframes scan {
          0%   { top: 0%; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }

        /* ── Feature strip ── */
        .l-features {
          display: flex; gap: 0;
          border-top: 1px solid rgba(255,255,255,0.07);
          padding-top: 20px;
          position: relative; z-index: 5;
          margin-top: auto; flex-shrink: 0;
        }
        .l-feat {
          flex: 1;
          display: flex; align-items: center; gap: 10px;
          padding-right: 16px;
        }
        .l-feat + .l-feat {
          border-left: 1px solid rgba(255,255,255,0.07);
          padding-left: 16px; padding-right: 0;
        }
        .l-feat-icon {
          width: 36px; height: 36px; border-radius: 10px;
          border: 1px solid rgba(220,38,38,0.28);
          background: rgba(220,38,38,0.07);
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .l-feat-num {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 17px; color: #fff; letter-spacing: 0.05em; line-height: 1;
        }
        .l-feat-lbl {
          font-size: 9px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.1em; color: rgba(255,255,255,0.28); margin-top: 3px;
        }

        /* ═══════════════════════════════
           CHARACTER — lives on card level
        ═══════════════════════════════ */
        .char-wrap {
          position: absolute;
          left: calc(52% - 100px);
          bottom: 0;
          width: 300px;
          z-index: 30;
          pointer-events: none;
        }
        /* cast shadow */
        .char-wrap::after {
          content: '';
          position: absolute;
          bottom: -4px; left: 50%;
          transform: translateX(-50%);
          width: 180px; height: 24px;
          background: radial-gradient(ellipse, rgba(0,0,0,0.55) 0%, transparent 70%);
          filter: blur(8px);
          z-index: -1;
        }

        /* ═══════════════════════════════
           RIGHT PANEL
        ═══════════════════════════════ */
        .right {
          flex: 1;
          border-radius: 0 28px 28px 0;
          background: #FFFFFF;
          display: flex; align-items: center; justify-content: center;
          padding: 52px 52px 52px 80px;
          position: relative; overflow: hidden;
        }

        /* Subtle red ambient on right */
        .right::before {
          content: '';
          position: absolute; inset: 0;
          background: radial-gradient(ellipse 55% 45% at 0% 55%, rgba(220,38,38,0.045) 0%, transparent 60%);
          pointer-events: none;
        }

        /* ambient shadow between panels */
        .right::after {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0; width: 40px;
          background: linear-gradient(90deg, rgba(0,0,0,0.08), transparent);
          pointer-events: none; z-index: 1;
        }

        .r-wrap {
          width: 100%; max-width: 340px;
          position: relative; z-index: 2;
        }

        /* Right logo */
        .r-logo {
          display: flex; flex-direction: column; align-items: center;
          margin-bottom: 26px;
        }
        .r-logo-img {
          width: 62px; height: 62px; border-radius: 18px; overflow: hidden;
          border: 2px solid #0D0D12;
          box-shadow: 0 6px 20px rgba(0,0,0,0.12);
          margin-bottom: 11px;
        }
        .r-logo-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 18px; letter-spacing: 0.24em; color: #0D0D12;
        }

        .r-h1 {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 40px; letter-spacing: 0.06em;
          color: #0D0D12; text-align: center; margin-bottom: 8px;
        }
        .r-sub {
          font-size: 13.5px; color: #94A3B8;
          text-align: center; line-height: 1.65;
          font-weight: 400; margin-bottom: 26px;
        }

        /* Divider */
        .r-divider {
          display: flex; align-items: center; gap: 12px; margin-bottom: 22px;
        }
        .r-div-line { flex: 1; height: 1px; background: #F0F2F5; }
        .r-div-txt {
          font-size: 10.5px; color: #CBD5E1; font-weight: 600;
          letter-spacing: 0.12em; text-transform: uppercase;
        }

        /* Fields */
        .r-field { margin-bottom: 16px; }
        .r-field-head {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: 8px;
        }
        .r-lbl { font-size: 12px; font-weight: 600; color: #374151; letter-spacing: 0.01em; }
        .r-forgot { font-size: 12px; font-weight: 600; color: #DC2626; cursor: default; }

        .r-iw { position: relative; display: flex; align-items: center; }
        .r-ii {
          position: absolute; left: 14px;
          color: #C0CAD6; pointer-events: none; line-height: 0;
        }
        .r-inp {
          width: 100%; padding: 13px 16px 13px 44px;
          border-radius: 13px;
          border: 1.5px solid #E5E9F0;
          background: #F9FAFB;
          font-size: 14px; font-family: 'DM Sans', sans-serif; font-weight: 400;
          color: #0D0D12; outline: none;
          transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
        }
        .r-inp::placeholder { color: #BCC5D0; }
        .r-inp:focus {
          border-color: #DC2626; background: #FFFFFF;
          box-shadow: 0 0 0 4px rgba(220,38,38,0.09);
        }
        .r-inp-pw { padding-right: 46px; }
        .r-eye {
          position: absolute; right: 14px;
          background: none; border: none; cursor: pointer;
          color: #BCC5D0; padding: 4px; line-height: 0;
          transition: color 0.15s;
        }
        .r-eye:hover { color: #6B7280; }

        /* Error */
        .r-err {
          display: flex; gap: 8px; align-items: flex-start;
          padding: 11px 14px; border-radius: 10px;
          background: #FEF2F2; border: 1px solid #FECACA;
          color: #DC2626; font-size: 13px; margin-bottom: 8px;
        }

        /* CTA Button */
        .r-btn {
          width: 100%; padding: 16px;
          border-radius: 100px; border: none; cursor: pointer;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 19px; letter-spacing: 0.12em;
          color: #FFFFFF;
          background: linear-gradient(135deg, #E52222 0%, #A81212 100%);
          box-shadow:
            0 8px 32px rgba(220,38,38,0.42),
            0 2px 8px rgba(220,38,38,0.22),
            inset 0 1px 0 rgba(255,255,255,0.12);
          transition: transform 0.15s, box-shadow 0.15s;
          margin-top: 10px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
        }
        .r-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow:
            0 14px 44px rgba(220,38,38,0.52),
            0 4px 14px rgba(220,38,38,0.28),
            inset 0 1px 0 rgba(255,255,255,0.15);
        }
        .r-btn:active:not(:disabled) { transform: translateY(0); }
        .r-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .r-footer {
          margin-top: 22px; text-align: center;
          font-size: 12.5px; color: #94A3B8; line-height: 1.6;
        }
        .r-footer span { color: #DC2626; font-weight: 600; }

        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }

        @media (max-width: 780px) {
          .left, .char-wrap { display: none; }
          .pg { padding: 0; background: #fff; }
          .card { border-radius: 0; min-height: 100vh; box-shadow: none; }
          .right { border-radius: 0; padding: 44px 28px; }
          .right::after { display: none; }
        }
      `}</style>

      <div className="pg">
        <div className="card">

          {/* ═══ LEFT PANEL ═══ */}
          <div className="left">
            <div className="orb orb-1" />
            <div className="orb orb-2" />
            <div className="scan-line" />

            {/* Particles */}
            <div className="pt" /><div className="pt" /><div className="pt" />
            <div className="pt" /><div className="pt" /><div className="pt" />

            {/* Logo */}
            <div className="l-logo">
              <div className="l-logo-img">
                <Image src="/brand/logo.jpg" alt="GroFast" width={40} height={40}
                  style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
              </div>
              <span className="l-logo-name">GROFAST<span className="l-logo-dot">.</span></span>
            </div>

            {/* Floating badges */}
            <div className="fb fb-1">
              <div className="fb-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M3 17l4-6 4 4 4-8 4 4" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div className="fb-val">+48%</div>
                <div className="fb-lbl">Growth Rate</div>
              </div>
            </div>

            <div className="fb fb-2">
              <div className="fb-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <div className="fb-val">AI</div>
                <div className="fb-lbl">Powered</div>
              </div>
            </div>

            <div className="fb fb-3">
              <div className="fb-icon">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M9 11l3 3L22 4" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" opacity="0.45"/>
                </svg>
              </div>
              <div>
                <div className="fb-val">Tasks</div>
                <div className="fb-lbl">Live Tracking</div>
              </div>
            </div>

            {/* Poster headline */}
            <div className="l-headline">
              <span className="l-word">TRACK.</span>
              <span className="l-word">GROW.</span>
              <span className="l-word">SUCCEED.</span>
            </div>

            {/* Sub tagline */}
            <div className="l-tagline">
              <p>One Platform. <span className="red">AI Powered.</span> Real Time.</p>
            </div>

            {/* Feature strip */}
            <div className="l-features">
              <div className="l-feat">
                <div className="l-feat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.7" strokeLinecap="round">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
                    <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                  </svg>
                </div>
                <div>
                  <div className="l-feat-num">24/7</div>
                  <div className="l-feat-lbl">AI Support</div>
                </div>
              </div>
              <div className="l-feat">
                <div className="l-feat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.7" strokeLinecap="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </div>
                <div>
                  <div className="l-feat-num">100%</div>
                  <div className="l-feat-lbl">Visibility</div>
                </div>
              </div>
              <div className="l-feat">
                <div className="l-feat-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="1.7" strokeLinecap="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                </div>
                <div>
                  <div className="l-feat-num">Live</div>
                  <div className="l-feat-lbl">Updates</div>
                </div>
              </div>
            </div>
          </div>

          {/* ═══ CHARACTER — positioned at panel border ═══ */}
          <div className="char-wrap">
            <Image
              src="/brand/character.png"
              alt="GroFast mascot"
              width={420} height={540}
              priority
              style={{ width:'100%', height:'auto', objectFit:'contain', display:'block' }}
            />
          </div>

          {/* ═══ RIGHT PANEL ═══ */}
          <div className="right">
            <div className="r-wrap">

              <div className="r-logo">
                <div className="r-logo-img">
                  <Image src="/brand/logo.jpg" alt="GroFast" width={62} height={62}
                    style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                </div>
                <span className="r-logo-name">GROFAST</span>
              </div>

              <h1 className="r-h1">WELCOME BACK</h1>
              <p className="r-sub">
                Enter your credentials to access<br/>your team dashboard.
              </p>

              <div className="r-divider">
                <div className="r-div-line" />
                <span className="r-div-txt">Sign In</span>
                <div className="r-div-line" />
              </div>

              <form action={action}>
                <div className="r-field">
                  <div className="r-field-head">
                    <label className="r-lbl">Email Address</label>
                  </div>
                  <div className="r-iw">
                    <span className="r-ii">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                        <polyline points="22,6 12,13 2,6"/>
                      </svg>
                    </span>
                    <input className="r-inp" name="email" type="email"
                      placeholder="you@company.com" required
                      autoComplete="email" autoCapitalize="none"/>
                  </div>
                </div>

                <div className="r-field">
                  <div className="r-field-head">
                    <label className="r-lbl">Password</label>
                    <span className="r-forgot">Forgot Password?</span>
                  </div>
                  <div className="r-iw">
                    <span className="r-ii">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </span>
                    <input className="r-inp r-inp-pw" name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••" required
                      autoComplete="current-password"/>
                    <button type="button" className="r-eye" tabIndex={-1}
                      onClick={() => setShowPassword(v => !v)}>
                      {showPassword ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                          <line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                {state?.error && (
                  <div className="r-err">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink:0, marginTop:1 }}>
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    {state.error}
                  </div>
                )}

                <button type="submit" disabled={pending} className="r-btn">
                  {pending ? (
                    <>
                      <svg className="spin" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                      </svg>
                      Signing In…
                    </>
                  ) : (
                    <>
                      Sign In
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                    </>
                  )}
                </button>
              </form>

              <p className="r-footer">
                Can&rsquo;t access your account?{' '}
                <span>Contact your administrator.</span>
              </p>

            </div>
          </div>

        </div>
      </div>
    </>
  )
}
