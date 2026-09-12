// Place at: src/app/dashboard/TwoFactorGate.tsx
//
// Sits inside ProGate (Pro check outermost, this innermost) for any
// feature that also needs 2FA enrollment specifically - today, only the
// Vault. Deliberately does not offer to enroll from here: 2FA enrollment
// stays a Settings-tab-only flow (src/app/dashboard/TwoFactorSettings.tsx),
// so there's exactly one place in the app that ever starts it. "Go to
// Settings" is a real navigation (?tab=security), not an in-SPA tab
// switch, since this tree is server-rendered in page.tsx and has no
// callback wired back into DashboardShell's own tab state.
'use client';

import Link from 'next/link';
import styles from './dashboard.module.css';

interface Props {
  twoFactorEnabled: boolean;
  children: React.ReactNode;
}

export function TwoFactorGate({ twoFactorEnabled, children }: Props) {
  if (twoFactorEnabled) return <>{children}</>;

  return (
    <div className={styles.proGate}>
      <div className={styles.proGateBadge}>2FA required</div>
      <h3 className={styles.proGateTitle}>The Vault requires two-factor authentication</h3>
      <p className={styles.proGateDesc}>Enable 2FA in Settings to unlock secure document storage.</p>
      <Link href="/dashboard?tab=security" className="submit-button" style={{ display: 'inline-block', textDecoration: 'none' }}>
        Go to Settings
      </Link>
    </div>
  );
}
