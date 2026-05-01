import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: {
    default: 'Fantacalcio Statistico',
    template: '%s — Fantacalcio Statistico',
  },
  description: 'Private Mantra-style fantasy football league with statistics-based scoring.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // dark class ensures dark mode is always active
    <html lang="it" className={`dark ${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
