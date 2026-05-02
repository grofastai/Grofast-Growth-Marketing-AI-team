import { ImageResponse } from 'next/og'

export const size        = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 512,
          height: 512,
          background: '#0D0D0D',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: '#DC2626',
            fontSize: 210,
            fontWeight: 800,
            letterSpacing: '-6px',
            fontFamily: 'sans-serif',
          }}
        >
          GF
        </span>
      </div>
    ),
    { width: 512, height: 512 },
  )
}
