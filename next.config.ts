import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Strict mode for React 19
  reactStrictMode: true,

  experimental: {
    // Use React 19 server actions with typed forms
    typedRoutes: true,
  },
}

export default nextConfig
