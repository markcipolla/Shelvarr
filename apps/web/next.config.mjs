import { execSync } from 'node:child_process';

function resolveBuildVersion() {
  if (process.env.BUILD_VERSION) return process.env.BUILD_VERSION;
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone output for Docker
  output: 'standalone',

  // Build-time injected values available in client + server bundles.
  env: {
    NEXT_PUBLIC_BUILD_VERSION: resolveBuildVersion(),
  },

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
};

export default nextConfig;
