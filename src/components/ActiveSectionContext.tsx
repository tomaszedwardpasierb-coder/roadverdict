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
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

interface ContextValue {
  activeSection: string | null;
  setActiveSection: (section: string | null) => void;
}

const ActiveSectionContext = createContext<ContextValue | null>(null);

export function ActiveSectionProvider({ children }: { children: ReactNode }) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  return (
    <ActiveSectionContext.Provider value={{ activeSection, setActiveSection }}>
      {children}
    </ActiveSectionContext.Provider>
  );
}

export function useActiveSection(): ContextValue {
  const ctx = useContext(ActiveSectionContext);
  if (!ctx) return { activeSection: null, setActiveSection: () => {} };
  return ctx;
}
