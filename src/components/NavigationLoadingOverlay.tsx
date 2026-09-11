// Place at: src/components/NavigationLoadingOverlay.tsx
//
// Mounted once in the root layout - covers the OTHER kind of wait this
// app has, alongside every button's own loading state (see
// VehicleSpinner.tsx): a click that navigates to a page which is itself
// doing the slow work while it renders (VDG/Gemini calls on the Buyer
// Verdict Report, Story So Far, the Buying Guide's lookup pages, etc.),
// with no button-local boolean to hook into at all - the "loading" is
// the page load itself.
//
// Detects navigation START via a capturing click listener on same-origin
// links (Link renders as a real <a>, so this needs no Next.js-specific
// hook), and navigation END via usePathname() changing once the new
// route has rendered. Deliberately NOT useSearchParams() as well - that
// hook forces a Suspense boundary around whatever reads it, and this
// component is mounted once in the root layout, wrapping every page in
// the app; opting every single route into that just to also catch a
// pure-query-string navigation (rare, and lower stakes than a pathname
// change) isn't worth it. A timeout safety net clears the overlay
// regardless, in case a click turns out not to actually navigate (e.g.
// the destination throws before changing the URL) - this must never get
// stuck showing forever.
'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useActiveSection } from './ActiveSectionContext';
import { VehicleSpinner } from './VehicleSpinner';
import styles from './NavigationLoadingOverlay.module.css';

// Generous, but not indefinite - the slowest of these pages (Buyer
// Verdict Report/Story So Far, chaining several VDG + Gemini calls) can
// genuinely take a few real seconds; this only exists to stop the
// overlay sticking around forever if detection itself goes wrong.
const SAFETY_TIMEOUT_MS = 12_000;

// Pages outside the dashboard have their own vehicle-specific URLs
// (unlike /dashboard, which is one URL for both) - used as a fallback
// theming signal when ActiveSectionContext's vehicleKind is null (i.e.
// not currently inside the dashboard at all).
function kindFromPath(path: string): 'bike' | 'car' | null {
  if (path.startsWith('/cars') || path.startsWith('/car-report')) return 'car';
  if (path.startsWith('/buying-guide') || path.startsWith('/report') || path.startsWith('/quote-checker') || path.startsWith('/cost-calculator')) return 'bike';
  return null;
}

export function NavigationLoadingOverlay() {
  const pathname = usePathname();
  const { vehicleKind: dashboardVehicleKind } = useActiveSection();
  const [isNavigating, setIsNavigating] = useState(false);
  const [kind, setKind] = useState<'bike' | 'car'>('bike');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Navigation END: the URL actually changed under us - whatever we were
  // waiting for has landed.
  useEffect(() => {
    setIsNavigating(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, [pathname]);

  // Navigation START.
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same page (including a pure hash/query change to itself) - no
      // real navigation about to happen, nothing to show a spinner for.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      setKind(dashboardVehicleKind ?? kindFromPath(url.pathname) ?? kindFromPath(window.location.pathname) ?? 'bike');
      setIsNavigating(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsNavigating(false), SAFETY_TIMEOUT_MS);
    }

    // Capturing phase - fires even if a component further down calls
    // stopPropagation on the bubble phase, which several button-in-link
    // patterns in this app do.
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [dashboardVehicleKind]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  if (!isNavigating) return null;

  return (
    // No role/aria-label here - VehicleSpinner already carries its own
    // role="status" + label, and nesting a second status region inside
    // it would just announce the same "Loading" twice.
    <div className={styles.overlay}>
      <div className={styles.card}>
        <VehicleSpinner kind={kind} size={48} label="Loading" decorative={false} />
      </div>
    </div>
  );
}
