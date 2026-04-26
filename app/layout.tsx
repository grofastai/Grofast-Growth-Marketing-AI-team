import type { Metadata } from "next"
import { Syne, DM_Sans } from "next/font/google"
import "./globals.css"

const syne = Syne({
  variable: "--font-syne",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
})

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "GroFast Team Tracking",
  description: "Employee tracking & productivity platform for small businesses",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmSans.variable}`}>
      <body className="min-h-screen bg-cream antialiased">{children}</body>
    </html>
  )
}
