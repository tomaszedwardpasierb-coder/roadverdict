// Place at: src/app/dashboard/LockedStatCard.tsx
//
// The stat-card equivalent of ProGate.tsx's upsell card, but deliberately
// lighter-weight - a single stat card is too small a surface for a full
// "here's what you're missing" pitch. Keeps the real icon and label so
// the person still knows what's behind it, replaces only the value with
// a small lock + "Premium", and links the whole card to /pro rather than
// showing a separate button.
import Link from 'next/link';
import { Icon, type IconName } from './Icon';
import styles from './dashboard.module.css';

interface Props {
  icon: IconName;
  iconClass: string;
  label: string;
}

export function LockedStatCard({ icon, iconClass, label }: Props) {
  return (
    <Link href="/pro" className={`${styles.statCard} ${styles.statCardLocked}`}>
      <div className={`${styles.statCardIcon} ${iconClass}`}>
        <Icon name={icon} size={16} />
      </div>
      <div className={styles.statCardLockedValue}>
        <Icon name="lock" size={14} />
        <span>Premium</span>
      </div>
      <div className={styles.statCardLabel}>{label}</div>
    </Link>
  );
}
