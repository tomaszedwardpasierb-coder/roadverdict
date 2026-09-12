// Place at: src/app/dashboard/TwoFactorGate.tsx
//
// Sits inside ProGate (Pro check outermost, this innermost) for any
// feature that also needs 2FA enrollment specifically - today, only the
// Vault. Deliberately does not offer to enroll from here: 2FA enrollment
// stays a Settings-tab-only flow (src/app/dashboard/TwoFactorSettings.tsx),
// so there's exactly one place in the app that ever starts it. "Go to
// Settings" is a real navigation (?tab=security), not an in-SPA tab
// switch, since this tree is server-rendered in page.tsx and has no
// callback wired back into DashboardShell's own tab state (DashboardShell
// itself now re-syncs its active tab when initialSection changes on an
// already-mounted instance - see that file's own comment).
//
// Uses a button + useTransition/router.push, not a plain <Link>, so this
// gets the same local loading spinner every other async action in the app
// already has - NavigationLoadingOverlay's own pathname-based end-detection
// doesn't reliably clear for a same-page, query-only navigation like this
// one (see that file's header comment on why it deliberately doesn't track
// useSearchParams()), so this can't just rely on the global overlay.
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveSection } from '@/components/ActiveSectionContext';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './dashboard.module.css';

interface Props {
  twoFactorEnabled: boolean;
  children: React.ReactNode;
}

export function TwoFactorGate({ twoFactorEnabled, children }: Props) {
  const router = useRouter();
  const { vehicleKind } = useActiveSection();
  const [isPending, startTransition] = useTransition();

  if (twoFactorEnabled) return <>{children}</>;

  function handleGoToSettings() {
    startTransition(() => {
      router.push('/dashboard?tab=security');
    });
  }

  return (
    <div className={styles.proGate}>
      <div className={styles.proGateBadge}>2FA required</div>
      <h3 className={styles.proGateTitle}>The Vault requires two-factor authentication</h3>
      <p className={styles.proGateDesc}>Enable 2FA in Settings to unlock secure document storage.</p>
      <button type="button" className="submit-button" onClick={handleGoToSettings} disabled={isPending}>
        {isPending && <VehicleSpinner kind={vehicleKind ?? 'bike'} size={20} />}
        {isPending ? 'Opening Settings…' : 'Go to Settings'}
      </button>
    </div>
  );
}
