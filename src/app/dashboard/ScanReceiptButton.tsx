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

interface FileOutcome {
  fileName: string;
  ok: boolean;
  summary?: string | null;
  categories?: string[];
  skippedBeforeProduction?: number;
  error?: string;
}

export function ScanReceiptButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<FileOutcome[] | null>(null);

  async function scanOneFile(file: File): Promise<FileOutcome> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/tracker/scan-receipt', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        return { fileName: file.name, ok: false, error: data.error ?? 'Could not read this receipt.' };
      }
      return {
        fileName: file.name,
        ok: true,
        summary: typeof data.summary === 'string' ? data.summary : null,
        categories: data.categories ?? [],
        skippedBeforeProduction: typeof data.skippedBeforeProduction === 'number' ? data.skippedBeforeProduction : 0,
      };
    } catch {
      return { fileName: file.name, ok: false, error: 'Could not reach the server.' };
    }
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setOutcomes(null);
    setScanning(true);

    // Sequential, not parallel - keeps progress reporting simple and
    // honest, and avoids firing a burst of simultaneous requests at the
    // AI API for what's often a whole stack of old paper receipts at
    // once. One bad photo in the stack doesn't stop the rest - each
    // file's own outcome is tracked and shown independently.
    const results: FileOutcome[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length });
      results.push(await scanOneFile(files[i]));
    }

    setOutcomes(results);
    setProgress(null);
    setScanning(false);
    e.target.value = '';
    // At least one file may have created real records - refresh so they
    // show up and the sidebar's pending-review dots update.
    if (results.some((r) => r.ok)) router.refresh();
  }

  const totalCreatedCategories = outcomes ? [...new Set(outcomes.flatMap((o) => o.categories ?? []))] : [];
  const successCount = outcomes?.filter((o) => o.ok).length ?? 0;
  const failCount = outcomes?.filter((o) => !o.ok).length ?? 0;
  const totalSkipped = outcomes?.reduce((sum, o) => sum + (o.skippedBeforeProduction ?? 0), 0) ?? 0;

  return (
    <div className={styles.scanReceiptWrap}>
      <button type="button" className={styles.scanReceiptBtn} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">🧠</span> Scan a receipt
      </button>
      {open && (
        <div className={styles.scanReceiptPanel}>
          <p>
            Snap or upload one photo, or a whole stack at once - a drawer full of old paper receipts works fine.
            RoadVerdict&apos;s AI reads each one, splits it into separate entries first if it covers more than one
            thing, and creates each automatically with your mileage estimated for now. You&apos;ll see everything
            flagged for review in the relevant tab, where you can correct anything (especially the mileage) before
            it&apos;s done.
          </p>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesSelected}
            disabled={scanning}
            style={{ marginTop: '0.7rem' }}
          />
          {progress && (
            <p className="field-note">
              Reading receipt {progress.current} of {progress.total}…
            </p>
          )}
          {outcomes && !scanning && (
            <div style={{ marginTop: '0.6rem' }}>
              {successCount > 0 && (
                <p className={styles.scanReceiptSuccess}>
                  ✓ Read {successCount} receipt{successCount === 1 ? '' : 's'}, created entries in{' '}
                  <strong>{totalCreatedCategories.map((c) => CATEGORY_TAB_NAMES[c] ?? c).join(', ')}</strong> - look
                  for the pulsing dot in the sidebar and click each flagged entry to review it.
                </p>
              )}
              {totalSkipped > 0 && (
                <p className="field-note" style={{ color: 'var(--amber-ink)', marginTop: '0.4rem' }}>
                  {totalSkipped} item{totalSkipped === 1 ? '' : 's'} across these receipts were dated before your
                  bike was made, so {totalSkipped === 1 ? "it wasn't" : "they weren't"} logged.
                </p>
              )}
              {failCount > 0 && (
                <div style={{ marginTop: '0.4rem' }}>
                  <p className="error-text" role="alert">
                    {failCount} of {outcomes.length} file{outcomes.length === 1 ? '' : 's'} couldn&apos;t be read:
                  </p>
                  <ul style={{ margin: '0.3rem 0 0 1.1rem', fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                    {outcomes.filter((o) => !o.ok).map((o, i) => (
                      <li key={i}>
                        {o.fileName}: {o.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {outcomes.filter((o) => o.ok && o.summary).map((o, i) => (
                <p key={i} className={styles.scanReceiptSummary}>
                  🧠 &quot;{o.summary}&quot;
                </p>
              ))}
            </div>
          )}
          <p className={styles.scanReceiptConstruction}>PDF receipts aren&apos;t scanned yet - attach those manually as before.</p>
        </div>
      )}
    </div>
  );
}
