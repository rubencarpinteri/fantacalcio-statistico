import type { Metadata } from 'next'
import './globals.css'

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
    <html lang="it" className="dark">
      <body>{children}</body>
    </html>
  )
}
