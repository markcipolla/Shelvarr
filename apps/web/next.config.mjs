import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

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

// Read from the installed dependency so the About screen can't drift from
// what actually shipped.
function resolveFrameworkVersion() {
  try {
    return require('next/package.json').version;
  } catch {
    return '';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Use standalone output for Docker
  output: 'standalone',

  // Build-time injected values available in client + server bundles.
  env: {
    NEXT_PUBLIC_BUILD_VERSION: resolveBuildVersion(),
    NEXT_PUBLIC_FRAMEWORK_VERSION: resolveFrameworkVersion(),
  },

  // Transpile workspace packages
  transpilePackages: ['@shelvarr/types', '@shelvarr/db', '@shelvarr/services'],

  // External packages that shouldn't be bundled
  serverExternalPackages: ['better-sqlite3', 'node-unrar-js'],

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
