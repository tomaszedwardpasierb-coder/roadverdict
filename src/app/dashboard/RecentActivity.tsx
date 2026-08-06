// Place at: src/app/dashboard/RecentActivity.tsx
'use client';

import { convertMilesToDisplay, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTabSwitch, viewRecords, type ReviewCategory } from './TabSwitchContext';
import styles from './dashboard.module.css';

export interface RecentActivityItem {
  id: string;
  reviewCategory: ReviewCategory;
  date: string;
  icon: string;
  type: string;
  description: string;
  category: string;
  cost: number;
  mileage?: number;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function RecentActivity({
  items,
  distanceUnit,
  currency,
  rates,
}: {
  items: RecentActivityItem[];
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
}) {
  const { switchTo, setHighlightIds } = useTabSwitch();

  if (items.length === 0) {
    return <p className={styles.emptyNote}>Nothing logged yet - your recent activity will show up here.</p>;
  }

  return (
    <table className={styles.recentActivityTable}>
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Description</th>
          <th>Category</th>
          <th>Cost</th>
          <th>{distanceUnit === 'km' ? 'Km' : 'Miles'}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr
            key={item.id}
            className={styles.recentActivityRow}
            onClick={() => viewRecords(item.reviewCategory, [item.id], switchTo, setHighlightIds)}
          >
            <td>{fmtDate(item.date)}</td>
            <td>{item.icon} {item.type}</td>
            <td>{item.description}</td>
            <td>{item.category}</td>
            <td>{formatCurrency(item.cost, currency, rates)}</td>
            <td>{item.mileage != null ? Math.round(convertMilesToDisplay(item.mileage, distanceUnit)).toLocaleString() : '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
