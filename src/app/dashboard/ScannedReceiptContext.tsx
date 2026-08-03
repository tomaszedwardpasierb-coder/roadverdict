// Place at: src/app/dashboard/ScannedReceiptContext.tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';

export type ScanCategory = 'service' | 'fuel' | 'mods' | 'bills';

export interface ScannedReceiptItem {
  id: string;
  category: ScanCategory;
  date: string;
  cost: number;
  description: string;
  litres: number | null;
  attachment: Attachment;
}

interface ContextValue {
  queue: ScannedReceiptItem[];
  addItems: (items: Omit<ScannedReceiptItem, 'id'>[]) => void;
  removeItem: (id: string) => void;
  goToNextPending: () => void;
}

const ScannedReceiptContext = createContext<ContextValue | null>(null);

// Deliberately placed above DashboardShell's tab-content swap (wrapping
// the WHOLE shell, sidebar included, not just the content area) - the
// sidebar nav needs to read this queue too, to show which tabs have
// something waiting, and a form deep inside one tab needs a way to ask
// the shell to switch to a different tab entirely once it's done.
export function ScannedReceiptProvider({
  children,
  onSwitchTab,
}: {
  children: ReactNode;
  onSwitchTab: (category: ScanCategory) => void;
}) {
  const [queue, setQueue] = useState<ScannedReceiptItem[]>([]);

  function addItems(items: Omit<ScannedReceiptItem, 'id'>[]) {
    const withIds: ScannedReceiptItem[] = items.map((item, i) => ({
      ...item,
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    setQueue((prev) => [...prev, ...withIds]);
  }

  function removeItem(id: string) {
    setQueue((prev) => prev.filter((i) => i.id !== id));
  }

  // Called after successfully saving an item that came from a scan -
  // jumps to whichever category still has something waiting, so the
  // person is guided straight through every split item without having to
  // go hunting for which tab needs them next.
  function goToNextPending() {
    setQueue((prev) => {
      if (prev.length > 0) onSwitchTab(prev[0].category);
      return prev;
    });
  }

  return (
    <ScannedReceiptContext.Provider value={{ queue, addItems, removeItem, goToNextPending }}>
      {children}
    </ScannedReceiptContext.Provider>
  );
}

export function useScannedReceipt(): ContextValue {
  const ctx = useContext(ScannedReceiptContext);
  if (!ctx) return { queue: [], addItems: () => {}, removeItem: () => {}, goToNextPending: () => {} };
  return ctx;
}
