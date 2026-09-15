import type { MetadataRoute } from 'next';

/** Lets a phone or desktop browser add Shelvarr to the home screen with its own icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Shelvarr',
    short_name: 'Shelvarr',
    description: 'Self-hosted book and comic metadata management',
    start_url: '/',
    display: 'standalone',
    background_color: '#1a1d23',
    theme_color: '#1a1d23',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
