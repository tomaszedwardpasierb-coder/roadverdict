'use client';

// Cloudflare Web Analytics: cookieless, no personal data, so no consent
// banner - it counts visits, pages, where visitors came from and their
// device type. The token is public by design (it's in every visitor's
// page source).
//
// Left off private-token pages and the admin panel - see
// lib/webAnalytics.ts. Nothing on the public site links into any of
// those, so a visit to one always starts as a fresh page load, which is
// when this decides.
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { isAnalyticsExcluded } from '@/lib/webAnalytics';

const CLOUDFLARE_BEACON_TOKEN = '779a3bd9da2e400ab4ccccdce95ee027';

export function WebAnalytics() {
  const pathname = usePathname();
  // Decided once, on the page the visit started on - see the comment above.
  const [enabled] = useState(() => !isAnalyticsExcluded(pathname ?? '/'));
  if (!enabled) return null;
  return (
    <Script
      src="https://static.cloudflareinsights.com/beacon.min.js"
      strategy="afterInteractive"
      data-cf-beacon={JSON.stringify({ token: CLOUDFLARE_BEACON_TOKEN })}
    />
  );
}
