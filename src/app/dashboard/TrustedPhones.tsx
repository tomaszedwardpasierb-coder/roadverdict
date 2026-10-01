// Place at: src/app/dashboard/TrustedPhones.tsx
'use client';

// Phones trusted to open the Vault with a fingerprint, face or phone PIN
// (set up in the Android app) - listed here so a lost or sold phone can be
// cut off from a computer. Shows nothing until a phone has been trusted.
import { useEffect, useState } from 'react';
import styles from './dashboard.module.css';

type TrustedPhone = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function TrustedPhones() {
  const [phones, setPhones] = useState<TrustedPhone[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch('/api/account/trusted-devices', { cache: 'no-store' });
      if (res.ok) setPhones(((await res.json()) as { devices: TrustedPhone[] }).devices);
    } catch {
      // Not worth an error on the Settings page - the list just doesn't show.
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(phone: TrustedPhone) {
    if (!confirm(`Stop "${phone.name}" using a fingerprint or PIN for the Vault and sign-in? It will need an authenticator code instead.`)) return;
    setRemoving(phone.id);
    setError(null);
    try {
      const res = await fetch(`/api/account/trusted-devices/${encodeURIComponent(phone.id)}`, { method: 'DELETE' });
      if (!res.ok) setError('That phone couldn’t be removed. Try again.');
      await load();
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setRemoving(null);
    }
  }

  if (!phones || phones.length === 0) return null;

  return (
    <div style={{ marginTop: '1.2rem' }}>
      <h3 className={styles.chartCardTitle}>Trusted phones</h3>
      <p className={styles.subtext} style={{ marginBottom: '0.6rem' }}>
        These phones open the Vault and confirm app sign-ins with a fingerprint, face or phone PIN instead of an authenticator code. Remove one you’ve lost or sold.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {phones.map((phone) => (
          <li key={phone.id} className={styles.card} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span>
              <strong>{phone.name}</strong>
              <br />
              <span className={styles.subtext}>
                Trusted {day(phone.createdAt)}
                {phone.lastUsedAt ? ` · last used ${day(phone.lastUsedAt)}` : ''}
              </span>
            </span>
            <button type="button" className={styles.iconBtn} onClick={() => remove(phone)} disabled={removing === phone.id}>
              {removing === phone.id ? 'Removing…' : 'Remove'}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
