// Place at: src/app/dashboard/ScanReceiptButton.tsx
'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

export function ScanReceiptButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.scanReceiptWrap}>
      <button type="button" className={styles.scanReceiptBtn} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">🧠</span> Scan a receipt
      </button>
      {open && (
        <div className={styles.scanReceiptPanel}>
          <p>
            Soon, you&apos;ll be able to snap or upload a photo of any receipt or invoice. RoadVerdict&apos;s AI will
            read it, work out what it is, and draft the whole entry for you automatically - you&apos;ll just need to
            confirm the mileage, and add a reminder if it&apos;s due again. Sit back and relax.
          </p>
          <p className={styles.scanReceiptConstruction}>🚧 Under construction - not live yet.</p>
        </div>
      )}
    </div>
  );
}
