// Place at: src/app/dashboard/DashboardShell.tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { UpdateMileageButton } from './UpdateMileageButton';
import { RefreshVehicleDataButton } from './RefreshVehicleDataButton';
import { BikeSwitcher, type SwitcherBike } from './BikeSwitcher';
import LogoutButton from './LogoutButton';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { TabSwitchProvider, type ReviewCategory } from './TabSwitchContext';
import { useActiveSection } from '@/components/ActiveSectionContext';
import { ResetDemoButton } from './ResetDemoButton';
import { DEMO_EMAIL } from '@/lib/tracker/demoSeed';
import { Icon, type IconName } from './Icon';
import styles from './dashboard.module.css';

type Section = 'dashboard' | 'service' | 'fuel' | 'mods' | 'bills' | 'reminders' | 'reports' | 'shareLinks' | 'story' | 'quoteChecker' | 'costCalculator' | 'buyingGuide' | 'privacy' | 'transferOwnership';

const REVIEW_CATEGORIES: ReviewCategory[] = ['service', 'fuel', 'mods', 'bills'];
function asReviewCategory(key: string): ReviewCategory | null {
  return (REVIEW_CATEGORIES as string[]).includes(key) ? (key as ReviewCategory) : null;
}

const NAV_ITEMS: { key: Section; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'service', label: 'Service', icon: 'service' },
  { key: 'fuel', label: 'Fuel', icon: 'fuel' },
  { key: 'mods', label: 'Parts & Accessories', icon: 'mods' },
  { key: 'bills', label: 'Tax & Insurance', icon: 'bills' },
  { key: 'reminders', label: 'Reminders', icon: 'reminders' },
  { key: 'reports', label: 'Reports', icon: 'reports' },
  { key: 'story', label: 'The Story So Far', icon: 'story' },
  { key: 'shareLinks', label: 'Shareable Links', icon: 'shareLinks' },
  { key: 'quoteChecker', label: 'Quote Checker', icon: 'quoteChecker' },
  { key: 'costCalculator', label: 'Cost calculator', icon: 'costCalculator' },
  { key: 'buyingGuide', label: 'Buying a used bike', icon: 'buyingGuide' },
  { key: 'transferOwnership', label: 'Transfer ownership', icon: 'transferOwnership' },
];

const MOBILE_NAV_ITEMS: { key: Section; label: string; icon: IconName }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'service', label: 'Service', icon: 'service' },
  { key: 'fuel', label: 'Fuel', icon: 'fuel' },
  { key: 'mods', label: 'Parts', icon: 'mods' },
];

const MORE_ITEMS: { key: Section; label: string; icon: IconName }[] = [
  { key: 'bills', label: 'Tax & Insurance', icon: 'bills' },
  { key: 'reminders', label: 'Reminders', icon: 'reminders' },
  { key: 'reports', label: 'Reports', icon: 'reports' },
  { key: 'story', label: 'The Story So Far', icon: 'story' },
  { key: 'shareLinks', label: 'Shareable Links', icon: 'shareLinks' },
  { key: 'quoteChecker', label: 'Quote Checker', icon: 'quoteChecker' },
  { key: 'costCalculator', label: 'Cost calculator', icon: 'costCalculator' },
  { key: 'buyingGuide', label: 'Buying a used bike', icon: 'buyingGuide' },
  { key: 'transferOwnership', label: 'Transfer ownership', icon: 'transferOwnership' },
  { key: 'privacy', label: 'Privacy', icon: 'privacy' },
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
  hasPendingReceiptRequests: boolean;
  dashboardContent: ReactNode;
  serviceContent: ReactNode;
  fuelContent: ReactNode;
  modsContent: ReactNode;
  billsContent: ReactNode;
  remindersContent: ReactNode;
  reportsContent: ReactNode;
  storyContent: ReactNode;
  shareLinksContent: ReactNode;
  quoteCheckerContent: ReactNode;
  costCalculatorContent: ReactNode;
  buyingGuideContent: ReactNode;
  privacyContent: ReactNode;
  transferOwnershipContent: ReactNode;
  storyReady: boolean;
  hasIncomingRequest: boolean;
}

function PendingDot() {
  return <span className={styles.navPendingBadge} aria-label="An entry here needs review" />;
}

function RequestDot() {
  // Reuses the same pulsing badge as PendingDot above - visually
  // identical "something needs your attention" signal, just with an
  // accurate label for what's actually waiting here.
  return <span className={styles.navPendingBadge} aria-label="Someone is requesting this bike's history" />;
}

function ReadyDot() {
  return <span className={styles.navReadyBadge} aria-label="Enough logged history for a worthwhile story" />;
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
  hasPendingReceiptRequests,
  dashboardContent,
  serviceContent,
  fuelContent,
  modsContent,
  billsContent,
  remindersContent,
  reportsContent,
  storyContent,
  shareLinksContent,
  quoteCheckerContent,
  costCalculatorContent,
  buyingGuideContent,
  privacyContent,
  transferOwnershipContent,
  storyReady,
  hasIncomingRequest,
}: Props) {
  const [active, setActive] = useState<Section>('dashboard');
  const [showMore, setShowMore] = useState(false);
  const { setActiveSection } = useActiveSection();

  // Publishes which tab is open to the globally-mounted assistant widget
  // (see ActiveSectionContext.tsx's own comment for why this can't just
  // read `active` directly) - sends the raw Section key, not a label;
  // the assistant route maps it to a real, server-owned label itself
  // rather than trusting client-supplied text describing the tab.
  // Cleared on unmount so leaving the dashboard doesn't leave a stale
  // tab reference behind for whatever page comes next.
  useEffect(() => {
    setActiveSection(active);
    return () => setActiveSection(null);
  }, [active, setActiveSection]);

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
    quoteChecker: quoteCheckerContent,
    costCalculator: costCalculatorContent,
    buyingGuide: buyingGuideContent,
    privacy: privacyContent,
    transferOwnership: transferOwnershipContent,
  };

  const isMoreActive = active === 'bills' || active === 'reminders' || active === 'reports' || active === 'story' || active === 'shareLinks' || active === 'quoteChecker' || active === 'costCalculator' || active === 'buyingGuide' || active === 'privacy' || active === 'transferOwnership';

  return (
    <TabSwitchProvider onSwitchTab={(cat) => setActive(cat)}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarLogo}>
            <Link href="/">
              <img src="/logo-dark.png" alt="RoadVerdict" />
            </Link>
          </div>

          <nav className={styles.sidebarNav}>
            {NAV_ITEMS.map((item) => {
              const reviewCategory = asReviewCategory(item.key);
              const hasPending = reviewCategory ? pendingReviewIds[reviewCategory].length > 0 : (item.key === 'shareLinks' && hasPendingReceiptRequests);
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.sidebarNavItem} ${active === item.key ? styles.sidebarNavItemActive : ''}`}
                  onClick={() => setActive(item.key)}
                >
                  <Icon name={item.icon} className={styles.navIcon} />
                  <span>{item.label}</span>
                  {hasPending && <PendingDot />}
                  {item.key === 'story' && storyReady && <ReadyDot />}
                  {item.key === 'transferOwnership' && hasIncomingRequest && <RequestDot />}
                </button>
              );
            })}
          </nav>

          <BikeSwitcher bikes={bikes} activeBikeId={activeBikeId} distanceUnit={distanceUnit} />
          <div style={{ marginTop: '0.6rem' }}>
            <UpdateMileageButton currentMileage={currentMileage} distanceUnit={distanceUnit} />
          </div>
          <div style={{ marginTop: '0.6rem' }}>
            <RefreshVehicleDataButton bikeId={activeBikeId} />
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
          <div style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(255, 255, 255, 0.12)', paddingTop: '0.6rem' }}>
            <button
              type="button"
              className={`${styles.sidebarNavItem} ${active === 'privacy' ? styles.sidebarNavItemActive : ''}`}
              onClick={() => setActive('privacy')}
            >
              <Icon name="privacy" className={styles.navIcon} />
              <span>Privacy</span>
            </button>
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
            const hasPending = reviewCategory ? pendingReviewIds[reviewCategory].length > 0 : (item.key === 'shareLinks' && hasPendingReceiptRequests);
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
                <Icon name={item.icon} className={styles.navIcon} />
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
              position: 'relative',
            }}
          >
            <span style={{ fontSize: '1.1rem' }} aria-hidden="true">⋯</span>
            More
            {hasPendingReceiptRequests && (
              <span style={{ position: 'absolute', top: 0, right: '30%' }}>
                <PendingDot />
              </span>
            )}
          </button>
        </nav>

        {showMore && (
          <>
            <div className={styles.mobileMoreSheetBackdrop} onClick={() => setShowMore(false)} />
            <div className={styles.mobileMoreSheet}>
              {MORE_ITEMS.map((item) => {
                const reviewCategory = asReviewCategory(item.key);
                const hasPending = reviewCategory ? pendingReviewIds[reviewCategory].length > 0 : (item.key === 'shareLinks' && hasPendingReceiptRequests);
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
                    <Icon name={item.icon} className={styles.navIcon} /> {item.label}
                    {hasPending && <PendingDot />}
                    {item.key === 'story' && storyReady && <ReadyDot />}
                    {item.key === 'transferOwnership' && hasIncomingRequest && <RequestDot />}
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
