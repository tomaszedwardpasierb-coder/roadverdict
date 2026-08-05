// Place at: src/app/dashboard/DashboardShell.tsx
'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { UpdateMileageButton } from './UpdateMileageButton';
import { BikeSwitcher, type SwitcherBike } from './BikeSwitcher';
import LogoutButton from './LogoutButton';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { TabSwitchProvider, type ReviewCategory } from './TabSwitchContext';
import { ResetDemoButton } from './ResetDemoButton';
import { DEMO_EMAIL } from '@/lib/tracker/demoSeed';
import styles from './dashboard.module.css';

type Section = 'dashboard' | 'service' | 'fuel' | 'mods' | 'bills' | 'reminders' | 'reports' | 'shareLinks' | 'story';

const REVIEW_CATEGORIES: ReviewCategory[] = ['service', 'fuel', 'mods', 'bills'];
function asReviewCategory(key: string): ReviewCategory | null {
  return (REVIEW_CATEGORIES as string[]).includes(key) ? (key as ReviewCategory) : null;
}

const NAV_ITEMS: { key: Section; label: string; icon: string }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { key: 'service', label: 'Service', icon: '🔧' },
  { key: 'fuel', label: 'Fuel', icon: '⛽' },
  { key: 'mods', label: 'Parts & Accessories', icon: '⚙️' },
  { key: 'bills', label: 'Tax & Insurance', icon: '📄' },
  { key: 'reminders', label: 'Reminders', icon: '🔔' },
  { key: 'reports', label: 'Reports', icon: '📊' },
  { key: 'story', label: 'The Story So Far', icon: '📖' },
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
  { key: 'story', label: 'The Story So Far', icon: '📖' },
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
  // Real, server-computed counts of needsReview records per category -
  // drives the pulsing nav dots directly from actual data, not an
  // in-memory queue that could disagree with what's really been saved.
  pendingReviewIds: Record<ReviewCategory, string[]>;
  dashboardContent: ReactNode;
  serviceContent: ReactNode;
  fuelContent: ReactNode;
  modsContent: ReactNode;
  billsContent: ReactNode;
  remindersContent: ReactNode;
  reportsContent: ReactNode;
  storyContent: ReactNode;
  shareLinksContent: ReactNode;
}

function PendingDot() {
  return <span className={styles.navPendingBadge} aria-label="An entry here needs review" />;
}

export function DashboardShell({
  bikeName,
  bikeYear,
  currentMileage,
  distanceUnit,
  userEmail,
  bikes,
  activeBikeId,
  pendingReviewIds,
  dashboardContent,
  serviceContent,
  fuelContent,
  modsContent,
  billsContent,
  remindersContent,
  reportsContent,
  storyContent,
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
    story: storyContent,
    shareLinks: shareLinksContent,
  };

  const isMoreActive = active === 'bills' || active === 'reminders' || active === 'reports' || active === 'story' || active === 'shareLinks';

  return (
    <TabSwitchProvider onSwitchTab={(cat) => setActive(cat)}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarLogo}>
            <Link href="/">
              <img src="/logo.png" alt="RoadVerdict" />
            </Link>
          </div>

          <nav className={styles.sidebarNav}>
            {NAV_ITEMS.map((item) => {
              const reviewCategory = asReviewCategory(item.key);
              const hasPending = reviewCategory ? pendingReviewIds[reviewCategory].length > 0 : false;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.sidebarNavItem} ${active === item.key ? styles.sidebarNavItemActive : ''}`}
                  onClick={() => setActive(item.key)}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  {hasPending && <PendingDot />}
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
          {userEmail === DEMO_EMAIL && (
            <div style={{ marginTop: '0.6rem' }}>
              <ResetDemoButton />
            </div>
          )}
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
            const reviewCategory = asReviewCategory(item.key);
            const hasPending = reviewCategory ? pendingReviewIds[reviewCategory].length > 0 : false;
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
                {hasPending && (
                  <span style={{ position: 'absolute', top: 0, right: '30%' }}>
                    <PendingDot />
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
                const reviewCategory = asReviewCategory(item.key);
                const hasPending = reviewCategory ? pendingReviewIds[reviewCategory].length > 0 : false;
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
                    {hasPending && <PendingDot />}
                  </button>
                );
              })}
              <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                Signed in as {userEmail}
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <Link href="/garage" onClick={() => setShowMore(false)}>Manage bikes →</Link>
              </div>
              {userEmail === DEMO_EMAIL && (
                <div style={{ marginTop: '0.5rem' }}>
                  <ResetDemoButton />
                </div>
              )}
              <div style={{ marginTop: '0.5rem' }}>
                <LogoutButton />
              </div>
            </div>
          </>
        )}
      </div>
    </TabSwitchProvider>
  );
}
