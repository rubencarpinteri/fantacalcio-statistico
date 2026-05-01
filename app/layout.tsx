import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Instrument_Serif } from 'next/font/google'
import './globals.css'

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

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
    <html lang="it" className={`dark ${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable}`}>
      <body>{children}</body>
    </html>
  )
}
