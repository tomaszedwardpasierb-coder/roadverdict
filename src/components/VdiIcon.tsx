// Place at: src/components/VdiIcon.tsx
'use client';
//
// Same lucide-react stroke-icon approach as the dashboard's own
// src/app/dashboard/Icon.tsx (single-colour, currentColor, consistent
// stroke-width) - a separate module rather than extending that one,
// since this covers VDI report facts (a different concept space from
// dashboard nav items) and this file is shared by non-dashboard
// consumers (the standalone Buying Guide pages, the public report
// pages) that shouldn't need to import from src/app/dashboard/ for
// their icon needs. Deliberately not emoji - matches the plain, single-
// colour line-icon style used everywhere else in this app's UI chrome,
// for the same reason the dashboard nav isn't emoji either.
import {
  ShieldAlert,
  AlertTriangle,
  Landmark,
  Palette,
  Users,
  Hash,
  Gauge,
  Siren,
  Info,
  CalendarDays,
  Calendar,
  Layers,
  Globe,
  ArrowRightLeft,
  Recycle,
  Receipt,
  Cloud,
  Weight,
  Cog,
  Wrench,
  Fuel,
  Activity,
  ArrowUpRight,
  Timer,
  Volume2,
  Droplet,
  ClipboardCheck,
  Zap,
  PlugZap,
  BatteryCharging,
  Settings2,
  Map,
  Star,
  Armchair,
  Ruler,
  FileText,
  Scale,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

const ICONS = {
  stolen: ShieldAlert,
  writeOff: AlertTriangle,
  finance: Landmark,
  colour: Palette,
  keeperChanges: Users,
  plateChanges: Hash,
  mileage: Gauge,
  pnc: Siren,
  identity: Info,
  registration: CalendarDays,
  productionYears: Calendar,
  bodyType: Layers,
  origin: Globe,
  imported: ArrowRightLeft,
  scrapped: Recycle,
  tax: Receipt,
  co2: Cloud,
  weight: Weight,
  engine: Cog,
  transmission: Wrench,
  fuelTank: Fuel,
  performance: Activity,
  torque: ArrowUpRight,
  topSpeed: Timer,
  soundLevel: Volume2,
  fuelEconomy: Droplet,
  warranty: ClipboardCheck,
  ev: Zap,
  chargePort: PlugZap,
  battery: BatteryCharging,
  motor: Settings2,
  range: Map,
  ncap: Star,
  seats: Armchair,
  dimensions: Ruler,
  approvalCategory: FileText,
  powerToWeightRatio: Scale,
} as const;

export type VdiIconName = keyof typeof ICONS;

interface Props extends Omit<LucideProps, 'ref'> {
  name: VdiIconName;
}

// 15px/1.7 stroke-width matches the dashboard Icon component's own
// inline-context default (size={15} at call sites there) - these render
// inline within a line of report text, never as standalone empty-state
// icons, so there's no need for the dashboard's larger 26px variant here.
export function VdiIcon({ name, size = 15, strokeWidth = 1.7, ...rest }: Props) {
  const LucideIcon = ICONS[name];
  return <LucideIcon size={size} strokeWidth={strokeWidth} style={{ verticalAlign: '-2px', marginRight: '0.15rem' }} {...rest} />;
}
