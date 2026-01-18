/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone output for Docker
  output: 'standalone',

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
        hostname: 'comicvine.gamespot.com',
      },
    ],
  },
};

export default nextConfig;
