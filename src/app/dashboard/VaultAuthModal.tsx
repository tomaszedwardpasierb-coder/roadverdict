// Place at: src/app/dashboard/VaultAuthModal.tsx
//
// The Vault's step-up re-authentication prompt, shown whenever
// GET /api/vault/status reports locked (on tab open, after the client's
// own 10-minute inactivity timer fires, or when a Vault API call comes
// back 401). No click-outside-to-close, unlike most modals in this
// app - there's nothing to reveal behind it until it's actually
// unlocked, so dismissing it early has no purpose.
'use client';

import { useState } from 'react';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './dashboard.module.css';

export interface VaultPreviousAccess {
  at: string;
  browser: string;
  country: string | null;
}

interface Props {
  vehicleKind: 'bike' | 'car';
  onUnlocked: (previousAccess: VaultPreviousAccess | null) => void;
}

export function VaultAuthModal({ vehicleKind, onUnlocked }: Props) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/vault/reauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Please try again.');
        return;
      }
      onUnlocked(data.previousAccess ?? null);
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="vault-auth-title" className={styles.reviewQueueOverlay}>
      <div className={styles.reviewQueueModal} style={{ maxWidth: '420px' }}>
        <h2 id="vault-auth-title" style={{ marginTop: 0 }}>Confirm it&apos;s you</h2>
        <p className={styles.subtext}>Enter your authenticator code to open the Vault.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="vault-auth-code">6-digit code or backup code</label>
            <input
              id="vault-auth-code"
              type="text"
              inputMode="numeric"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{ width: '100%', maxWidth: '220px', padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '4px' }}
            />
          </div>
          {error && (
            <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>
              {error}
            </p>
          )}
          <div style={{ marginTop: '1.2rem' }}>
            <button type="submit" className="submit-button" disabled={submitting || !code.trim()}>
              {submitting && <VehicleSpinner kind={vehicleKind} size={20} />}
              {submitting ? 'Confirming…' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
