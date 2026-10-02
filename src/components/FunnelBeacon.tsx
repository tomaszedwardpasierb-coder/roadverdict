// Place at: src/components/FunnelBeacon.tsx
//
// Counts one visit to a sign-up funnel page (see lib/analytics/funnel.ts) -
// anonymous, no cookies, nothing stored on the device. On the home page it
// also adds the visit's source to the sign-in links (?src=), so the later
// steps can be counted by where the visitor came from without storing
// anything.
'use client';

import { useEffect } from 'react';
import { classifySource } from '@/lib/analytics/funnelSource';

export function FunnelBeacon({ step }: { step: 'home' | 'login' }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const source = classifySource({ utmSource: params.get('utm_source'), src: params.get('src'), referrer: document.referrer });
    const body = JSON.stringify({ step, source });
    try {
      if (!navigator.sendBeacon?.('/api/funnel', body)) {
        void fetch('/api/funnel', { method: 'POST', body, keepalive: true }).catch(() => {});
      }
    } catch {
      // Counting must never get in the visitor's way.
    }
    if (step === 'home') {
      document.querySelectorAll<HTMLAnchorElement>('a[href^="/login"]').forEach((a) => {
        const url = new URL(a.getAttribute('href') ?? '/login', window.location.origin);
        if (!url.searchParams.has('src')) url.searchParams.set('src', source);
        a.setAttribute('href', url.pathname + url.search);
      });
    }
  }, [step]);
  return null;
}
