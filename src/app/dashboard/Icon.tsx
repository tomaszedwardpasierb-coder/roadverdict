// Place at: src/app/dashboard/Icon.tsx
'use client';

import { Gauge, Wrench, Droplet, Package, Shield, Bell, BarChart3, BookOpen, Share2, Receipt, Tag, Calendar, Camera } from 'lucide-react';
import type { LucideProps } from 'lucide-react';

// Maps this app's semantic icon names to their lucide-react component -
// keeps every call site referring to "what this icon means" (fuel,
// reminders...) rather than importing and naming a specific lucide
// component directly wherever it's used.
const ICONS = {
  dashboard: Gauge,
  service: Wrench,
  fuel: Droplet,
  mods: Package,
  bills: Shield,
  reminders: Bell,
  reports: BarChart3,
  story: BookOpen,
  shareLinks: Share2,
  // Stat-card icons - reuse the same underlying lucide component where
  // conceptually the same thing (Droplet for fuel economy, Gauge for
  // mileage) rather than importing a near-duplicate.
  totalSpend: Receipt,
  economy: Droplet,
  perMile: Tag,
  currentMiles: Gauge,
  spendThisYear: Calendar,
  camera: Camera,
} as const;

export type IconName = keyof typeof ICONS;

interface Props extends Omit<LucideProps, 'ref'> {
  name: IconName;
}

// Matches the design system's stroke-icon spec directly: lucide's own
// defaults already use round line caps/joins, so only stroke-width and
// the default render size need setting explicitly. 18px is the app's
// default context - callers pass size={15} for inline/small contexts
// or size={26} for empty-state icons, per the same spec.
// stroke="currentColor" is lucide's own default too, meaning an icon
// automatically matches whatever text colour its container already
// has - no separate colour logic needed for the active-nav-item case,
// for example, since that's just plain CSS colour inheritance.
export function Icon({ name, size = 18, strokeWidth = 1.7, ...rest }: Props) {
  const LucideIcon = ICONS[name];
  return <LucideIcon size={size} strokeWidth={strokeWidth} {...rest} />;
}
