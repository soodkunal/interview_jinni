import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // You might have other settings here

  // ADD THIS BLOCK
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
}

export default nextConfig