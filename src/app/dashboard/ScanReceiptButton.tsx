// Place at: src/app/dashboard/ScanReceiptButton.tsx
'use client';

import { useState, useRef } from 'react';
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
  const [justScannedTab, setJustScannedTab] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setScanned } = useScannedReceipt();

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setJustScannedTab(null);
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
      setScanned({
        category: data.category,
        date: data.date,
        cost: data.cost,
        description: data.description,
        litres: data.litres,
        attachment: data.attachment,
      });
      setJustScannedTab(CATEGORY_TAB_NAMES[data.category] ?? data.category);
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
            Snap or upload a photo of a receipt or invoice. RoadVerdict&apos;s AI will read it, work out what it is,
            and pre-fill the entry for you - you&apos;ll just need to review it, confirm the mileage, and add a
            reminder if it&apos;s due again.
          </p>
          <input
            ref={fileInputRef}
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
          {justScannedTab && !scanning && !error && (
            <p className={styles.scanReceiptSuccess}>
              ✓ Got it - switch to the <strong>{justScannedTab}</strong> tab to review and save it.
            </p>
          )}
          <p className={styles.scanReceiptConstruction}>PDF receipts aren&apos;t scanned yet - attach those manually as before.</p>
        </div>
      )}
    </div>
  );
}
