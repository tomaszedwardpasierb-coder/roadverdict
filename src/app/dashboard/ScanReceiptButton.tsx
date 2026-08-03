// Place at: src/app/dashboard/ScanReceiptButton.tsx
'use client';

import { useState } from 'react';
import { useScannedReceipt } from './ScannedReceiptContext';
import styles from './dashboard.module.css';

const CATEGORY_TAB_NAMES: Record<string, string> = {
  service: 'Service',
  fuel: 'Fuel',
  mods: 'Parts & Accessories',
  bills: 'Tax & Insurance',
};

export function ScanReceiptButton() {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justScannedTabs, setJustScannedTabs] = useState<string[] | null>(null);
  const { addItems } = useScannedReceipt();

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setJustScannedTabs(null);
    setScanning(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/tracker/scan-receipt', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not read the receipt. Please try again or enter it manually.');
        return;
      }
      addItems(
        data.items.map((item: { category: 'service' | 'fuel' | 'mods' | 'bills'; date: string; cost: number; description: string; litres: number | null }) => ({
          ...item,
          attachment: data.attachment,
        }))
      );
      const tabNames = [...new Set(data.items.map((i: { category: string }) => CATEGORY_TAB_NAMES[i.category] ?? i.category))] as string[];
      setJustScannedTabs(tabNames);
    } catch {
      setError('Could not reach the server. Please try again or enter it manually.');
    } finally {
      setScanning(false);
      e.target.value = '';
    }
  }

  return (
    <div className={styles.scanReceiptWrap}>
      <button type="button" className={styles.scanReceiptBtn} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">🧠</span> Scan a receipt
      </button>
      {open && (
        <div className={styles.scanReceiptPanel}>
          <p>
            Snap or upload a photo of a receipt or invoice. RoadVerdict&apos;s AI will read it - splitting it into
            separate items first if it covers more than one thing - and pre-fill each entry for you. You&apos;ll just
            need to review each one, confirm the mileage, and add a reminder if it&apos;s due again.
          </p>
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileSelected}
            disabled={scanning}
            style={{ marginTop: '0.7rem' }}
          />
          {scanning && <p className="field-note">Reading the receipt…</p>}
          {error && (
            <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>
              {error}
            </p>
          )}
          {justScannedTabs && !scanning && !error && (
            <p className={styles.scanReceiptSuccess}>
              ✓ Found {justScannedTabs.length} item{justScannedTabs.length === 1 ? '' : 's'} - switch to{' '}
              {justScannedTabs.length === 1 ? 'the' : ''} <strong>{justScannedTabs.join(', ')}</strong> tab
              {justScannedTabs.length === 1 ? '' : 's'} (look for the pulsing dot) to review each one. This was
              automatically detected, so please double-check the details before saving.
            </p>
          )}
          <p className={styles.scanReceiptConstruction}>PDF receipts aren&apos;t scanned yet - attach those manually as before.</p>
        </div>
      )}
    </div>
  );
}
