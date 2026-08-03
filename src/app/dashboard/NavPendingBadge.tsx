// Place at: src/app/dashboard/NavPendingBadge.tsx
'use client';

import { useScannedReceipt, type ScanCategory } from './ScannedReceiptContext';
import styles from './dashboard.module.css';

export function NavPendingBadge({ category }: { category: ScanCategory }) {
  const { queue } = useScannedReceipt();
  const hasPending = queue.some((item) => item.category === category);
  if (!hasPending) return null;
  return <span className={styles.navPendingBadge} aria-label="A scanned item is waiting to be reviewed here" />;
}
