// Place at: src/lib/motorcycleVed.ts
//
// Motorcycle vehicle tax (VED), copied from GOV.UK's rate tables - tax
// class TC17, "Motorcycles (with or without sidecar)" - and TC50 for
// tricycles. These are the rates that took effect on 1 April 2026. DVLA
// changes the amounts most Aprils (the engine-size boundaries rarely move):
// update them here, and the road tax guide and the running cost
// calculator both follow.
export const MOTORCYCLE_VED_CHECKED = '2026-10-07';

export type VedBandId = 'zero-emission' | 'up-to-150' | '151-400' | '401-600' | 'over-600';

export interface VedBand {
  id: VedBandId;
  label: string;
  // One payment for 12 months (the same by annual Direct Debit).
  twelveMonths: number;
  // Twelve monthly Direct Debit payments, added up - 5% more.
  monthlyTotal: number;
  // One payment for 6 months; null where GOV.UK doesn't offer it.
  sixMonths: number | null;
}

export const MOTORCYCLE_VED_BANDS: readonly VedBand[] = [
  { id: 'zero-emission', label: 'Electric (zero emission)', twelveMonths: 27, monthlyTotal: 28.35, sixMonths: null },
  { id: 'up-to-150', label: 'Up to 150cc', twelveMonths: 27, monthlyTotal: 28.35, sixMonths: null },
  { id: '151-400', label: '151cc to 400cc', twelveMonths: 59, monthlyTotal: 61.95, sixMonths: 32.45 },
  { id: '401-600', label: '401cc to 600cc', twelveMonths: 90, monthlyTotal: 94.5, sixMonths: 49.5 },
  { id: 'over-600', label: 'Over 600cc', twelveMonths: 125, monthlyTotal: 131.25, sixMonths: 68.75 },
];

// Tricycles not over 450kg unladen (TC50).
export const TRICYCLE_VED = { upTo150OrElectric: 27, allOther: 125 } as const;

export function vedBand(id: VedBandId): VedBand {
  return MOTORCYCLE_VED_BANDS.find((b) => b.id === id)!;
}

export function vedBandForEngineCc(cc: number): VedBand {
  if (cc <= 150) return vedBand('up-to-150');
  if (cc <= 400) return vedBand('151-400');
  if (cc <= 600) return vedBand('401-600');
  return vedBand('over-600');
}
