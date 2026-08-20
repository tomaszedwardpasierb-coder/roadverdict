// Place at: src/app/garage/BikeCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './garage.module.css';

type RegistrationChangeReason = 'private-plate-assigned' | 'private-plate-removed' | 'correction' | 'other';

const REASON_OPTIONS: { value: RegistrationChangeReason; label: string }[] = [
  { value: 'private-plate-assigned', label: 'Private plate assigned' },
  { value: 'private-plate-removed', label: 'Private plate removed (reverted)' },
  { value: 'correction', label: 'Correcting an entry error' },
  { value: 'other', label: 'Other' },
];

interface Props {
  bikeId: string;
  name: string;
  year?: number;
  isCustomBuild?: boolean;
  currentMileage: number;
  isActive: boolean;
  currentRegistration?: string;
  registrationChangeCount: number;
  transferredToEmail?: string;
}

export function BikeCard({ bikeId, name, year, isCustomBuild, currentMileage, isActive, currentRegistration, registrationChangeCount, transferredToEmail }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [newPlate, setNewPlate] = useState('');
  const [reason, setReason] = useState<RegistrationChangeReason>('private-plate-assigned');
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState<string | null>(null);

  async function handleViewDashboard() {
    if (isActive) {
      router.push('/dashboard');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/tracker/active-bike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bikeId }),
      });
      if (res.ok) {
        router.push('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${name}"? This permanently deletes this bike AND every service, fuel, mods, bills, and reminder entry logged against it. This cannot be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/tracker/bike/${encodeURIComponent(bikeId)}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? 'Could not delete this bike. Try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleChangeRegistration(e: React.FormEvent) {
    e.preventDefault();
    if (!newPlate.trim()) return;
    if (!confirm(`Record "${newPlate.trim().toUpperCase()}" as this bike's new registration? The old one stays on permanent record - this can't be undone or edited afterward.`)) {
      return;
    }
    setChanging(true);
    setChangeError(null);
    try {
      const res = await fetch('/api/tracker/bike/registration-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bikeId, plate: newPlate, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChangeError(data.error ?? 'Something went wrong.');
        return;
      }
      setShowChangeForm(false);
      setNewPlate('');
      router.refresh();
    } catch {
      setChangeError('Could not reach the server.');
    } finally {
      setChanging(false);
    }
  }

  return (
    <div className={styles.card}>
      {isActive && <div className={styles.activeBadge}>Currently viewing</div>}
      {transferredToEmail && (
        <div className={styles.readOnlyBadge}>Read-only - transferred to {transferredToEmail}</div>
      )}
      <div className={styles.cardName}>{name}</div>
      <div className={styles.cardMeta}>
        {isCustomBuild ? 'Custom build' : year} · {currentMileage.toLocaleString()} miles
      </div>
      {currentRegistration && (
        <div className={styles.cardRegistration}>
          {currentRegistration}
          {registrationChangeCount > 0 && <span className={styles.cardRegistrationNote}> ({registrationChangeCount} change{registrationChangeCount === 1 ? '' : 's'} on record)</span>}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="submit-button" onClick={handleViewDashboard} disabled={loading || deleting}>
          {loading ? 'Switching…' : 'View dashboard'}
        </button>
        {/* Change registration and Delete both reject a read-only bike
            server-side unconditionally, so there's no point showing
            either here - it would just fail with no clear reason why,
            which is very likely what actually happened before this. */}
        {!transferredToEmail && currentRegistration && (
          <button type="button" className={styles.deleteBtn} onClick={() => setShowChangeForm((s) => !s)} disabled={loading || deleting}>
            {showChangeForm ? 'Cancel' : 'Change registration'}
          </button>
        )}
        {!transferredToEmail && (
          <button type="button" className={styles.deleteBtn} onClick={handleDelete} disabled={loading || deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
      {deleteError && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{deleteError}</p>}

      {showChangeForm && (
        <form onSubmit={handleChangeRegistration} className={styles.registrationChangeForm}>
          <p className="field-note">
            The current registration stays on permanent record - this adds a new one, it doesn&apos;t remove the old.
          </p>
          <div className="field" style={{ marginTop: '0.6rem' }}>
            <label htmlFor={`new-plate-${bikeId}`}>New registration</label>
            <input
              id={`new-plate-${bikeId}`}
              type="text"
              value={newPlate}
              onChange={(e) => setNewPlate(e.target.value)}
              style={{ textTransform: 'uppercase' }}
              required
            />
          </div>
          <div className="field" style={{ marginTop: '0.6rem' }}>
            <label htmlFor={`reason-${bikeId}`}>Reason</label>
            <select id={`reason-${bikeId}`} value={reason} onChange={(e) => setReason(e.target.value as RegistrationChangeReason)}>
              {REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="submit-button" disabled={changing} style={{ marginTop: '0.7rem', width: 'auto' }}>
            {changing ? 'Saving…' : 'Record change'}
          </button>
          {changeError && <p className="error-text" role="alert">{changeError}</p>}
        </form>
      )}
    </div>
  );
}
