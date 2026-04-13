/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone output for Docker
  output: 'standalone',

  // Transpile workspace packages
  transpilePackages: ['@shelvarr/types', '@shelvarr/db', '@shelvarr/services'],

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
  // Proxy Komga-compatible API to the Hono server
  async rewrites() {
    const serverUrl = process.env['SHELVARR_SERVER_URL'] || 'http://localhost:3001';
    return [
      {
        source: '/api/v1/:path*',
        destination: `${serverUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
