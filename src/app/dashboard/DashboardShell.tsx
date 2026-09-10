// Place at: src/app/dashboard/DashboardShell.tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UpdateMileageButton } from './UpdateMileageButton';
import { RefreshVehicleDataButton } from './RefreshVehicleDataButton';
import { VehicleSwitcher, type SwitcherVehicle } from './VehicleSwitcher';
import LogoutButton from './LogoutButton';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { TabSwitchProvider, type ReviewCategory } from './TabSwitchContext';
import { useActiveSection } from '@/components/ActiveSectionContext';
import { ResetDemoButton } from './ResetDemoButton';
import { DEMO_EMAIL } from '@/lib/tracker/demoSeed';
import { Icon, type IconName } from './Icon';
import styles from './dashboard.module.css';

type Section = 'dashboard' | 'service' | 'fuel' | 'mods' | 'bills' | 'labour' | 'reminders' | 'reports' | 'shareLinks' | 'story' | 'quoteChecker' | 'costCalculator' | 'buyingGuide' | 'privacy' | 'transferOwnership' | 'security';

const REVIEW_CATEGORIES: ReviewCategory[] = ['service', 'fuel', 'mods', 'bills', 'labour'];
function asReviewCategory(key: string): ReviewCategory | null {
  return (REVIEW_CATEGORIES as string[]).includes(key) ? (key as ReviewCategory) : null;
}

interface NavItemDef {
  key: Section;
  label: string;
  icon: IconName;
}

interface NavGroupDef {
  groupKey: string;
  groupLabel: string;
  groupIcon: IconName;
  defaultExpanded: boolean;
  // Mobile only: whether this group gets its own bottom-bar icon (which
  // opens a small shelf of just its own items) rather than living inside
  // the "More" sheet alongside Reminders/Security/Privacy. Logbook/
  // Insights/Selling are common enough to earn a permanent slot; Buying
  // Tools stays folded into More.
  inBottomBar: boolean;
  items: NavItemDef[];
}

// Ungrouped top-level items, both on the desktop sidebar and (minus
// 'dashboard', which has its own bottom-bar icon there) the mobile More
// sheet. Privacy is deliberately not here - it keeps its own hardcoded
// button below the sidebar divider, and its own entry at the end of the
// More sheet, exactly as before this grouping existed.
const STANDALONE_ITEMS: NavItemDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'reminders', label: 'Reminders', icon: 'reminders' },
  // Label is "Settings" (profile, security, delete account, feedback -
  // see SettingsTab.tsx) - the key stays 'security' on purpose, that's
  // what DASHBOARD_TAB_LABELS/TAB_GROUP_LABELS in assistant/route.ts and
  // every existing test already reference; renaming the key itself
  // would ripple through all of those for a purely cosmetic label change.
  { key: 'security', label: 'Settings', icon: 'security' },
];

// Groups the flat 15-item sidebar used to be, into what the tabs actually
// are: day-to-day logging vs. the long-tail stuff. Logbook defaults open
// (it's the daily-use set); the other three default closed - that's
// where the real clutter was coming from. Shared by both the desktop
// sidebar and the mobile More sheet (see renderNavButton/isGroupExpanded
// below) so there's one definition of "what's in each group", not two
// hand-kept-in-sync lists.
const NAV_GROUPS: NavGroupDef[] = [
  {
    groupKey: 'logbook', groupLabel: 'Logbook', groupIcon: 'logbook', defaultExpanded: true, inBottomBar: true,
    items: [
      { key: 'service', label: 'Service', icon: 'service' },
      { key: 'fuel', label: 'Fuel', icon: 'fuel' },
      { key: 'mods', label: 'Parts & Accessories', icon: 'mods' },
      { key: 'bills', label: 'Insurance, Tax, MOT & Finance', icon: 'bills' },
      { key: 'labour', label: 'Labour', icon: 'labour' },
    ],
  },
  {
    groupKey: 'insights', groupLabel: 'Insights', groupIcon: 'insights', defaultExpanded: false, inBottomBar: true,
    items: [
      { key: 'reports', label: 'Reports', icon: 'reports' },
      { key: 'story', label: 'The Story So Far', icon: 'story' },
    ],
  },
  {
    groupKey: 'selling', groupLabel: 'Selling', groupIcon: 'selling', defaultExpanded: false, inBottomBar: true,
    items: [
      { key: 'shareLinks', label: 'Shareable Links', icon: 'shareLinks' },
      { key: 'transferOwnership', label: 'Transfer ownership', icon: 'transferOwnership' },
    ],
  },
  {
    groupKey: 'buyingTools', groupLabel: 'Buying Tools', groupIcon: 'buyingTools', defaultExpanded: false, inBottomBar: false,
    items: [
      { key: 'quoteChecker', label: 'Quote Checker', icon: 'quoteChecker' },
      { key: 'costCalculator', label: 'Cost calculator', icon: 'costCalculator' },
      { key: 'buyingGuide', label: 'Buying a used bike', icon: 'buyingGuide' },
    ],
  },
];

// Story/Shareable Links/Transfer ownership depend on BikeDoc fields
// CarDoc deliberately doesn't have yet (shareToken, storyCache, transfer
// semantics - see the ADR's "explicitly out of scope" list) - genuinely
// no car equivalent exists anywhere yet. Reports and the three embedded
// tools (Quote Checker/Cost Calculator/Buying Guide) both came off this
// list once their own car equivalents were built (see reportsContent/
// quoteCheckerContent/costCalculatorContent/buyingGuideContent in
// dashboard/page.tsx's renderCarDashboard). All hidden rather than shown
// broken/empty/wrong while a car is the active vehicle - their groups
// (Insights/Selling) still render for a car-active session, just empty
// (see sidebarNavEmptyGroupNote below), rather than disappearing
// entirely. Additive later: once each has a real car equivalent, it
// just comes off this list.
const CAR_UNAVAILABLE_SECTIONS: Section[] = [];
function availableFor(vehicleKind: 'bike' | 'car', items: NavItemDef[]) {
  return vehicleKind === 'bike' ? items : items.filter((item) => !CAR_UNAVAILABLE_SECTIONS.includes(item.key));
}

interface Props {
  vehicleKind: 'bike' | 'car';
  vehicleName: string;
  vehicleYear?: number;
  currentMileage: number;
  distanceUnit: DistanceUnit;
  userEmail: string;
  // Both optional - unset falls back to the existing email-initials
  // avatar and plain email display, exactly as before this existed.
  displayName?: string;
  hasAvatar?: boolean;
  // Set only while a self-serve deletion request is pending - drives
  // the red countdown banner above the tab content, regardless of
  // which tab is active.
  pendingDeletion?: { daysRemaining: number } | null;
  isPro: boolean;
  // Null whenever isPro is false - only ever shown alongside the
  // Premium badge itself, never on its own.
  proDaysRemaining?: number | null;
  vehicles: SwitcherVehicle[];
  activeVehicleId: string;
  // Real, server-computed counts of needsReview records per category -
  // drives the pulsing nav dots directly from actual data, not an
  // in-memory queue that could disagree with what's really been saved.
  pendingReviewIds: Record<ReviewCategory, string[]>;
  hasPendingReceiptRequests: boolean;
  dashboardContent: ReactNode;
  serviceContent: ReactNode;
  fuelContent: ReactNode;
  modsContent: ReactNode;
  labourContent: ReactNode;
  billsContent: ReactNode;
  remindersContent: ReactNode;
  // Optional because CAR_UNAVAILABLE_SECTIONS could hide any of these
  // for a car-active session in principle - currently empty, so every
  // one of these is actually supplied for both vehicle kinds today.
  reportsContent?: ReactNode;
  storyContent?: ReactNode;
  shareLinksContent?: ReactNode;
  transferOwnershipContent?: ReactNode;
  quoteCheckerContent?: ReactNode;
  costCalculatorContent?: ReactNode;
  buyingGuideContent?: ReactNode;
  privacyContent: ReactNode;
  securityContent: ReactNode;
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
  vehicleKind,
  vehicleName,
  vehicleYear,
  currentMileage,
  distanceUnit,
  userEmail,
  displayName,
  hasAvatar = false,
  pendingDeletion = null,
  isPro,
  proDaysRemaining = null,
  vehicles,
  activeVehicleId,
  pendingReviewIds,
  hasPendingReceiptRequests,
  dashboardContent,
  serviceContent,
  fuelContent,
  modsContent,
  labourContent,
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
  securityContent,
  storyReady,
  hasIncomingRequest,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState<Section>('dashboard');
  const [cancellingDeletion, setCancellingDeletion] = useState(false);
  // Mobile only: which bottom-bar "shelf" is currently open - either a
  // bottom-bar group's own key (its shelf shows just that group's items)
  // or 'more' (the catch-all sheet: Buying Tools, Reminders, Security,
  // Privacy, sign-out). Only ever one open at a time.
  const [openMobileSheet, setOpenMobileSheet] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(NAV_GROUPS.filter((g) => g.defaultExpanded).map((g) => g.groupKey))
  );
  const { setActiveSection } = useActiveSection();

  // A group also counts as expanded if the active tab lives inside it,
  // regardless of whether it was ever manually toggled open - e.g. a
  // goToNextReview() call from elsewhere in the app switching straight to
  // "reports" must not leave Insights looking collapsed with no visible
  // active state.
  function isGroupExpanded(group: NavGroupDef): boolean {
    return expandedGroups.has(group.groupKey) || group.items.some((item) => item.key === active);
  }
  function toggleGroup(groupKey: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }

  async function handleCancelDeletion() {
    setCancellingDeletion(true);
    try {
      await fetch('/api/account/cancel-deletion', { method: 'POST' });
      router.refresh();
    } finally {
      setCancellingDeletion(false);
    }
  }

  function itemHasPending(item: NavItemDef): boolean {
    const reviewCategory = asReviewCategory(item.key);
    if (reviewCategory) return pendingReviewIds[reviewCategory].length > 0;
    return item.key === 'shareLinks' && hasPendingReceiptRequests;
  }
  // Rolled-up "something in here needs attention" signal shown on a
  // group's own header, so it's worth expanding even when collapsed.
  // Takes the already vehicle-kind-filtered item list, so an empty car
  // group can never show a false dot.
  function groupHasSignal(visibleItems: NavItemDef[]): boolean {
    return visibleItems.some(itemHasPending)
      || (visibleItems.some((item) => item.key === 'story') && storyReady)
      || (visibleItems.some((item) => item.key === 'transferOwnership') && hasIncomingRequest);
  }

  // Static in NAV_GROUPS since that array is shared by both vehicle
  // kinds - only buyingGuide's label actually mentions the vehicle kind
  // by name, so this is the one spot needing an override rather than a
  // second, mostly-duplicate NAV_GROUPS for cars.
  function navLabelFor(item: NavItemDef): string {
    if (item.key === 'buyingGuide' && vehicleKind === 'car') return 'Buying a used car';
    return item.label;
  }

  // Shared by the desktop sidebar and the mobile More sheet - same icon,
  // label, and pending/ready/request dots either way, just a different
  // className and an optional extra close-the-sheet callback.
  function renderNavButton(item: NavItemDef, className: string, onSelect?: () => void) {
    return (
      <button
        key={item.key}
        type="button"
        className={className}
        onClick={() => {
          setActive(item.key);
          onSelect?.();
        }}
      >
        <Icon name={item.icon} className={styles.navIcon} />
        <span>{navLabelFor(item)}</span>
        {itemHasPending(item) && <PendingDot />}
        {item.key === 'story' && storyReady && <ReadyDot />}
        {item.key === 'transferOwnership' && hasIncomingRequest && <RequestDot />}
      </button>
    );
  }

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
    labour: labourContent,
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
    security: securityContent,
  };

  // Self-maintaining: anything not Dashboard and not inside one of the
  // bottom-bar groups (Logbook/Insights/Selling) is "in More" - no future
  // tab addition needs a manual edit here again.
  const bottomBarGroupItemKeys = new Set(
    NAV_GROUPS.filter((g) => g.inBottomBar).flatMap((g) => g.items.map((item) => item.key))
  );
  const isMoreActive = active !== 'dashboard' && !bottomBarGroupItemKeys.has(active);

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
            {renderNavButton(
              STANDALONE_ITEMS[0], // Dashboard - always first
              `${styles.sidebarNavItem} ${active === 'dashboard' ? styles.sidebarNavItemActive : ''}`
            )}
            {NAV_GROUPS.map((group) => {
              const visibleItems = availableFor(vehicleKind, group.items);
              const expanded = isGroupExpanded(group);
              return (
                <div key={group.groupKey} className={styles.sidebarNavGroup}>
                  <button
                    type="button"
                    className={styles.sidebarNavGroupHeader}
                    aria-expanded={expanded}
                    onClick={() => toggleGroup(group.groupKey)}
                  >
                    <Icon name={group.groupIcon} className={styles.navIcon} />
                    <span>{group.groupLabel}</span>
                    {groupHasSignal(visibleItems) && <PendingDot />}
                    <Icon name={expanded ? 'chevronDown' : 'chevronRight'} className={styles.navChevron} />
                  </button>
                  {expanded && (
                    <div className={styles.sidebarNavGroupItems}>
                      {visibleItems.length === 0 ? (
                        <p className={styles.sidebarNavEmptyGroupNote}>Not available for cars yet.</p>
                      ) : (
                        visibleItems.map((item) =>
                          renderNavButton(
                            item,
                            `${styles.sidebarNavItem} ${styles.sidebarNavItemIndented} ${active === item.key ? styles.sidebarNavItemActive : ''}`
                          )
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {STANDALONE_ITEMS.slice(1).map((item) =>
              renderNavButton(item, `${styles.sidebarNavItem} ${active === item.key ? styles.sidebarNavItemActive : ''}`)
            )}
          </nav>

          <VehicleSwitcher vehicles={vehicles} activeVehicleId={activeVehicleId} distanceUnit={distanceUnit} />
          <div style={{ marginTop: '0.6rem' }}>
            <UpdateMileageButton currentMileage={currentMileage} distanceUnit={distanceUnit} vehicleKind={vehicleKind} />
          </div>
          {/* No car equivalent yet (DVLA refresh + MOT import are both
              bike-only routes today) - hidden rather than wired to an
              endpoint that would 404 for a car. */}
          {vehicleKind === 'bike' && (
            <div style={{ marginTop: '0.6rem' }}>
              <RefreshVehicleDataButton bikeId={activeVehicleId} />
            </div>
          )}

          <div className={styles.sidebarUserFooter}>
            {hasAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/api/account/avatar" alt="Your avatar" width={32} height={32} style={{ borderRadius: '50%', objectFit: 'cover', width: '32px', height: '32px' }} />
            ) : (
              <div className={styles.sidebarUserAvatar}>{(displayName || userEmail).slice(0, 2).toUpperCase()}</div>
            )}
            <div className={styles.sidebarUserEmail}>{displayName || userEmail}</div>
            {isPro && (
              <span className={styles.proGateBadge} style={{ marginLeft: '0.4rem' }}>
                Premium
              </span>
            )}
          </div>
          {isPro && proDaysRemaining != null && (
            <div
              className={styles.sidebarUserEmail}
              style={{ marginTop: '0.2rem', color: proDaysRemaining <= 7 ? 'var(--amber-ink)' : undefined }}
            >
              {proDaysRemaining} day{proDaysRemaining === 1 ? '' : 's'} left
            </div>
          )}
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
            <strong>{vehicleName}</strong>
            <span>
              {vehicleYear ?? 'Custom build'} · {formatDistance(currentMileage, distanceUnit)}
            </span>
          </div>
          <UpdateMileageButton currentMileage={currentMileage} distanceUnit={distanceUnit} vehicleKind={vehicleKind} />
        </div>

        <div className={styles.content}>
          {pendingDeletion && (
            <div className={styles.budgetWarningBanner} style={{ marginBottom: '1.3rem' }}>
              ⚠ <strong>Pending deletion</strong> - your account will be permanently deleted in{' '}
              {pendingDeletion.daysRemaining} day{pendingDeletion.daysRemaining === 1 ? '' : 's'}.{' '}
              <button
                type="button"
                onClick={handleCancelDeletion}
                disabled={cancellingDeletion}
                style={{ background: 'none', border: 'none', padding: 0, textDecoration: 'underline', cursor: 'pointer', color: 'inherit', fontWeight: 600 }}
              >
                {cancellingDeletion ? 'Cancelling…' : 'Cancel deletion'}
              </button>
            </div>
          )}
          {contentMap[active]}
          {/* Every tab renders through this one container, so adding it
              here once - rather than into all 13 tab-content blocks in
              page.tsx - puts it at the true bottom of whichever tab is
              open, reachable by scrolling .content itself (the actually
              scrollable region - see the sidebarFooterNote/
              mobileMoreFooterNote comments above for why the public
              site's own <footer> can't be scrolled to from in here). */}
          <div className={styles.contentFooterNote}>
            RoadVerdict is guidance benchmarked against typical prices, not a professional inspection.{' '}
            <Link href="/privacy">Privacy</Link> · <Link href="/about">About us</Link> ·{' '}
            <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>
          </div>
        </div>

        <nav data-mobile-bottom-nav className={styles.mobileBottomNav}>
          <button
            type="button"
            onClick={() => {
              setActive('dashboard');
              setOpenMobileSheet(null);
            }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
              background: 'none', border: 'none', fontSize: '0.65rem',
              color: active === 'dashboard' ? 'var(--amber-ink)' : 'var(--ink-soft)',
              position: 'relative',
            }}
          >
            <Icon name="dashboard" className={styles.navIcon} />
            Dashboard
          </button>

          {NAV_GROUPS.filter((group) => group.inBottomBar).map((group) => {
            const visibleItems = availableFor(vehicleKind, group.items);
            const groupActive = visibleItems.some((item) => item.key === active);
            return (
              <button
                key={group.groupKey}
                type="button"
                onClick={() => setOpenMobileSheet((prev) => (prev === group.groupKey ? null : group.groupKey))}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
                  background: 'none', border: 'none', fontSize: '0.65rem',
                  color: groupActive || openMobileSheet === group.groupKey ? 'var(--amber-ink)' : 'var(--ink-soft)',
                  position: 'relative',
                }}
              >
                <Icon name={group.groupIcon} className={styles.navIcon} />
                {group.groupLabel}
                {groupHasSignal(visibleItems) && (
                  <span style={{ position: 'absolute', top: 0, right: '30%' }}>
                    <PendingDot />
                  </span>
                )}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setOpenMobileSheet((prev) => (prev === 'more' ? null : 'more'))}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
              background: 'none', border: 'none', fontSize: '0.65rem',
              color: isMoreActive || openMobileSheet === 'more' ? 'var(--amber-ink)' : 'var(--ink-soft)',
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

        {/* A bottom-bar group's own shelf - just its items, no Reminders/
            Security/Privacy/sign-out clutter alongside them. Closing (tap
            the backdrop, tap the item, or tap the same bottom-bar icon
            again) is the only way out. */}
        {openMobileSheet && openMobileSheet !== 'more' && (() => {
          const group = NAV_GROUPS.find((g) => g.groupKey === openMobileSheet);
          if (!group) return null;
          const visibleItems = availableFor(vehicleKind, group.items);
          return (
            <>
              <div className={styles.mobileMoreSheetBackdrop} onClick={() => setOpenMobileSheet(null)} />
              <div className={styles.mobileMoreSheet}>
                <div className={styles.mobileMoreSheetShelfTitle}>{group.groupLabel}</div>
                {visibleItems.length === 0 ? (
                  <p className={styles.sidebarNavEmptyGroupNote}>Not available for cars yet.</p>
                ) : (
                  visibleItems.map((item) => renderNavButton(item, styles.mobileMoreSheetItem, () => setOpenMobileSheet(null)))
                )}
              </div>
            </>
          );
        })()}

        {openMobileSheet === 'more' && (
          <>
            <div className={styles.mobileMoreSheetBackdrop} onClick={() => setOpenMobileSheet(null)} />
            <div className={styles.mobileMoreSheet}>
              {STANDALONE_ITEMS.filter((item) => item.key !== 'dashboard').map((item) =>
                renderNavButton(item, styles.mobileMoreSheetItem, () => setOpenMobileSheet(null))
              )}
              {NAV_GROUPS.filter((group) => !group.inBottomBar).map((group) => {
                const visibleItems = availableFor(vehicleKind, group.items);
                const expanded = isGroupExpanded(group);
                return (
                  <div key={group.groupKey} className={styles.mobileMoreSheetGroup}>
                    <button
                      type="button"
                      className={styles.mobileMoreSheetGroupHeader}
                      aria-expanded={expanded}
                      onClick={() => toggleGroup(group.groupKey)}
                    >
                      <Icon name={group.groupIcon} className={styles.navIcon} />
                      <span>{group.groupLabel}</span>
                      {groupHasSignal(visibleItems) && <PendingDot />}
                      <Icon name={expanded ? 'chevronDown' : 'chevronRight'} className={styles.navChevron} />
                    </button>
                    {expanded && (
                      visibleItems.length === 0 ? (
                        <p className={styles.sidebarNavEmptyGroupNote}>Not available for cars yet.</p>
                      ) : (
                        visibleItems.map((item) =>
                          renderNavButton(item, `${styles.mobileMoreSheetItem} ${styles.sidebarNavItemIndented}`, () => setOpenMobileSheet(null))
                        )
                      )
                    )}
                  </div>
                );
              })}
              {renderNavButton({ key: 'privacy', label: 'Privacy', icon: 'privacy' }, styles.mobileMoreSheetItem, () => setOpenMobileSheet(null))}
              <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                Signed in as {userEmail}
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <Link href="/garage" onClick={() => setOpenMobileSheet(null)}>Manage vehicles →</Link>
              </div>
              {userEmail === DEMO_EMAIL && (
                <div style={{ marginTop: '0.5rem' }}>
                  <ResetDemoButton />
                </div>
              )}
              <div style={{ marginTop: '0.5rem' }}>
                <LogoutButton />
              </div>
              <div className={styles.mobileMoreFooterNote}>
                RoadVerdict is guidance benchmarked against typical prices, not a professional inspection.{' '}
                <Link href="/privacy" onClick={() => setOpenMobileSheet(null)}>Privacy</Link> ·{' '}
                <Link href="/about" onClick={() => setOpenMobileSheet(null)}>About us</Link> ·{' '}
                <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>
              </div>
            </div>
          </>
        )}
      </div>
    </TabSwitchProvider>
  );
}
