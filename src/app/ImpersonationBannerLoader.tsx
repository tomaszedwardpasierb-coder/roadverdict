// Place at: src/app/ImpersonationBannerLoader.tsx
'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { IMPERSONATION_MARKER_COOKIE } from '@/lib/viewer';
import { ImpersonationBanner } from './ImpersonationBanner';

// Replaces the server-side cookies()/getAdminSession() read the root layout
// used to make on every request (which made every page in the app render
// per request). Only ever fetches if the rv_imp marker cookie says an
// impersonation cookie exists - which is nobody but the admin, so nobody
// else pays for this.
//
// The layout persists across client-side navigation, so this re-checks on
// every route change: starting impersonation and exiting it both navigate,
// and the marker cookie appears/disappears on that navigation's request.
export function ImpersonationBannerLoader() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const hasMarker = document.cookie.split('; ').some((c) => c === `${IMPERSONATION_MARKER_COOKIE}=1`);
    if (!hasMarker) {
      setEmail(null);
      return;
    }
    let cancelled = false;
    fetch('/api/admin/impersonation-status', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : { email: null }))
      .then((data: { email: string | null }) => {
        if (!cancelled) setEmail(data.email);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return email ? <ImpersonationBanner email={email} /> : null;
}
