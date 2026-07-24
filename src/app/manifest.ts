// Place at: src/app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RoadVerdict - Motorcycle Cost Tracker',
    short_name: 'RoadVerdict',
    description: 'Track your motorcycle running costs and check if a service quote is fair, benchmarked against real UK prices.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#e4e2dd',
    theme_color: '#e8a33d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
