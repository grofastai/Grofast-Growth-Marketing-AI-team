import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans, Bebas_Neue, Fraunces } from "next/font/google"
import "./globals.css"
import PwaInstallPrompt from "@/components/pwa-install-prompt"
import { ConfirmProvider } from "@/components/ui/ConfirmDialog"

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
})

const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
})

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "900"],
  style: ["normal", "italic"],
  display: "swap",
})

export const viewport: Viewport = {
  themeColor: "#de1a1a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: "GroFast Team Tracking",
  description: "Employee tracking & productivity platform for small businesses",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GroFast",
    startupImage: "/apple-icon.jpg",
  },
  icons: {
    icon: "/icon.jpg",
    apple: "/apple-icon.jpg",
    shortcut: "/icon.jpg",
  },
  formatDetection: { telephone: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${bebas.variable} ${fraunces.variable}`}>
      <body className="min-h-screen antialiased" style={{ fontFamily: "var(--font-jakarta), sans-serif" }}>
        <ConfirmProvider>{children}</ConfirmProvider>
        <PwaInstallPrompt />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
