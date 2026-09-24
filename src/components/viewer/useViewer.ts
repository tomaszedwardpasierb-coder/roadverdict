// Place at: src/components/viewer/useViewer.ts
'use client';

import { useEffect, useState } from 'react';
import { ANONYMOUS_VIEWER, AUTH_MARKER_COOKIE, type ViewerInfo } from '@/lib/viewer';

// Several components on one page (a form plus a few CTA links) all call
// this on mount - one shared in-flight request between them, dropped after
// a few seconds so a sign-in/sign-out never serves a stale answer.
const SHARE_WINDOW_MS = 5000;
let shared: { promise: Promise<ViewerInfo>; at: number } | null = null;

function hasAuthMarker(): boolean {
  try {
    return document.cookie.split('; ').some((c) => c === `${AUTH_MARKER_COOKIE}=1`);
  } catch {
    return false;
  }
}

function fetchViewer(): Promise<ViewerInfo> {
  const now = Date.now();
  if (shared && now - shared.at < SHARE_WINDOW_MS) return shared.promise;
  const promise = fetch('/api/viewer', { cache: 'no-store' })
    .then((res) => (res.ok ? (res.json() as Promise<ViewerInfo>) : ANONYMOUS_VIEWER))
    .catch(() => ANONYMOUS_VIEWER);
  shared = { promise, at: now };
  return promise;
}

// Always starts anonymous - the same thing the static HTML was built
// with, so hydration never mismatches - and only upgrades to the real
// viewer if the auth marker cookie says a session exists. Anonymous
// visitors (the whole of a traffic spike) never make a request.
export function useViewer(): ViewerInfo {
  const [viewer, setViewer] = useState<ViewerInfo>(ANONYMOUS_VIEWER);

  useEffect(() => {
    if (!hasAuthMarker()) return;
    let cancelled = false;
    fetchViewer().then((v) => {
      if (!cancelled) setViewer(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return viewer;
}
