// Place at: src/components/PlayStoreLink.tsx
'use client';
//
// One quiet line pointing to the Android app on Google Play - never a
// banner. Hidden on iPhones and iPads, which have no RoadVerdict app yet,
// so they're not sent to a store they can't use. Decided in the browser
// after load (pages are cached and served the same to everyone), so it
// renders nothing on the server and on the first paint.
import { useEffect, useState } from 'react';
import { playStoreUrl } from '@/lib/playStore';

export function isAppleMobile(userAgent: string, maxTouchPoints = 0): boolean {
  // iPadOS reports itself as a Mac, but with a touch screen.
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export function PlayStoreLink({ campaign, lead, label, className }: { campaign: string; lead?: string; label: string; className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(!isAppleMobile(navigator.userAgent, navigator.maxTouchPoints));
  }, []);
  if (!show) return null;
  return (
    <p className={className}>
      {lead ? `${lead} ` : null}
      <a href={playStoreUrl('website', campaign)} rel="noopener">
        {label}
      </a>
    </p>
  );
}
