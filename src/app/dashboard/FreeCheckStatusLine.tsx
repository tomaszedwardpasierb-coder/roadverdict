// Place at: src/app/dashboard/FreeCheckStatusLine.tsx
//
// One quiet line under the Full history check heading telling a Pro
// account where it stands with its included check: ready, due on a date,
// waiting for the trial to end, or not part of a tester account. Plain
// text on purpose (no banner or box) - the numbers come from
// freeVehicleHistoryCheckStatus(), which the dashboard feeds from the
// user doc it has already loaded.
import styles from './dashboard.module.css';
import { BUYING_GUIDE_REPORT_PRICE_LABEL } from '@/lib/payments/pricing';
import type { FreeHistoryCheckStatus } from '@/lib/tracker/vehicleHistoryReportUsage';

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
}

export function FreeCheckStatusLine({ status }: { status: FreeHistoryCheckStatus }) {
  const price = BUYING_GUIDE_REPORT_PRICE_LABEL.pro;
  switch (status.state) {
    case 'ready':
      return (
        <p className={styles.subtext}>
          <strong>Your free check is ready.</strong> Look up a plate below, then choose the free full vehicle history check - one every 4 weeks with Pro.
        </p>
      );
    case 'later':
      return (
        <p className={styles.subtext}>
          <strong>Your next free check is on {day(status.at)}.</strong> Another one before then is {price}.
        </p>
      );
    case 'trial':
      return (
        <p className={styles.subtext}>
          <strong>Your free check starts after your trial ends on {day(status.at)}.</strong> Until then a check is {price}.
        </p>
      );
    case 'tester':
      return (
        <p className={styles.subtext}>
          <strong>Tester accounts don&apos;t include the free check.</strong> A check is {price}.
        </p>
      );
  }
}
