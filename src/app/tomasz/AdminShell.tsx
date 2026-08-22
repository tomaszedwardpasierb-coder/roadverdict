// Place at: src/app/tomasz/AdminShell.tsx
'use client';

import { useState, type ReactNode } from 'react';
import { Activity, Server, Wrench, Users, Bell, MessageSquare, Database } from 'lucide-react';
import styles from './adminShell.module.css';

type Section = 'overview' | 'traffic' | 'jobs' | 'accounts' | 'notifications' | 'assistant' | 'database';

const NAV_ITEMS: { key: Section; label: string; icon: typeof Server }[] = [
  { key: 'overview', label: 'Overview', icon: Server },
  { key: 'traffic', label: 'Traffic & performance', icon: Activity },
  { key: 'jobs', label: 'Jobs & migrations', icon: Wrench },
  { key: 'accounts', label: 'Accounts & sessions', icon: Users },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'assistant', label: 'AI assistant', icon: MessageSquare },
  { key: 'database', label: 'Database', icon: Database },
];

interface Props {
  overviewContent: ReactNode;
  trafficContent: ReactNode;
  jobsContent: ReactNode;
  accountsContent: ReactNode;
  notificationsContent: ReactNode;
  assistantContent: ReactNode;
  databaseContent: ReactNode;
  logoutButton: ReactNode;
}

// data-admin-shell on the root element is a deliberate, stable marker -
// see the :has() rule in globals.css that hides the public site's
// header, footer, and assistant widget whenever this is present on the
// page. The root layout can't be made to skip rendering those for this
// one route without restructuring every other route in the app into
// separate route groups, which is a far larger, riskier change than
// hiding three elements with CSS.
export function AdminShell({
  overviewContent,
  trafficContent,
  jobsContent,
  accountsContent,
  notificationsContent,
  assistantContent,
  databaseContent,
  logoutButton,
}: Props) {
  const [active, setActive] = useState<Section>('overview');

  const contentMap: Record<Section, ReactNode> = {
    overview: overviewContent,
    traffic: trafficContent,
    jobs: jobsContent,
    accounts: accountsContent,
    notifications: notificationsContent,
    assistant: assistantContent,
    database: databaseContent,
  };

  const activeLabel = NAV_ITEMS.find((item) => item.key === active)?.label ?? '';

  return (
    <div data-admin-shell className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarHeaderTitle}>RoadVerdict</span>
          <span className={styles.sidebarHeaderSubtitle}>Admin</span>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                className={`${styles.navItem} ${active === item.key ? styles.navItemActive : ''}`}
                onClick={() => setActive(item.key)}
              >
                <ItemIcon size={16} strokeWidth={1.75} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className={styles.sidebarFooter}>{logoutButton}</div>
      </aside>

      <div className={styles.main}>
        <div className={styles.topBar}>
          <div className={styles.breadcrumb}>
            <span>Admin</span>
            <span className={styles.breadcrumbSeparator}>/</span>
            <span className={styles.breadcrumbCurrent}>{activeLabel}</span>
          </div>
        </div>
        <div className={styles.content}>{contentMap[active]}</div>
      </div>
    </div>
  );
}
