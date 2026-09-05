// Place at: src/app/dashboard/TwoFactorSettings.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './dashboard.module.css';

type Phase = 'idle' | 'qr' | 'confirm' | 'backupCodes' | 'disableConfirm';

export function TwoFactorSettings({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [phase, setPhase] = useState<Phase>('idle');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [manualEntryKey, setManualEntryKey] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/totp/enroll/start', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong. Try again.');
        return;
      }
      setQrDataUrl(data.qrDataUrl);
      setManualEntryKey(data.manualEntryKey);
      setPhase('qr');
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/totp/enroll/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong. Try again.');
        return;
      }
      setBackupCodes(data.backupCodes);
      setEnabled(true);
      setCode('');
      setPhase('backupCodes');
      router.refresh();
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/totp/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong. Try again.');
        return;
      }
      setEnabled(false);
      setCode('');
      setPhase('idle');
      router.refresh();
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function cancel() {
    setPhase('idle');
    setCode('');
    setError(null);
  }

  if (phase === 'backupCodes' && backupCodes) {
    return (
      <div className="ticket">
        <div className="ticket__section">
          <span className="ticket__label">Save your backup codes</span>
          <p className={styles.subtext}>
            Two-factor authentication is now on. Each of these codes works once, and lets you sign in (or turn
            two-factor off) if you ever lose access to your authenticator app. Save them somewhere safe - they
            won&apos;t be shown again.
          </p>
          <div style={{ fontFamily: 'monospace', fontSize: '0.95rem', lineHeight: 1.8, background: 'var(--stone, #f0efe9)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
            {backupCodes.map((c) => (
              <div key={c}>{c}</div>
            ))}
          </div>
        </div>
        <hr className="ticket__divider" />
        <div className="ticket__section">
          <button type="button" className="submit-button" onClick={() => setPhase('idle')}>
            I&apos;ve saved these codes
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'qr' || phase === 'confirm') {
    return (
      <form className="ticket" onSubmit={handleConfirm}>
        <div className="ticket__section">
          <span className="ticket__label">Set up two-factor authentication</span>
          <p className={styles.subtext}>
            Scan this with an authenticator app - Google Authenticator, Microsoft Authenticator, Authy, or a
            password manager like 1Password or Bitwarden that supports authenticator codes. On iPhone, the
            built-in Passwords app (Settings → Passwords → set up verification code) works too, no extra app
            needed.
          </p>
          {qrDataUrl && <img src={qrDataUrl} alt="Scan with your authenticator app" width={150} height={150} />}
          {manualEntryKey && (
            <p className="field-note">
              Can&apos;t scan it? Enter this code manually: <code>{manualEntryKey}</code>
            </p>
          )}
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="totp-enroll-code">Enter the 6-digit code it shows</label>
            <input
              id="totp-enroll-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              required
            />
          </div>
        </div>
        <hr className="ticket__divider" />
        <div className="ticket__section">
          <button className="submit-button" type="submit" disabled={submitting || !code.trim()}>
            {submitting ? 'Verifying…' : 'Turn on'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={cancel} disabled={submitting} style={{ marginLeft: '0.5rem' }}>
            Cancel
          </button>
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      </form>
    );
  }

  if (phase === 'disableConfirm') {
    return (
      <form className="ticket" onSubmit={handleDisable}>
        <div className="ticket__section">
          <span className="ticket__label">Turn off two-factor authentication</span>
          <p className={styles.subtext}>Enter your current code, or one of your backup codes, to confirm.</p>
          <div className="field">
            <label htmlFor="totp-disable-code">Code</label>
            <input
              id="totp-disable-code"
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              required
            />
          </div>
        </div>
        <hr className="ticket__divider" />
        <div className="ticket__section">
          <button className="submit-button" type="submit" disabled={submitting || !code.trim()}>
            {submitting ? 'Turning off…' : 'Turn off'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={cancel} disabled={submitting} style={{ marginLeft: '0.5rem' }}>
            Cancel
          </button>
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      </form>
    );
  }

  return (
    <div className="ticket">
      <div className="ticket__section">
        <span className="ticket__label">Two-factor authentication</span>
        <p className={styles.subtext}>
          {enabled
            ? 'On - signing in needs a code from your authenticator app as well as your email link.'
            : 'Off - adds a second step to signing in, so a compromised email inbox alone can’t get into your account.'}
        </p>
        {error && <p className="error-text" role="alert">{error}</p>}
        {enabled ? (
          <button type="button" className="submit-button" onClick={() => setPhase('disableConfirm')}>
            Turn off
          </button>
        ) : (
          <button type="button" className="submit-button" onClick={handleStart} disabled={submitting}>
            {submitting ? 'Starting…' : 'Set up two-factor authentication'}
          </button>
        )}
      </div>
    </div>
  );
}
