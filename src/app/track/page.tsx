// Place at: src/app/track/page.tsx
//
// This page's content moved to the site root (/) - see src/app/page.tsx.
// Kept as a permanent redirect rather than deleted outright, so any
// existing bookmarks, backlinks, or already-indexed search results for
// /track still land somewhere real instead of 404ing.
import { permanentRedirect } from 'next/navigation';

export default function TrackRedirect() {
  permanentRedirect('/');
}
