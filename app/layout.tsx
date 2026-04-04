import type { Metadata } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import './globals.css'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
})

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
    <html lang="it" className={`dark ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
