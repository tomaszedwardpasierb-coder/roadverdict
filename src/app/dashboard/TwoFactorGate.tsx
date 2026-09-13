// Place at: src/app/dashboard/TwoFactorGate.tsx
//
// Sits inside ProGate (Pro check outermost, this innermost) for any
// feature that also needs 2FA enrollment specifically - today, only the
// Vault. Deliberately does not offer to enroll from here: 2FA enrollment
// stays a Settings-tab-only flow (src/app/dashboard/TwoFactorSettings.tsx),
// so there's exactly one place in the app that ever starts it.
//
// "Go to Settings" uses a real, full navigation (window.location.href),
// not next/navigation's router.push(). router.push() was tried first: it
// updates the URL but doesn't reliably re-invoke dashboard/page.tsx's
// Server Component for a search-param-only change to the same route (the
// visible tab stayed on Vault; only a real page load actually picked up
// the new `tab=security` searchParams and DashboardShell's initialSection
// re-sync effect) - a known App Router soft-navigation gap, not something
// worth fighting with router.refresh()/cache-busting workarounds for an
// action this rare. A full reload costs a moment longer but is guaranteed
// correct, matching the manual-refresh behavior that already worked.
'use client';

import { useState } from 'react';
import { useActiveSection } from '@/components/ActiveSectionContext';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './dashboard.module.css';

interface Props {
  twoFactorEnabled: boolean;
  children: React.ReactNode;
}

export function TwoFactorGate({ twoFactorEnabled, children }: Props) {
  const { vehicleKind } = useActiveSection();
  const [navigating, setNavigating] = useState(false);

  if (twoFactorEnabled) return <>{children}</>;

  function handleGoToSettings() {
    setNavigating(true);
    window.location.href = '/dashboard?tab=security';
  }

  return (
    <div className={styles.proGate}>
      <div className={styles.proGateBadge}>2FA required</div>
      <h3 className={styles.proGateTitle}>The Vault requires two-factor authentication</h3>
      <p className={styles.proGateDesc}>Enable 2FA in Settings to unlock secure document storage.</p>
      <button type="button" className="submit-button" onClick={handleGoToSettings} disabled={navigating}>
        {navigating && <VehicleSpinner kind={vehicleKind ?? 'bike'} size={20} />}
        {navigating ? 'Opening Settings…' : 'Go to Settings'}
      </button>
    </div>
  );
}
