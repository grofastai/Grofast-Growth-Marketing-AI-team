import { ImageResponse } from 'next/og'

export const size        = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#0D0D0D',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 36,
        }}
      >
        <span
          style={{
            color: '#A3E635',
            fontSize: 74,
            fontWeight: 800,
            letterSpacing: '-2px',
            fontFamily: 'sans-serif',
          }}
        >
          GF
        </span>
      </div>
    ),
    { width: 180, height: 180 },
  )
}
