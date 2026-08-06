// Place at: src/app/dashboard/ScanReceiptButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReviewQueueModal } from './ReviewQueueModal';
import type { ParsedReceiptItem } from '@/lib/tracker/receiptParse';
import styles from './dashboard.module.css';

interface FileParseOutcome {
  fileName: string;
  ok: boolean;
  summary?: string | null;
  skippedBeforeProduction?: number;
  skippedNonPetrol?: number;
  skippedUnreadableLitres?: number;
  items?: ParsedReceiptItem[];
  error?: string;
}

export function ScanReceiptButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<FileParseOutcome[] | null>(null);
  // Scoped to exactly what THIS scan read, sorted into true chronological
  // order, not yet saved anywhere - the review queue commits each one
  // lazily as it's reached. Never the app-wide needsReview snapshot, so
  // a leftover unreviewed item from an earlier, abandoned session never
  // gets mixed into it - those stay reachable the normal way, via the
  // pulsing tab dot and clicking Edit on the flagged card.
  const [queueItems, setQueueItems] = useState<ParsedReceiptItem[] | null>(null);

  async function parseOneFile(file: File): Promise<FileParseOutcome> {
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
        skippedBeforeProduction: typeof data.skippedBeforeProduction === 'number' ? data.skippedBeforeProduction : 0,
        skippedNonPetrol: typeof data.skippedNonPetrol === 'number' ? data.skippedNonPetrol : 0,
        skippedUnreadableLitres: typeof data.skippedUnreadableLitres === 'number' ? data.skippedUnreadableLitres : 0,
        items: Array.isArray(data.items) ? data.items : [],
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

    // Read every file first. Sequential, not parallel - keeps progress
    // reporting honest and avoids a burst of simultaneous requests at
    // the AI API. Nothing is saved anywhere yet at this point.
    const results: FileParseOutcome[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length });
      results.push(await parseOneFile(files[i]));
    }
    setOutcomes(results);

    // Combine everything read across every file, and sort into TRUE
    // chronological order - not upload order, not file-selection order.
    // The review queue commits each one lazily, right as it's reached,
    // so a correction to an early item can genuinely improve the
    // estimate for a later one instead of every item being guessed from
    // the same stale, pre-review snapshot.
    const allItems = results.flatMap((r) => r.items ?? []);
    allItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    setProgress(null);
    setScanning(false);
    e.target.value = '';

    if (allItems.length > 0) setQueueItems(allItems);
  }

  function handleQueueFinished() {
    setQueueItems(null);
    router.refresh();
  }

  const successCount = outcomes?.filter((o) => o.ok).length ?? 0;
  const failCount = outcomes?.filter((o) => !o.ok).length ?? 0;
  const totalSkippedBeforeProduction = outcomes?.reduce((sum, o) => sum + (o.skippedBeforeProduction ?? 0), 0) ?? 0;
  const totalSkippedNonPetrol = outcomes?.reduce((sum, o) => sum + (o.skippedNonPetrol ?? 0), 0) ?? 0;
  const totalSkippedUnreadableLitres = outcomes?.reduce((sum, o) => sum + (o.skippedUnreadableLitres ?? 0), 0) ?? 0;

  return (
    <div className={styles.scanReceiptWrap}>
      <button type="button" className={styles.scanReceiptBtn} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">🧠</span> Scan a receipt
      </button>
      <p className={styles.scanReceiptCaption}>Turn a shoebox of receipts into a proper history, in minutes, not hours.</p>
      {open && (
        <div className={styles.scanReceiptPanel}>
          <p>
            Upload everything you&apos;ve got, old paper receipts, screenshots, a whole stack at once. Our AI reads
            each one, works out what it is and when it happened, and sorts it all into the right order automatically,
            so old and new receipts don&apos;t get mixed up. Effortless, mostly, occasionally it&apos;ll ask you to
            confirm a mileage it can&apos;t be sure of, but that&apos;s the exception, not the rule. Each one is
            checked against what you&apos;ve already logged in case it&apos;s a duplicate, and a quick review opens
            for anything created so you can check the details before it&apos;s done.
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
                  ✓ Read {successCount} receipt{successCount === 1 ? '' : 's'}.
                </p>
              )}
              {totalSkippedBeforeProduction > 0 && (
                <p className="field-note" style={{ color: 'var(--amber-ink)', marginTop: '0.4rem' }}>
                  {totalSkippedBeforeProduction} item{totalSkippedBeforeProduction === 1 ? '' : 's'} were dated
                  before your bike was made, so {totalSkippedBeforeProduction === 1 ? "it wasn't" : "they weren't"} logged.
                </p>
              )}
              {totalSkippedNonPetrol > 0 && (
                <p className="field-note" style={{ color: 'var(--amber-ink)', marginTop: '0.4rem' }}>
                  {totalSkippedNonPetrol} fuel item{totalSkippedNonPetrol === 1 ? '' : 's'} looked like diesel (or
                  another non-petrol fuel) - motorcycles run on petrol, so {totalSkippedNonPetrol === 1 ? "it wasn't" : "they weren't"} logged.
                </p>
              )}
              {totalSkippedUnreadableLitres > 0 && (
                <p className="field-note" style={{ color: 'var(--amber-ink)', marginTop: '0.4rem' }}>
                  {totalSkippedUnreadableLitres} fuel item{totalSkippedUnreadableLitres === 1 ? '' : 's'} couldn&apos;t
                  be read clearly enough to know how much fuel was bought, so {totalSkippedUnreadableLitres === 1 ? "it wasn't" : "they weren't"} logged
                  automatically - please add {totalSkippedUnreadableLitres === 1 ? 'it' : 'them'} manually.
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
            </div>
          )}
          <p className={styles.scanReceiptConstruction}>PDF receipts aren&apos;t scanned yet - attach those manually as before.</p>
        </div>
      )}
      {queueItems && <ReviewQueueModal parsedItems={queueItems} onFinished={handleQueueFinished} />}
    </div>
  );
}
