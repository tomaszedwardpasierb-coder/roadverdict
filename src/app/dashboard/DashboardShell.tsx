// Place at: src/app/dashboard/DashboardShell.tsx
'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { UpdateMileageButton } from './UpdateMileageButton';
import LogoutButton from './LogoutButton';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import styles from './dashboard.module.css';

type Section = 'dashboard' | 'service' | 'fuel' | 'mods' | 'bills' | 'reminders' | 'reports';

const NAV_ITEMS: { key: Section; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { key: 'service', label: 'Service', icon: '🔧' },
  { key: 'fuel', label: 'Fuel', icon: '⛽' },
  { key: 'mods', label: 'Mods', icon: '⚙️' },
  { key: 'bills', label: 'Bills', icon: '📄' },
  { key: 'reminders', label: 'Reminders', icon: '🔔' },
  { key: 'reports', label: 'Reports', icon: '📊' },
];

const MOBILE_NAV_ITEMS: { key: Section; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { key: 'service', label: 'Service', icon: '🔧' },
  { key: 'fuel', label: 'Fuel', icon: '⛽' },
  { key: 'mods', label: 'Mods', icon: '⚙️' },
];

interface Props {
  bikeName: string;
  bikeYear: number;
  currentMileage: number;
  distanceUnit: DistanceUnit;
  userEmail: string;
  dashboardContent: ReactNode;
  serviceContent: ReactNode;
  fuelContent: ReactNode;
  modsContent: ReactNode;
  billsContent: ReactNode;
  remindersContent: ReactNode;
  reportsContent: ReactNode;
}

export function DashboardShell({
  bikeName,
  bikeYear,
  currentMileage,
  distanceUnit,
  userEmail,
  dashboardContent,
  serviceContent,
  fuelContent,
  modsContent,
  billsContent,
  remindersContent,
  reportsContent,
}: Props) {
  const [active, setActive] = useState<Section>('dashboard');

  const contentMap: Record<Section, ReactNode> = {
    dashboard: dashboardContent,
    service: serviceContent,
    fuel: fuelContent,
    mods: modsContent,
    bills: billsContent,
    reminders: remindersContent,
    reports: reportsContent,
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <Link href="/">
            <img src="/logo.png" alt="RoadVerdict" />
          </Link>
        </div>

        <nav className={styles.sidebarNav}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`${styles.sidebarNavItem} ${active === item.key ? styles.sidebarNavItemActive : ''}`}
              onClick={() => setActive(item.key)}
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.sidebarBikeCard}>
          <div className={styles.sidebarBikeLabel}>My bike</div>
          <div className={styles.sidebarBikeName}>{bikeName}</div>
          <div className={styles.sidebarBikeMeta}>
            {bikeYear} · {formatDistance(currentMileage, distanceUnit)}
          </div>
          <UpdateMileageButton currentMileage={currentMileage} distanceUnit={distanceUnit} />
        </div>

        <div className={styles.sidebarUserFooter}>
          <div className={styles.sidebarUserAvatar}>{userEmail.slice(0, 2).toUpperCase()}</div>
          <div className={styles.sidebarUserEmail}>{userEmail}</div>
        </div>
        <div style={{ marginTop: '0.6rem' }}>
          <LogoutButton />
        </div>
      </aside>

      <div className={styles.content}>{contentMap[active]}</div>

      <nav className={styles.mobileBottomNav}>
        {MOBILE_NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActive(item.key)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.2rem',
              background: 'none',
              border: 'none',
              fontSize: '0.65rem',
              color: active === item.key ? 'var(--amber-ink)' : 'var(--ink-soft)',
            }}
          >
            <span style={{ fontSize: '1.1rem' }} aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActive('reports')}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.2rem',
            background: 'none',
            border: 'none',
            fontSize: '0.65rem',
            color: active === 'reports' ? 'var(--amber-ink)' : 'var(--ink-soft)',
          }}
        >
          <span style={{ fontSize: '1.1rem' }} aria-hidden="true">
            ⋯
          </span>
          More
        </button>
      </nav>
    </div>
  );
}
