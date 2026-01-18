/** @type {import('next').NextConfig} */
const nextConfig = {
  // Security: Disable powered by header
  poweredByHeader: false,
  
  // Security: Compress responses
  compress: true,

  // Security: Add headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Prevent MIME type sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Clickjacking protection
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // XSS protection
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          // Referrer policy
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Don't leak server info
          { key: 'Server', value: 'Web Server' },
          // HSTS (only if HTTPS is enforced in production)
          // { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ]
  },

  // Security: Disable source maps in production
  productionBrowserSourceMaps: false,
}

module.exports = nextConfig
