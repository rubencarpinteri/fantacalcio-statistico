import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Strict mode for React 19
  reactStrictMode: true,

  typedRoutes: true,

  // Bundle _data folder so CSV files are accessible in Vercel serverless functions
  outputFileTracingIncludes: {
    '**': ['_data/**'],
  },
}

export default nextConfig
