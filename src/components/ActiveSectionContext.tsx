// Place at: src/components/ActiveSectionContext.tsx
//
// The assistant widget is mounted once, globally, in the root layout -
// a sibling of the page content, not a descendant of DashboardShell's
// own tab state. This is the shared context that lets DashboardShell
// (deep inside {children}) tell the globally-mounted AssistantWidget
// which dashboard tab is currently open, the same way AssistantWidget
// already reads the open report from the URL for report pages. Outside
// the dashboard (public pages, report pages), nothing ever calls
// setActiveSection, so this stays null there - exactly the "no context
// to give" case AssistantWidget already handles.
//
// vehicleKind rides alongside activeSection for the same reason and the
// same lifecycle (set/cleared by DashboardShell's one effect) - it's
// what NavigationLoadingOverlay.tsx reads to theme its spinner correctly
// while inside the dashboard, where the URL alone (always just
// /dashboard) can't tell bike and car sessions apart the way public/
// report pages' own URLs already can.
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface ContextValue {
  activeSection: string | null;
  setActiveSection: (section: string | null) => void;
  vehicleKind: 'bike' | 'car' | null;
  setVehicleKind: (kind: 'bike' | 'car' | null) => void;
}

const ActiveSectionContext = createContext<ContextValue | null>(null);

export function ActiveSectionProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [vehicleKind, setVehicleKind] = useState<'bike' | 'car' | null>(null);
  return (
    <ActiveSectionContext.Provider value={{ activeSection, setActiveSection, vehicleKind, setVehicleKind }}>
      {children}
    </ActiveSectionContext.Provider>
  );
}

export function useActiveSection(): ContextValue {
  const ctx = useContext(ActiveSectionContext);
  if (!ctx) return { activeSection: null, setActiveSection: () => {}, vehicleKind: null, setVehicleKind: () => {} };
  return ctx;
}
