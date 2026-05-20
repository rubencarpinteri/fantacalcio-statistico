import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Strict mode for React 19
  reactStrictMode: true,

  typedRoutes: true,

  // Bundle _data folder so CSV files are accessible in Vercel serverless functions
  outputFileTracingIncludes: {
    '**': ['_data/**'],
  },

  // URL nesting: matchdays and players moved under /campionato.
  // Permanent redirects keep old bookmarks/external links working.
  async redirects() {
    return [
      { source: '/matchdays',           destination: '/campionato/giornate',         permanent: true },
      { source: '/matchdays/:path*',    destination: '/campionato/giornate/:path*',  permanent: true },
      { source: '/players',             destination: '/campionato/giocatori',        permanent: true },
      { source: '/players/:path*',      destination: '/campionato/giocatori/:path*', permanent: true },
    ]
  },
}

export default nextConfig
