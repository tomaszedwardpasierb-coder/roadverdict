// Place at: src/app/dashboard/ScanReceiptButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './dashboard.module.css';

const CATEGORY_TAB_NAMES: Record<string, string> = {
  service: 'Service',
  fuel: 'Fuel',
  mods: 'Parts & Accessories',
  bills: 'Tax & Insurance',
};

export function ScanReceiptButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultTabs, setResultTabs] = useState<string[] | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [skippedCount, setSkippedCount] = useState(0);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResultTabs(null);
    setAiSummary(null);
    setSkippedCount(0);
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
      const tabNames = [...new Set((data.categories as string[]).map((c) => CATEGORY_TAB_NAMES[c] ?? c))];
      setResultTabs(tabNames);
      setAiSummary(typeof data.summary === 'string' ? data.summary : null);
      setSkippedCount(typeof data.skippedBeforeProduction === 'number' ? data.skippedBeforeProduction : 0);
      // The new entries were created server-side just now - refresh so
      // they actually show up in the relevant history list and the
      // sidebar's pending-review dots update immediately.
      router.refresh();
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
            separate entries first if it covers more than one thing - and create each one automatically, with your
            mileage estimated for now. You&apos;ll see it flagged for review in the relevant tab, where you can
            correct anything (especially the mileage) before it's done.
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
          {aiSummary && !scanning && !error && <p className={styles.scanReceiptSummary}>🧠 &quot;{aiSummary}&quot;</p>}
          {resultTabs && !scanning && !error && (
            <p className={styles.scanReceiptSuccess}>
              ✓ Created {resultTabs.length} entr{resultTabs.length === 1 ? 'y' : 'ies'} in <strong>{resultTabs.join(', ')}</strong> -
              look for the pulsing dot in the sidebar and click the flagged entry to review it.
            </p>
          )}
          {skippedCount > 0 && !scanning && !error && (
            <p className="field-note" style={{ color: 'var(--amber-ink)', marginTop: '0.4rem' }}>
              {skippedCount} item{skippedCount === 1 ? '' : 's'} on this receipt were dated before your bike was made,
              so {skippedCount === 1 ? "it wasn't" : "they weren't"} logged.
            </p>
          )}
          <p className={styles.scanReceiptConstruction}>PDF receipts aren&apos;t scanned yet - attach those manually as before.</p>
        </div>
      )}
    </div>
  );
}
