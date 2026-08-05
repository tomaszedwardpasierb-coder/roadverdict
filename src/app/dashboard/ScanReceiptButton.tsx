// Place at: src/app/dashboard/ScanReceiptButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReviewQueueModal } from './ReviewQueueModal';
import type { ParsedReceiptItem } from '@/lib/tracker/receiptParse';
import type { ReviewQueueEntry } from '@/app/api/tracker/commit-receipt-items/route';
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
  const [progress, setProgress] = useState<{ current: number; total: number; stage: 'reading' | 'saving' } | null>(null);
  const [outcomes, setOutcomes] = useState<FileParseOutcome[] | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  // Scoped to exactly what THIS scan created, in true chronological
  // order - never the app-wide needsReview snapshot, so a leftover
  // unreviewed item from an earlier, abandoned session never gets mixed
  // into it. Those leftovers are still reachable the normal way, via the
  // pulsing tab dot and clicking Edit on the flagged card.
  const [queueEntries, setQueueEntries] = useState<ReviewQueueEntry[] | null>(null);

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
    setCommitError(null);
    setScanning(true);

    // Phase 1: read every file first. Sequential, not parallel - keeps
    // progress reporting honest and avoids a burst of simultaneous
    // requests at the AI API. Nothing is saved yet at this point.
    const results: FileParseOutcome[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length, stage: 'reading' });
      results.push(await parseOneFile(files[i]));
    }
    setOutcomes(results);

    // Phase 2: combine everything read across every file, and sort into
    // TRUE chronological order - not upload order, not file-selection
    // order. This is what lets each item, once committed, see genuinely
    // earlier ones as real anchors instead of a handful of unrelated
    // receipts years apart all collapsing onto the same guess.
    const allItems = results.flatMap((r) => r.items ?? []);
    allItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (allItems.length > 0) {
      setProgress({ current: 1, total: 1, stage: 'saving' });
      try {
        const res = await fetch('/api/tracker/commit-receipt-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: allItems }),
        });
        const data = await res.json();
        if (res.ok && Array.isArray(data.createdEntries) && data.createdEntries.length > 0) {
          router.refresh();
          setQueueEntries(data.createdEntries);
        } else {
          setCommitError(data.error ?? 'Could not save these entries. Please try again.');
        }
      } catch {
        setCommitError('Could not reach the server to save these entries.');
      }
    }

    setProgress(null);
    setScanning(false);
    e.target.value = '';
  }

  function handleQueueFinished() {
    setQueueEntries(null);
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
      {open && (
        <div className={styles.scanReceiptPanel}>
          <p>
            Snap or upload one photo, or a whole stack at once - a drawer full of old paper receipts works fine.
            RoadVerdict&apos;s AI reads every one first, then sorts them all into the right chronological order
            before saving anything, so old and new receipts don&apos;t get mixed up. Each one is checked against
            what you&apos;ve already logged in case it&apos;s a duplicate, and a quick review opens for anything
            created so you can check the details before it&apos;s done.
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
              {progress.stage === 'reading'
                ? `Reading receipt ${progress.current} of ${progress.total}…`
                : 'Sorting into date order and saving…'}
            </p>
          )}
          {outcomes && !scanning && (
            <div style={{ marginTop: '0.6rem' }}>
              {successCount > 0 && !commitError && (
                <p className={styles.scanReceiptSuccess}>
                  ✓ Read {successCount} receipt{successCount === 1 ? '' : 's'}.
                </p>
              )}
              {commitError && (
                <p className="error-text" role="alert">{commitError}</p>
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
      {queueEntries && <ReviewQueueModal entries={queueEntries} onFinished={handleQueueFinished} />}
    </div>
  );
}
