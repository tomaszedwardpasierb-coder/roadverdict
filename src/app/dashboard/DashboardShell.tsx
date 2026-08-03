// Place at: src/app/dashboard/DashboardShell.tsx
'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { UpdateMileageButton } from './UpdateMileageButton';
import { BikeSwitcher, type SwitcherBike } from './BikeSwitcher';
import LogoutButton from './LogoutButton';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { ScannedReceiptProvider, type ScanCategory } from './ScannedReceiptContext';
import { NavPendingBadge } from './NavPendingBadge';
import styles from './dashboard.module.css';

const SCAN_CATEGORIES: ScanCategory[] = ['service', 'fuel', 'mods', 'bills'];
function asScanCategory(key: string): ScanCategory | null {
  return (SCAN_CATEGORIES as string[]).includes(key) ? (key as ScanCategory) : null;
}

type Section = 'dashboard' | 'service' | 'fuel' | 'mods' | 'bills' | 'reminders' | 'reports' | 'shareLinks';

const NAV_ITEMS: { key: Section; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { key: 'service', label: 'Service', icon: '🔧' },
  { key: 'fuel', label: 'Fuel', icon: '⛽' },
  { key: 'mods', label: 'Parts & Accessories', icon: '⚙️' },
  { key: 'bills', label: 'Tax & Insurance', icon: '📄' },
  { key: 'reminders', label: 'Reminders', icon: '🔔' },
  { key: 'reports', label: 'Reports', icon: '📊' },
  { key: 'shareLinks', label: 'Shareable Links', icon: '🔗' },
];

const MOBILE_NAV_ITEMS: { key: Section; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { key: 'service', label: 'Service', icon: '🔧' },
  { key: 'fuel', label: 'Fuel', icon: '⛽' },
  { key: 'mods', label: 'Parts', icon: '⚙️' },
];

const MORE_ITEMS: { key: Section; label: string; icon: string }[] = [
  { key: 'bills', label: 'Tax & Insurance', icon: '📄' },
  { key: 'reminders', label: 'Reminders', icon: '🔔' },
  { key: 'reports', label: 'Reports', icon: '📊' },
  { key: 'shareLinks', label: 'Shareable Links', icon: '🔗' },
];

interface Props {
  bikeName: string;
  bikeYear?: number;
  currentMileage: number;
  distanceUnit: DistanceUnit;
  userEmail: string;
  bikes: SwitcherBike[];
  activeBikeId: string;
  dashboardContent: ReactNode;
  serviceContent: ReactNode;
  fuelContent: ReactNode;
  modsContent: ReactNode;
  billsContent: ReactNode;
  remindersContent: ReactNode;
  reportsContent: ReactNode;
  shareLinksContent: ReactNode;
}

export function DashboardShell({
  bikeName,
  bikeYear,
  currentMileage,
  distanceUnit,
  userEmail,
  bikes,
  activeBikeId,
  dashboardContent,
  serviceContent,
  fuelContent,
  modsContent,
  billsContent,
  remindersContent,
  reportsContent,
  shareLinksContent,
}: Props) {
  const [active, setActive] = useState<Section>('dashboard');
  const [showMore, setShowMore] = useState(false);

  const contentMap: Record<Section, ReactNode> = {
    dashboard: dashboardContent,
    service: serviceContent,
    fuel: fuelContent,
    mods: modsContent,
    bills: billsContent,
    reminders: remindersContent,
    reports: reportsContent,
    shareLinks: shareLinksContent,
  };

  const isMoreActive = active === 'bills' || active === 'reminders' || active === 'reports' || active === 'shareLinks';

  return (
    <ScannedReceiptProvider onSwitchTab={(cat) => setActive(cat)}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarLogo}>
            <Link href="/">
              <img src="/logo.png" alt="RoadVerdict" />
            </Link>
          </div>

          <nav className={styles.sidebarNav}>
            {NAV_ITEMS.map((item) => {
              const scanCategory = asScanCategory(item.key);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.sidebarNavItem} ${active === item.key ? styles.sidebarNavItemActive : ''}`}
                  onClick={() => setActive(item.key)}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  {scanCategory && <NavPendingBadge category={scanCategory} />}
                </button>
              );
            })}
          </nav>

          <BikeSwitcher bikes={bikes} activeBikeId={activeBikeId} distanceUnit={distanceUnit} />
          <div style={{ marginTop: '0.6rem' }}>
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

        <div className={styles.mobileTopBar}>
          <div className={styles.mobileTopBarBike}>
            <strong>{bikeName}</strong>
            <span>
              {bikeYear ?? 'Custom build'} · {formatDistance(currentMileage, distanceUnit)}
            </span>
          </div>
          <UpdateMileageButton currentMileage={currentMileage} distanceUnit={distanceUnit} />
        </div>

        <div className={styles.content}>{contentMap[active]}</div>

        <nav className={styles.mobileBottomNav}>
          {MOBILE_NAV_ITEMS.map((item) => {
            const scanCategory = asScanCategory(item.key);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setActive(item.key);
                  setShowMore(false);
                }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                  background: 'none', border: 'none', fontSize: '0.65rem',
                  color: active === item.key ? 'var(--amber-ink)' : 'var(--ink-soft)',
                  position: 'relative',
                }}
              >
                <span style={{ fontSize: '1.1rem' }} aria-hidden="true">{item.icon}</span>
                {item.label}
                {scanCategory && (
                  <span style={{ position: 'absolute', top: 0, right: '30%' }}>
                    <NavPendingBadge category={scanCategory} />
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowMore(true)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
              background: 'none', border: 'none', fontSize: '0.65rem',
              color: isMoreActive || showMore ? 'var(--amber-ink)' : 'var(--ink-soft)',
            }}
          >
            <span style={{ fontSize: '1.1rem' }} aria-hidden="true">⋯</span>
            More
          </button>
        </nav>

        {showMore && (
          <>
            <div className={styles.mobileMoreSheetBackdrop} onClick={() => setShowMore(false)} />
            <div className={styles.mobileMoreSheet}>
              {MORE_ITEMS.map((item) => {
                const scanCategory = asScanCategory(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={styles.mobileMoreSheetItem}
                    onClick={() => {
                      setActive(item.key);
                      setShowMore(false);
                    }}
                  >
                    <span aria-hidden="true">{item.icon}</span> {item.label}
                    {scanCategory && <NavPendingBadge category={scanCategory} />}
                  </button>
                );
              })}
              <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                Signed in as {userEmail}
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <Link href="/garage" onClick={() => setShowMore(false)}>Manage bikes →</Link>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <LogoutButton />
              </div>
            </div>
          </>
        )}
      </div>
    </ScannedReceiptProvider>
  );
}
