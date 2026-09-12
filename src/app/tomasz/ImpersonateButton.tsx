// Place at: src/app/tomasz/ImpersonateButton.tsx
//
// Was a bare window.confirm() - now a real step-up re-auth modal: the
// admin re-enters their password and a fresh TOTP code, and gives a
// reason, all re-verified server-side by the impersonate route itself
// (never trust this form's own client-side validation as the real
// gate - see that route's own comment).
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './adminShell.module.css';

export function ImpersonateButton({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeModal() {
    setOpen(false);
    setPassword('');
    setTotpCode('');
    setReason('');
    setError(null);
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, totpCode, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start impersonation.');
        return;
      }
      router.push('/dashboard');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }

  const canConfirm = password.trim().length > 0 && totpCode.trim().length > 0 && reason.trim().length > 0;

  return (
    <span>
      <button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={() => setOpen(true)}>
        Impersonate
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-labelledby="impersonate-title" className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h2 id="impersonate-title" style={{ marginTop: 0, fontSize: '0.95rem' }}>
              View the app as {email}?
            </h2>
            <p className={styles.note}>
              Confirm your own password and a fresh authenticator code, and give a reason - this
              is logged, and shown on the Impersonate sessions tab.
            </p>

            <div style={{ marginTop: '0.7rem' }}>
              <label htmlFor="impersonate-password" className={styles.note}>Your password</label>
              <input
                id="impersonate-password"
                type="password"
                className={styles.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ marginTop: '0.6rem' }}>
              <label htmlFor="impersonate-totp" className={styles.note}>Authenticator code</label>
              <input
                id="impersonate-totp"
                type="text"
                inputMode="numeric"
                className={styles.input}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
              />
            </div>
            <div style={{ marginTop: '0.6rem' }}>
              <label htmlFor="impersonate-reason" className={styles.note}>Reason</label>
              <input
                id="impersonate-reason"
                type="text"
                className={styles.input}
                placeholder="e.g. investigating a support ticket"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {error && <p style={{ color: 'var(--admin-danger)', fontSize: '0.78rem', marginTop: '0.6rem' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" className={styles.button} disabled={!canConfirm || loading} onClick={handleConfirm}>
                {loading && <VehicleSpinner size={20} />}
                {loading ? '…' : 'Confirm'}
              </button>
              <button type="button" className={`${styles.button} ${styles.buttonSecondary}`} onClick={closeModal} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
