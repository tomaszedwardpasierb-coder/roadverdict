import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { GarageVehicle } from '@/lib/vehicle';

// The date as the website's own <input type="date"> sends it: the
// person's local calendar day, not a UTC timestamp.
export function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The mileage field every logging form shares, with the web forms' rules
// (useEstimatedMileage): it starts on the current mileage, re-estimates
// for a past date from the vehicle's logged history, and stops
// overwriting the moment the person types their own figure.
export function useEstimatedMileage(vehicle: GarageVehicle | null, date: Date, token: string | null) {
  const [mileage, setMileageState] = useState(() => (vehicle ? String(vehicle.units.currentMileageDisplay) : ''));
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const isoDate = toIsoDay(date);

  useEffect(() => {
    if (!vehicle || touched) return;
    let cancelled = false;
    apiFetch<{ mileageDisplay: number | null; note: string | null }>(
      `/api/app/mileage-estimate?kind=${vehicle.kind}&id=${encodeURIComponent(vehicle.id)}&date=${isoDate}`,
      { token }
    ).then((result) => {
      if (cancelled || !result.ok) return;
      setMileageState(result.data.mileageDisplay != null ? String(result.data.mileageDisplay) : '');
      setNote(result.data.note);
    });
    return () => {
      cancelled = true;
    };
  }, [vehicle, isoDate, touched, token]);

  function setMileage(text: string) {
    setMileageState(text);
    setTouched(true);
    setNote(null);
  }

  return { mileage, setMileage, note };
}

// Accepts "12,4" as well as "12.4" - many phone keyboards only offer a comma.
export function parseNumber(text: string): number {
  const n = Number(text.replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
}

export function parseMileage(text: string): number {
  return parseNumber(text.replace(/[,\s]/g, ''));
}

export function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const short = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (toIsoDay(d) === toIsoDay(today)) return `Today, ${short}`;
  if (toIsoDay(d) === toIsoDay(yesterday)) return `Yesterday, ${short}`;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
