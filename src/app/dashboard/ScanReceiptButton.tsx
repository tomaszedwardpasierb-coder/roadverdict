// Place at: src/app/dashboard/ScanReceiptButton.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ReviewQueueModal } from './ReviewQueueModal';
import type { ParsedReceiptItem } from '@/lib/tracker/receiptParse';
import { classifyReceiptTier, receiptTierSortWeight } from '@/lib/tracker/receiptTiering';
import { Icon } from './Icon';
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

export function ScanReceiptButton({ isPro = false }: { isPro?: boolean }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [outcomes, setOutcomes] = useState<FileParseOutcome[] | null>(null);
  const [queueItems, setQueueItems] = useState<ParsedReceiptItem[] | null>(null);
  const [pendingBatch, setPendingBatch] = useState<ParsedReceiptItem[] | null>(null);
  const [checkingResume, setCheckingResume] = useState(true);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tracker/pending-scan-batch');
        const data = await res.json();
        if (!cancelled && res.ok && data.batch?.items?.length > 0) {
          setPendingBatch(data.batch.items);
        }
      } catch {
        // Silently proceed — a failed check here shouldn't block scanning.
      } finally {
        if (!cancelled) setCheckingResume(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleDiscardPending() {
    setDiscarding(true);
    try {
      await fetch('/api/tracker/pending-scan-batch', { method: 'DELETE' });
    } finally {
      setDiscarding(false);
      setPendingBatch(null);
    }
  }

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

    const results: FileParseOutcome[] = [];
    for (let i = 0; i < files.length; i++) {
      setProgress({ current: i + 1, total: files.length });
      results.push(await parseOneFile(files[i]));
    }
    setOutcomes(results);

    const allItems = results.flatMap((r) => r.items ?? []);
    allItems.sort((a, b) => {
      const tierDiff = receiptTierSortWeight(classifyReceiptTier(a)) - receiptTierSortWeight(classifyReceiptTier(b));
      if (tierDiff !== 0) return tierDiff;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });

    setProgress(null);
    setScanning(false);
    e.target.value = '';

    if (allItems.length > 0) {
      try {
        await fetch('/api/tracker/pending-scan-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: allItems }),
        });
      } catch {
        // Not fatal — worst case this scan isn't resumable if they leave mid-review.
      }
      setQueueItems(allItems);
    }
  }

  function handleQueueFinished() {
    setQueueItems(null);
    setPendingBatch(null);
    router.refresh();
  }

  const successCount = outcomes?.filter((o) => o.ok).length ?? 0;
  const failCount = outcomes?.filter((o) => !o.ok).length ?? 0;
  const totalSkippedBeforeProduction = outcomes?.reduce((sum, o) => sum + (o.skippedBeforeProduction ?? 0), 0) ?? 0;
  const totalSkippedNonPetrol = outcomes?.reduce((sum, o) => sum + (o.skippedNonPetrol ?? 0), 0) ?? 0;
  const totalSkippedUnreadableLitres = outcomes?.reduce((sum, o) => sum + (o.skippedUnreadableLitres ?? 0), 0) ?? 0;

  return (
    <div className={styles.scanCard}>

      {/* Resume banner — leftover from a previous interrupted session */}
      {!checkingResume && pendingBatch && !queueItems && (
        <div className={styles.scanResumeBanner}>
          <Icon name="camera" size={15} />
          <span>
            You have <strong>{pendingBatch.length} {pendingBatch.length === 1 ? 'receipt' : 'receipts'}</strong> from
            an earlier scan waiting to be reviewed.
          </span>
          <button type="button" className={styles.scanResumeBtn} onClick={() => setQueueItems(pendingBatch)}>
            Resume
          </button>
          <button type="button" className={styles.scanDiscardBtn} disabled={discarding} onClick={handleDiscardPending}>
            {discarding ? 'Discarding…' : 'Discard'}
          </button>
        </div>
      )}

      {/* Header row */}
      <div className={styles.scanCardHeader}>
        <div className={styles.scanCardTitleRow}>
          <span className={styles.scanCardIcon}><Icon name="camera" size={20} /></span>
          <h3 className={styles.scanCardTitle}>AI receipt scanning</h3>
          <span className={styles.scanAiBadge}>AI</span>
        </div>
        <p className={styles.scanCardSubtitle}>
          Photo or PDF — our AI reads it, categorises it, and adds it to your history. You just review and confirm.
        </p>
      </div>

      {/* How it works — three steps */}
      <div className={styles.scanSteps}>
        <div className={styles.scanStep}>
          <span className={styles.scanStepNum}>1</span>
          <span className={styles.scanStepLabel}>Choose files</span>
        </div>
        <div className={styles.scanStepArrow}>→</div>
        <div className={styles.scanStep}>
          <span className={styles.scanStepNum}>2</span>
          <span className={styles.scanStepLabel}>AI reads them</span>
        </div>
        <div className={styles.scanStepArrow}>→</div>
        <div className={styles.scanStep}>
          <span className={styles.scanStepNum}>3</span>
          <span className={styles.scanStepLabel}>You review &amp; confirm</span>
        </div>
      </div>

      {/* Upload zone */}
      <div className={styles.scanUploadZone}>
        <label className={styles.scanUploadLabel} htmlFor="scan-file-input">
          <Icon name="upload" size={18} />
          <span>{scanning ? 'Reading…' : isPro ? 'Choose files (images or PDFs)' : 'Choose a file (image or PDF)'}</span>
        </label>
        <input
          id="scan-file-input"
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          multiple={isPro}
          onChange={handleFilesSelected}
          disabled={scanning}
          className={styles.scanFileInput}
        />
        {progress && (
          <p className={styles.scanProgress}>
            Reading receipt {progress.current} of {progress.total}…
          </p>
        )}
      </div>

      {/* Free plan nudge */}
      {!isPro && (
        <p className={styles.scanFreeNote}>
          Free plan scans one file at a time.{' '}
          <Link href="/pro" className={styles.scanFreeLink}>Upgrade to Pro</Link>
          {' '}to scan a whole batch at once.
        </p>
      )}

      {/* Pro tip — only shown to Pro users, less clutter for free */}
      {isPro && (
        <p className={styles.scanReceiptTip}>
          <strong>Tip:</strong> mixing fuel receipts with a service or parts receipt in the same batch
          helps the AI pin mileage more accurately — service receipts usually have a mileage printed on them.
        </p>
      )}

      {/* Outcomes */}
      {outcomes && !scanning && (
        <div className={styles.scanOutcomes}>
          {successCount > 0 && (
            <p className={styles.scanReceiptSuccess}>
              ✓ Read {successCount} receipt{successCount === 1 ? '' : 's'} successfully.
            </p>
          )}
          {totalSkippedBeforeProduction > 0 && (
            <p className={styles.scanSkipNote}>
              {totalSkippedBeforeProduction} item{totalSkippedBeforeProduction === 1 ? '' : 's'}{' '}
              {totalSkippedBeforeProduction === 1 ? 'was' : 'were'} dated
              before your bike was made and {totalSkippedBeforeProduction === 1 ? "wasn't" : "weren't"} logged.
            </p>
          )}
          {totalSkippedNonPetrol > 0 && (
            <p className={styles.scanSkipNote}>
              {totalSkippedNonPetrol} fuel item{totalSkippedNonPetrol === 1 ? '' : 's'} looked like diesel
              and {totalSkippedNonPetrol === 1 ? "wasn't" : "weren't"} logged — motorcycles run on petrol.
            </p>
          )}
          {totalSkippedUnreadableLitres > 0 && (
            <p className={styles.scanSkipNote}>
              {totalSkippedUnreadableLitres} fuel item{totalSkippedUnreadableLitres === 1 ? '' : 's'} couldn&apos;t
              be read clearly enough — please add {totalSkippedUnreadableLitres === 1 ? 'it' : 'them'} manually.
            </p>
          )}
          {failCount > 0 && (
            <div className={styles.scanFailBlock}>
              <p className="error-text" role="alert">
                {failCount} of {outcomes.length} file{outcomes.length === 1 ? '' : 's'} couldn&apos;t be read:
              </p>
              <ul className={styles.scanFailList}>
                {outcomes.filter((o) => !o.ok).map((o, i) => (
                  <li key={i}>{o.fileName}: {o.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {queueItems && <ReviewQueueModal parsedItems={queueItems} onFinished={handleQueueFinished} />}
    </div>
  );
}
