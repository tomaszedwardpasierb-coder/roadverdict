// Place at: src/app/dashboard/VaultTab.tsx
//
// The Vault's real content, mounted inside ProGate + TwoFactorGate for
// both a bike-active and a car-active dashboard session (vehicleKind/
// vehicleId are plain props, not context - this component is genuinely
// vehicle-agnostic, same convention MileageConflictModal/BudgetWidget
// already use, so there's no separate CarVaultTab file). Handles its own
// locked/unlocked state: every real Vault API call independently
// enforces the server-side session, so a 401 with error "vault_locked"
// anywhere below just flips back to the locked view rather than being
// treated as a generic failure.
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { VaultAuthModal, type VaultPreviousAccess } from './VaultAuthModal';
import { VAULT_CATEGORIES, type VaultDocumentCategory } from '@/lib/tracker/vaultDocument';
import styles from './dashboard.module.css';

interface VaultDocumentSummary {
  id: string;
  fileName: string;
  fileType: 'application/pdf' | 'image/jpeg' | 'image/png';
  fileSize: number;
  category: VaultDocumentCategory;
  label?: string;
  uploadedAt: string;
}

interface Props {
  vehicleKind: 'bike' | 'car';
  vehicleId: string;
}

// The spec's own auto-lock window - kept in sync with
// VAULT_SESSION_MAX_AGE_SECONDS server-side (see vaultSession.ts). This
// client-side timer is a visible convenience only, never the real
// enforcement point - see that file's own comment for why.
const AUTO_LOCK_MS = 10 * 60 * 1000;
const AUTO_LOCK_CHECK_INTERVAL_MS = 15_000;

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function categoryLabel(category: VaultDocumentCategory): string {
  return VAULT_CATEGORIES.find((c) => c.key === category)?.label ?? category;
}

function isLockedResponse(status: number, data: unknown): boolean {
  return status === 401 && (data as { error?: string } | null)?.error === 'vault_locked';
}

export function VaultTab({ vehicleKind, vehicleId }: Props) {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [documents, setDocuments] = useState<VaultDocumentSummary[] | null>(null);
  const [previousAccess, setPreviousAccess] = useState<VaultPreviousAccess | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [category, setCategory] = useState<VaultDocumentCategory | ''>('');
  const [label, setLabel] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const lastInteraction = useRef(Date.now());
  const markActive = useCallback(() => {
    lastInteraction.current = Date.now();
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/vault/documents?vehicleKind=${vehicleKind}&vehicleId=${vehicleId}`);
      const data = await res.json();
      if (!res.ok) {
        if (isLockedResponse(res.status, data)) {
          setUnlocked(false);
          return;
        }
        setListError(data.error ?? 'Could not load the Vault.');
        return;
      }
      setDocuments(data.documents);
    } catch {
      setListError('Could not reach RoadVerdict. Check your connection and try again.');
    }
  }, [vehicleKind, vehicleId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/vault/status');
        const data = await res.json();
        if (cancelled) return;
        setUnlocked(!!data.unlocked);
        if (data.unlocked) await loadDocuments();
      } catch {
        if (!cancelled) setUnlocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDocuments]);

  useEffect(() => {
    if (!unlocked) return;
    const interval = setInterval(() => {
      if (Date.now() - lastInteraction.current > AUTO_LOCK_MS) setUnlocked(false);
    }, AUTO_LOCK_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [unlocked]);

  function handleUnlocked(previous: VaultPreviousAccess | null) {
    markActive();
    setPreviousAccess(previous);
    setUnlocked(true);
    loadDocuments();
  }

  async function handleLockNow() {
    markActive();
    setUnlocked(false);
    try {
      await fetch('/api/vault/lock', { method: 'POST' });
    } catch {
      // The client-side lock already took effect regardless - a failed
      // server-side clear just means this session expires on its own
      // schedule instead of immediately, never a stuck "still unlocked" state.
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    markActive();
    if (!file || !category) return;
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('vehicleKind', vehicleKind);
      fd.set('vehicleId', vehicleId);
      fd.set('category', category);
      if (label.trim()) fd.set('label', label.trim());
      const res = await fetch('/api/vault/documents', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        if (isLockedResponse(res.status, data)) {
          setUnlocked(false);
          return;
        }
        setUploadError(data.error ?? 'Upload failed. Please try again.');
        return;
      }
      setFile(null);
      setCategory('');
      setLabel('');
      await loadDocuments();
    } catch {
      setUploadError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    markActive();
    setDeletingId(id);
    try {
      const res = await fetch(`/api/vault/documents/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        if (isLockedResponse(res.status, data)) {
          setUnlocked(false);
          return;
        }
        setListError(data.error ?? 'Could not delete this document.');
        return;
      }
      await loadDocuments();
    } catch {
      setListError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setDeletingId(null);
    }
  }

  if (unlocked === null) {
    return (
      <div className={styles.subtext}>
        <VehicleSpinner kind={vehicleKind} size={18} /> Loading…
      </div>
    );
  }

  if (!unlocked) {
    return <VaultAuthModal vehicleKind={vehicleKind} onUnlocked={handleUnlocked} />;
  }

  return (
    <div onClick={markActive} onScroll={markActive}>
      <h2 style={{ marginTop: 0 }}>The Vault</h2>
      <p className={styles.subtext}>
        {documents && documents.length === 0
          ? `Your ${vehicleKind === 'bike' ? "bike's" : "car's"} documents, in one secure place. Only you can access this - protected by two-factor authentication and encrypted at rest. Add your V5C, insurance certificate, MOT, or anything else you'd hate to lose.`
          : 'Encrypted at rest. Only you can access this.'}
      </p>

      {listError && (
        <p className="error-text" role="alert">
          {listError}
        </p>
      )}

      {documents && documents.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0' }}>
          {documents.map((doc) => (
            <li key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div>{doc.label || doc.fileName}</div>
                <div className={styles.subtext}>
                  {categoryLabel(doc.category)} - {formatBytes(doc.fileSize)}
                </div>
              </div>
              <a href={`/api/vault/documents/${doc.id}/download`} className="submit-button" onClick={markActive} style={{ textDecoration: 'none' }}>
                Download
              </a>
              <button type="button" className={styles.iconBtn} disabled={deletingId === doc.id} onClick={() => handleDelete(doc.id)}>
                {deletingId === doc.id && <VehicleSpinner kind={vehicleKind} size={20} />}
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {documents && documents.length >= 20 && (
        <p className={styles.subtext}>This vehicle has reached the 20-document limit - delete one before adding another.</p>
      )}

      <form onSubmit={handleUpload} style={{ marginTop: '1rem' }}>
        <div className="field">
          <label htmlFor={`vault-category-${vehicleId}`}>Category</label>
          <select id={`vault-category-${vehicleId}`} value={category} onChange={(e) => setCategory(e.target.value as VaultDocumentCategory)}>
            <option value="">Choose a category…</option>
            {VAULT_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`vault-label-${vehicleId}`}>Label (optional)</label>
          <input id={`vault-label-${vehicleId}`} type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. V5C" />
        </div>
        <div className="field">
          <label htmlFor={`vault-file-${vehicleId}`}>File (PDF, JPG, or PNG - 10MB max)</label>
          <input
            id={`vault-file-${vehicleId}`}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {uploadError && (
          <p className="error-text" role="alert">
            {uploadError}
          </p>
        )}
        <button type="submit" className="submit-button" disabled={uploading || !file || !category}>
          {uploading && <VehicleSpinner kind={vehicleKind} size={20} />}
          {uploading ? 'Uploading…' : 'Add document'}
        </button>
      </form>

      <p className={styles.subtext} style={{ marginTop: '1.5rem' }}>
        {previousAccess
          ? `Vault last opened: ${new Date(previousAccess.at).toLocaleString('en-GB')} — ${previousAccess.browser}${previousAccess.country ? `, ${previousAccess.country}` : ''}`
          : 'This is the first time the Vault has been opened on this account.'}
      </p>
      <button type="button" className={styles.iconBtn} onClick={handleLockNow}>
        Lock the Vault now
      </button>
    </div>
  );
}
