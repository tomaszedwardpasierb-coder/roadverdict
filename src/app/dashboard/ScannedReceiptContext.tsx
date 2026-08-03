// Place at: src/app/dashboard/ScannedReceiptContext.tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';

export interface ScannedReceiptResult {
  category: 'service' | 'fuel' | 'mods' | 'bills';
  date: string;
  cost: number;
  description: string;
  litres: number | null;
  attachment: Attachment;
}

interface ContextValue {
  scanned: ScannedReceiptResult | null;
  setScanned: (r: ScannedReceiptResult | null) => void;
}

const ScannedReceiptContext = createContext<ContextValue | null>(null);

// Deliberately placed above DashboardShell's tab-content swap (inside
// DashboardShell itself, wrapping {contentMap[active]}) rather than
// inside any one tab's own content - each tab's form actually unmounts
// when you switch away (DashboardShell swaps which ReactNode renders, it
// doesn't just hide the others with CSS), so state living inside a form
// wouldn't survive "scan on Dashboard, then go confirm it on Service".
export function ScannedReceiptProvider({ children }: { children: ReactNode }) {
  const [scanned, setScanned] = useState<ScannedReceiptResult | null>(null);
  return <ScannedReceiptContext.Provider value={{ scanned, setScanned }}>{children}</ScannedReceiptContext.Provider>;
}

export function useScannedReceipt(): ContextValue {
  const ctx = useContext(ScannedReceiptContext);
  if (!ctx) return { scanned: null, setScanned: () => {} };
  return ctx;
}
