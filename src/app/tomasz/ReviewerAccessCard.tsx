// Place at: src/app/tomasz/ReviewerAccessCard.tsx
//
// The switch for app store reviewers' sign-in (lib/auth/reviewerAccess.ts):
// on with a fresh code, shown once to paste into Play Console and App Store
// Connect, or off.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function ReviewerAccessCard({ enabledAt, demoBlocked }: { enabledAt: string | null; demoBlocked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function call(method: 'POST' | 'DELETE') {
    if (method === 'POST' && enabledAt && !window.confirm('Make a new code? The current one stops working, so update it in Play Console and App Store Connect too.')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/tomasz/reviewer-access', { method });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'That didn’t work - try again.');
      } else {
        setCode(method === 'POST' ? data.code : null);
        router.refresh();
      }
    } catch {
      setError('Couldn’t reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>App store reviewers</div>
      <p className={styles.note}>
        Lets Google and Apple sign in to the app as <strong>demo@roadverdict.co.uk</strong> with a fixed 6-digit code. Only
        that address, only in the app, only while it&apos;s on.
      </p>
      <p className={styles.note}>{enabledAt ? `On since ${fmt(enabledAt)}.` : 'Off.'}</p>
      {demoBlocked && (
        <p className={styles.warnNote}>The demo account is blocked in All accounts - unblock it, or reviewers can&apos;t get in.</p>
      )}
      {code && (
        <p className={styles.note}>
          Code: <strong style={{ fontSize: '1.3rem', letterSpacing: '0.15em' }}>{code}</strong> - shown this once. Paste it into
          Play Console (App access) and App Store Connect (App Review Information) with the email above.
        </p>
      )}
      {error && <p className={styles.warnNote}>{error}</p>}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
        <button type="button" className={styles.button} onClick={() => call('POST')} disabled={busy}>
          {enabledAt ? 'New code' : 'Turn on'}
        </button>
        {enabledAt && (
          <button type="button" className={styles.button} onClick={() => call('DELETE')} disabled={busy}>
            Turn off
          </button>
        )}
      </div>
    </div>
  );
}
