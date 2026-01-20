/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone output for Docker
  output: 'standalone',

  // Enable instrumentation for error tracking
  experimental: {
    instrumentationHook: true,
  },

  // External packages that shouldn't be bundled
  serverExternalPackages: ['better-sqlite3'],

  // Image domains for book covers
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'books.google.com',
      },
      {
        protocol: 'https',
        hostname: 'covers.openlibrary.org',
      },
      {
        protocol: 'https',
        hostname: 'hardcover.app',
      },
      {
        protocol: 'https',
        hostname: 'assets.hardcover.app',
      },
      {
        protocol: 'https',
        hostname: 'comicvine.gamespot.com',
      },
    ],
  },
};

export default nextConfig;
