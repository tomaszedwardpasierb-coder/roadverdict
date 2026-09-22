// Place at: src/components/AssistantProposedVaultDocumentCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VaultAuthModal, type VaultPreviousAccess } from '@/app/dashboard/VaultAuthModal';
import { VAULT_CATEGORIES, type VaultDocumentCategory } from '@/lib/tracker/vaultCategories';
import { fetchWithTimeout, FetchTimeoutError, UPLOAD_TIMEOUT_MS } from '@/lib/fetchWithTimeout';
import { VehicleSpinner } from './VehicleSpinner';
import styles from './AssistantProposedEntryCard.module.css';

export interface ProposedVaultDocument {
  category: 'vaultDocument';
  vehicleKind: 'bike' | 'car';
  vehicleId: string;
  vaultCategory: VaultDocumentCategory | '';
  label: string;
}

function isLockedResponse(status: number, data: unknown): boolean {
  return status === 401 && (data as { error?: string } | null)?.error === 'vault_locked';
}

// The model never sees or handles the file itself (see assistantTools.ts's
// own comment on proposeVaultDocument) - it's picked here, on the card,
// exactly like VaultTab.tsx's own upload form, and uploaded straight to
// /api/vault/documents (never through the chat's generic attachment
// endpoint - a different, dedicated blob container with its own
// Pro+2FA+session gate, see vaultAccess.ts). A locked Vault is handled
// inline with the same VaultAuthModal the Vault tab itself uses, since
// route.ts only ever checks Pro+2FA before offering this tool, never
// whether the Vault happens to be unlocked right now.
export function AssistantProposedVaultDocumentCard({ document: doc }: { document: ProposedVaultDocument }) {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [previousAccess, setPreviousAccess] = useState<VaultPreviousAccess | null>(null);
  const [category, setCategory] = useState<VaultDocumentCategory | ''>(doc.vaultCategory);
  const [label, setLabel] = useState(doc.label);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/vault/status');
        const data = await res.json();
        if (!cancelled) setUnlocked(!!data.unlocked);
      } catch {
        if (!cancelled) setUnlocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleUnlocked(previous: VaultPreviousAccess | null) {
    setPreviousAccess(previous);
    setUnlocked(true);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !category) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('vehicleKind', doc.vehicleKind);
      fd.set('vehicleId', doc.vehicleId);
      fd.set('category', category);
      if (label.trim()) fd.set('label', label.trim());
      const res = await fetchWithTimeout('/api/vault/documents', { method: 'POST', body: fd }, UPLOAD_TIMEOUT_MS);
      const data = await res.json();
      if (!res.ok) {
        if (isLockedResponse(res.status, data)) {
          setUnlocked(false);
          return;
        }
        setError(data.error ?? 'Upload failed. Please try again.');
        return;
      }
      setAdded(true);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof FetchTimeoutError
          ? 'Upload timed out - try again.'
          : 'Could not reach RoadVerdict. Check your connection and try again.'
      );
    } finally {
      setUploading(false);
    }
  }

  if (added) {
    const categoryLabel = VAULT_CATEGORIES.find((c) => c.key === category)?.label ?? category;
    return (
      <div className={styles.card}>
        <p className={styles.loggedNote}>✓ Added to Vault - {label.trim() || categoryLabel}</p>
      </div>
    );
  }

  if (unlocked === null) {
    return (
      <div className={styles.card}>
        <span className={styles.cardLabel}>Add to Vault</span>
        <p className={styles.mileageNote}>
          <VehicleSpinner kind={doc.vehicleKind} size={16} /> Checking the Vault…
        </p>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className={styles.card}>
        <span className={styles.cardLabel}>Add to Vault</span>
        <VaultAuthModal vehicleKind={doc.vehicleKind} onUnlocked={handleUnlocked} />
      </div>
    );
  }

  return (
    <form className={styles.card} onSubmit={handleUpload}>
      <span className={styles.cardLabel}>Add to Vault</span>
      {previousAccess === null && (
        <p className={styles.mileageNote}>Encrypted at rest. Only you can access this.</p>
      )}

      <div className={styles.field}>
        <label htmlFor="ai-vault-category">Category</label>
        <select id="ai-vault-category" value={category} onChange={(e) => setCategory(e.target.value as VaultDocumentCategory)} disabled={uploading}>
          <option value="">Choose a category…</option>
          {VAULT_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="ai-vault-label">Label (optional)</label>
        <input id="ai-vault-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. V5C" disabled={uploading} />
      </div>

      <div className={styles.field}>
        <label htmlFor="ai-vault-file">File (PDF, JPG, or PNG - 10MB max)</label>
        <input
          id="ai-vault-file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={uploading}
        />
      </div>

      {error && <p className={styles.errorNote} role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="submit" className={styles.confirmBtn} disabled={uploading || !file || !category}>
          {uploading && <VehicleSpinner kind={doc.vehicleKind} size={20} />}
          {uploading ? 'Uploading…' : 'Add document'}
        </button>
      </div>
    </form>
  );
}
