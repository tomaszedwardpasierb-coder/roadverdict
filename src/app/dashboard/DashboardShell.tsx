// Place at: src/app/dashboard/DashboardShell.tsx
'use client';

import { startTransition, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { UpdateMileageButton } from './UpdateMileageButton';
import { RefreshVehicleDataButton } from './RefreshVehicleDataButton';
import { RefreshCarDataButton } from './RefreshCarDataButton';
import { VehicleSwitcher, type SwitcherVehicle } from './VehicleSwitcher';
import LogoutButton from './LogoutButton';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { TabSwitchProvider, type ReviewCategory } from './TabSwitchContext';
import { useActiveSection } from '@/components/ActiveSectionContext';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { ResetDemoButton } from './ResetDemoButton';
import { DEMO_EMAIL } from '@/lib/tracker/demoSeed';
import { Icon, type IconName } from './Icon';
import styles from './dashboard.module.css';
import type { Section } from './sections';

// Same safety-net idea as NavigationLoadingOverlay.tsx's own
// SAFETY_TIMEOUT_MS - the pendingTab spinner is normally cleared by the
// activeSection prop actually changing (see goToTab/its cleanup effect
// below), but this stops it sticking forever if that never happens.
const PENDING_TAB_SAFETY_TIMEOUT_MS = 12_000;

// Real-user click-to-visible timing for a tab switch, reported to
// Application Insights via /api/rum/tab-switch (see that route's own
// comment and lib/telemetry/rum.ts) - see DASHBOARD_LATENCY_HANDOVER.md's
// "Planned next steps" #1. Before this existed there was no way to see
// actual users' tab-switch duration, only synthetic Playwright/curl
// spot-checks against a demo account - this is additive visibility, not
// a dependency, so it fails silently (no navigator.sendBeacon, no
// network, a thrown error) rather than affecting the switch itself.
function reportTabSwitchTiming(tab: Section, durationMs: number, firstVisit: boolean) {
  try {
    const payload = JSON.stringify({ tab, durationMs, firstVisit });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/rum/tab-switch', new Blob([payload], { type: 'application/json' }));
    } else if (typeof fetch === 'function') {
      // sendBeacon isn't available in every environment (e.g. some in-app
      // browsers) - falls back to a fire-and-forget fetch that doesn't
      // block navigating away, same intent as sendBeacon's own design.
      fetch('/api/rum/tab-switch', { method: 'POST', body: payload, keepalive: true }).catch(() => {});
    }
  } catch {
    // Never let a telemetry failure surface to the user - see this
    // function's own top comment.
  }
}

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
      { key: 'fines', label: 'Fines', icon: 'fines' },
      { key: 'tolls', label: 'Tolls', icon: 'tolls' },
    ],
  },
  {
    groupKey: 'insights', groupLabel: 'Insights', groupIcon: 'insights', defaultExpanded: false, inBottomBar: true,
    items: [
      { key: 'reports', label: 'Reports', icon: 'reports' },
      { key: 'story', label: 'The Story So Far', icon: 'story' },
      { key: 'vault', label: 'The Vault', icon: 'vault' },
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
  // Server-computed cooldown for the "Refresh vehicle data" button (see
  // bike.ts/car.ts's canRefreshBikeData/canRefreshCarData) - one shared
  // pair of props since only one of the two buttons ever renders at a
  // time (see vehicleKind branch below).
  refreshAvailable: boolean;
  nextRefreshAvailableAt: string | null;
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
  finesContent: ReactNode;
  tollsContent: ReactNode;
  remindersContent: ReactNode;
  // Optional because CAR_UNAVAILABLE_SECTIONS could hide any of these
  // for a car-active session in principle - currently empty, so every
  // one of these is actually supplied for both vehicle kinds today.
  reportsContent?: ReactNode;
  storyContent?: ReactNode;
  vaultContent?: ReactNode;
  shareLinksContent?: ReactNode;
  transferOwnershipContent?: ReactNode;
  quoteCheckerContent?: ReactNode;
  costCalculatorContent?: ReactNode;
  buyingGuideContent?: ReactNode;
  privacyContent: ReactNode;
  securityContent: ReactNode;
  storyReady: boolean;
  hasIncomingRequest: boolean;
  // The tab dashboard/page.tsx actually built content for, driven by
  // /dashboard's own `?tab=` query param (defaulting to 'dashboard') -
  // re-supplied on every render (not just at mount), since every tab
  // switch is a real navigation that re-runs the server component.
  activeSection?: Section;
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
  refreshAvailable,
  nextRefreshAvailableAt,
  pendingReviewIds,
  hasPendingReceiptRequests,
  dashboardContent,
  serviceContent,
  fuelContent,
  modsContent,
  labourContent,
  billsContent,
  finesContent,
  tollsContent,
  remindersContent,
  reportsContent,
  storyContent,
  vaultContent,
  shareLinksContent,
  quoteCheckerContent,
  costCalculatorContent,
  buyingGuideContent,
  privacyContent,
  transferOwnershipContent,
  securityContent,
  storyReady,
  hasIncomingRequest,
  activeSection,
}: Props) {
  const router = useRouter();
  // Not local state: every tab switch is a real navigation (see goToTab
  // below), so dashboard/page.tsx always re-computes and re-passes
  // activeSection for whichever tab the URL now names - this plain
  // derived value picks that straight up on every render, including a
  // same-page ?tab=... transition (e.g. TwoFactorGate's "Go to Settings"
  // link, or the Stripe Buying Guide return) where this same
  // DashboardShell instance stays mounted and is simply re-rendered with
  // a new prop, never remounted.
  const active: Section = activeSection ?? 'dashboard';
  // Requests the server-built content for another tab - dashboard/
  // page.tsx reads this same `tab` query param to decide which single
  // tab's content to actually build, instead of building and shipping
  // all of them on every load. Router Cache makes a tab already visited
  // this session feel instant again; a first visit to a given tab pays
  // one real round trip.
  //
  // Unlike a client-side state flip, that round trip has no visual
  // feedback of its own - nothing here is an <a>, so the click-based
  // NavigationLoadingOverlay in the root layout never sees it (see its
  // own comment on why it only tracks <a> clicks and pathname changes,
  // neither of which apply to a same-page ?tab=... transition). pendingTab
  // is this component's own local stand-in for that: set the moment a
  // switch is requested, cleared once `active` actually changes to match
  // (see the effect below) - a click always reads as "accepted, working
  // on it" rather than looking frozen.
  const [pendingTab, setPendingTab] = useState<Section | null>(null);
  const pendingTabTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every tab reached so far this session (seeded with whichever one is
  // active on mount) - purely for reportTabSwitchTiming's own
  // `firstVisit` flag below, kept separate from mountedContentRef (which
  // exists lower down and actually holds rendered content) so this can
  // be read from goToTab without depending on that ref's declaration
  // order.
  const visitedSectionsRef = useRef<Set<Section>>(new Set([active]));
  // Set the moment a switch is requested, read and cleared once `active`
  // actually changes to match (see the effect below) - captures the
  // click-to-visible duration reportTabSwitchTiming sends.
  const pendingSwitchRef = useRef<{ tab: Section; start: number; firstVisit: boolean } | null>(null);
  function goToTab(key: Section) {
    if (key !== active) {
      setPendingTab(key);
      pendingSwitchRef.current = { tab: key, start: performance.now(), firstVisit: !visitedSectionsRef.current.has(key) };
      if (pendingTabTimeoutRef.current) clearTimeout(pendingTabTimeoutRef.current);
      pendingTabTimeoutRef.current = setTimeout(() => setPendingTab(null), PENDING_TAB_SAFETY_TIMEOUT_MS);
    }
    // Marks the resulting re-render as non-urgent, so the click itself
    // (the nav item's active/pending state above) paints immediately
    // instead of waiting behind the server round-trip this triggers.
    startTransition(() => {
      router.push(`/dashboard?tab=${key}`);
    });
  }
  // Warms the Router Cache for a tab before it's actually clicked - on
  // hover/focus for desktop/keyboard use, and on touchstart (which fires
  // before the click itself) for mobile, so a tab visited once already
  // this session, or one whose prefetch had time to land, opens close to
  // instantly instead of paying the full round trip on every click.
  function prefetchTab(key: Section) {
    router.prefetch(`/dashboard?tab=${key}`);
  }
  useEffect(() => {
    setPendingTab(null);
    if (pendingTabTimeoutRef.current) clearTimeout(pendingTabTimeoutRef.current);
    visitedSectionsRef.current.add(active);
    const pending = pendingSwitchRef.current;
    if (pending && pending.tab === active) {
      pendingSwitchRef.current = null;
      // One extra frame so this measures the tab's content actually
      // having painted, not just React having committed the DOM change -
      // the commit itself (when this effect runs) happens a frame before
      // the browser paints it.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          reportTabSwitchTiming(pending.tab, performance.now() - pending.start, pending.firstVisit);
        });
      });
    }
  }, [active]);
  useEffect(() => () => {
    if (pendingTabTimeoutRef.current) clearTimeout(pendingTabTimeoutRef.current);
  }, []);
  const [cancellingDeletion, setCancellingDeletion] = useState(false);
  // Mobile only: which bottom-bar "shelf" is currently open - either a
  // bottom-bar group's own key (its shelf shows just that group's items)
  // or 'more' (the catch-all sheet: Buying Tools, Reminders, Security,
  // Privacy, sign-out). Only ever one open at a time.
  const [openMobileSheet, setOpenMobileSheet] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(NAV_GROUPS.filter((g) => g.defaultExpanded).map((g) => g.groupKey))
  );
  const { setActiveSection, setVehicleKind } = useActiveSection();

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
          goToTab(item.key);
          onSelect?.();
        }}
        onMouseEnter={() => prefetchTab(item.key)}
        onFocus={() => prefetchTab(item.key)}
        onTouchStart={() => prefetchTab(item.key)}
      >
        {pendingTab === item.key ? (
          <VehicleSpinner kind={vehicleKind} size={18} className={styles.navIcon} />
        ) : (
          <Icon name={item.icon} className={styles.navIcon} />
        )}
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

  // Same lifecycle as the effect above, kept separate since it depends
  // on a different prop (vehicleKind never changes while this component
  // is mounted, active does) - see ActiveSectionContext.tsx's own
  // comment on why NavigationLoadingOverlay needs this.
  useEffect(() => {
    setVehicleKind(vehicleKind);
    return () => setVehicleKind(null);
  }, [vehicleKind, setVehicleKind]);

  const contentMap: Record<Section, ReactNode> = {
    dashboard: dashboardContent,
    service: serviceContent,
    fuel: fuelContent,
    mods: modsContent,
    labour: labourContent,
    bills: billsContent,
    fines: finesContent,
    tolls: tollsContent,
    reminders: remindersContent,
    reports: reportsContent,
    story: storyContent,
    vault: vaultContent,
    shareLinks: shareLinksContent,
    quoteChecker: quoteCheckerContent,
    costCalculator: costCalculatorContent,
    buyingGuide: buyingGuideContent,
    privacy: privacyContent,
    transferOwnership: transferOwnershipContent,
    security: securityContent,
  };

  // Every tab switch is a real navigation, and page.tsx only ever builds
  // the ONE tab named by `?tab=` on a given request - contentMap above
  // has exactly one defined entry per render, everything else is
  // `undefined`. Rendering `contentMap[active]` directly (as this used
  // to) means the single DOM slot holding "whichever tab is on screen"
  // swaps which component tree occupies it on every switch, which is a
  // full unmount of the outgoing tab and a fresh mount of the incoming
  // one - every Chart.js canvas rebuilt, every list re-rendered from
  // scratch, every in-progress form input reset, even when switching
  // back to a tab already visited this session.
  //
  // This cache remembers the last content received for every tab that's
  // been visited, keyed by section, so each one can get its own STABLE
  // position in the tree below instead of sharing one slot - switching
  // which one is visible then only ever toggles a `display` style, never
  // remounts anything. The trade-off (accepted deliberately, matching
  // the old DashboardTabs.tsx component this revives the idea from): a
  // half-filled form left on one tab now survives switching away and
  // back, rather than resetting; and every tab visited this session stays
  // mounted (and its data stale until revisited) rather than being torn
  // down when it's not the active one.
  // A ref, not state - mutated directly during render rather than from an
  // effect, so the newly-active tab's div (below) appears in the very
  // same paint its content arrives in. An effect-based update would only
  // run after commit, meaning the freshly-navigated-to tab would render
  // as blank for one extra frame before a second render filled it in.
  // Safe to mutate here because it's idempotent (re-assigning the same
  // key to the same content, as happens under StrictMode's double-render,
  // changes nothing observable) and content is only ever added, not
  // derived from anything that would make this non-deterministic.
  const mountedContentRef = useRef<Partial<Record<Section, ReactNode>>>({});
  if (contentMap[active] !== undefined) {
    mountedContentRef.current[active] = contentMap[active];
  }
  const mountedContent = mountedContentRef.current;

  // Self-maintaining: anything not Dashboard and not inside one of the
  // bottom-bar groups (Logbook/Insights/Selling) is "in More" - no future
  // tab addition needs a manual edit here again.
  const bottomBarGroupItemKeys = new Set(
    NAV_GROUPS.filter((g) => g.inBottomBar).flatMap((g) => g.items.map((item) => item.key))
  );
  const isMoreActive = active !== 'dashboard' && !bottomBarGroupItemKeys.has(active);

  return (
    <TabSwitchProvider onSwitchTab={(cat) => goToTab(cat)}>
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
          <div style={{ marginTop: '0.6rem' }}>
            {vehicleKind === 'bike' ? (
              <RefreshVehicleDataButton bikeId={activeVehicleId} available={refreshAvailable} nextAvailableAt={nextRefreshAvailableAt} />
            ) : (
              <RefreshCarDataButton carId={activeVehicleId} available={refreshAvailable} nextAvailableAt={nextRefreshAvailableAt} />
            )}
          </div>

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
              onClick={() => goToTab('privacy')}
              onMouseEnter={() => prefetchTab('privacy')}
              onFocus={() => prefetchTab('privacy')}
              onTouchStart={() => prefetchTab('privacy')}
            >
              {pendingTab === 'privacy' ? (
                <VehicleSpinner kind={vehicleKind} size={18} className={styles.navIcon} />
              ) : (
                <Icon name="privacy" className={styles.navIcon} />
              )}
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
          {(Object.keys(mountedContent) as Section[]).map((key) => (
            <div key={key} style={{ display: key === active ? 'block' : 'none' }}>
              {mountedContent[key]}
            </div>
          ))}
          {pendingTab && (
            <div className={styles.tabLoadingOverlay}>
              <div className={styles.tabLoadingCard}>
                <VehicleSpinner kind={vehicleKind} size={40} decorative={false} label="Loading tab" />
              </div>
            </div>
          )}
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
              goToTab('dashboard');
              setOpenMobileSheet(null);
            }}
            onMouseEnter={() => prefetchTab('dashboard')}
            onFocus={() => prefetchTab('dashboard')}
            onTouchStart={() => prefetchTab('dashboard')}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem',
              background: 'none', border: 'none', fontSize: '0.65rem',
              color: active === 'dashboard' ? 'var(--amber-ink)' : 'var(--ink-soft)',
              position: 'relative',
            }}
          >
            {pendingTab === 'dashboard' ? (
              <VehicleSpinner kind={vehicleKind} size={18} className={styles.navIcon} />
            ) : (
              <Icon name="dashboard" className={styles.navIcon} />
            )}
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
