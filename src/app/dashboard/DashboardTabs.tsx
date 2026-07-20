// Place at: src/app/dashboard/DashboardTabs.tsx
'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';

interface DashboardTabsProps {
  serviceContent: React.ReactNode;
  fuelContent: React.ReactNode;
  modsContent: React.ReactNode;
  billsContent: React.ReactNode;
  remindersContent: React.ReactNode;
}

type TabKey = 'service' | 'fuel' | 'mods' | 'bills' | 'reminders';

export function DashboardTabs({ serviceContent, fuelContent, modsContent, billsContent, remindersContent }: DashboardTabsProps) {
  const [active, setActive] = useState<TabKey>('service');

  const tabs: { key: TabKey; label: string; content: React.ReactNode }[] = [
    { key: 'service', label: 'Service', content: serviceContent },
    { key: 'mods', label: 'Mods & accessories', content: modsContent },
    { key: 'fuel', label: 'Fuel', content: fuelContent },
    { key: 'bills', label: 'Insurance, tax & MOT', content: billsContent },
    { key: 'reminders', label: 'Reminders', content: remindersContent },
  ];

  return (
    <div>
      <div className={styles.tabBar}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`${styles.tab} ${active === t.key ? styles.tabActive : ''}`}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} className={styles.contentColumn} style={{ display: active === t.key ? 'block' : 'none' }}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
