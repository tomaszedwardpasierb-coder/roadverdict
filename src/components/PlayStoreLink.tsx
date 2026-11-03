// Place at: src/components/PlayStoreLink.tsx
'use client';
//
// One quiet line pointing to the Android app on Google Play - never a
// banner. Hidden on iPhones and iPads, which have no RoadVerdict app yet,
// so they're not sent to a store they can't use. Decided in the browser
// after load (pages are cached and served the same to everyone), so it
// renders nothing on the server and on the first paint.
//
// The badge is Google's own "Get it on Google Play" artwork, unmodified -
// Google's brand rules ask developers to link to Play with the badge, not
// the bare Play logo (developer.android.com/distribute/marketing-tools/
// brand-guidelines). The file includes the clear space Google requires
// around it; the footer carries the trademark line.
import { useEffect, useState } from 'react';
import { playStoreUrl } from '@/lib/playStore';

export const PLAY_BADGE_SRC = '/images/google-play-badge.png';

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
    <p className={className ? `play-store-link ${className}` : 'play-store-link'}>
      {lead ? `${lead} ` : null}
      <a href={playStoreUrl('website', campaign)} rel="noopener">
        <span>{label}</span>
        {/* eslint-disable-next-line @next/next/no-img-element -- a 5 KB badge, served as is */}
        <img src={PLAY_BADGE_SRC} alt="Get it on Google Play" width={145} height={56} className="play-store-link__badge" />
      </a>
    </p>
  );
}
