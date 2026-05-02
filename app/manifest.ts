import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GroFast Team Tracking',
    short_name: 'GroFast',
    description: 'Employee tracking & productivity platform for small businesses',
    start_url: '/',
    display: 'standalone',
    background_color: '#0D0D0D',
    theme_color: '#DC2626',
    orientation: 'portrait-primary',
    icons: [
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
      { src: '/icon',       sizes: '512x512', type: 'image/png' },
    ],
  }
}
