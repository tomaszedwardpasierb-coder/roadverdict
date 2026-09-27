import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { VehicleKind } from '@/lib/vehicle';

// The choices the logging forms offer, fetched from the website so both
// always offer the same lists (see /api/app/form-options on the server).
export type Option = { value: string; label: string };
export type OptionGroup = { label: string; options: Option[] };
export type ReminderDefault = { type: 'mileage' | 'months'; value: number; note?: string };

export type VehicleFormOptions = {
  service: { groups: OptionGroup[]; reminderDefaults: Record<string, ReminderDefault> };
  mods: { groups: OptionGroup[] };
  labour: { groups: OptionGroup[] };
  bills: { groups: OptionGroup[]; reminderDefaults: Record<string, ReminderDefault> };
  fines: { groups: OptionGroup[] };
  tolls: { groups: OptionGroup[] };
};

type AllOptions = { bike: VehicleFormOptions; car: VehicleFormOptions };

// One request per app session - the lists only change with a deploy.
let cached: AllOptions | null = null;
let inFlight: Promise<AllOptions | null> | null = null;

function load(): Promise<AllOptions | null> {
  if (cached) return Promise.resolve(cached);
  inFlight ??= apiFetch<AllOptions>('/api/app/form-options').then((r) => {
    inFlight = null;
    if (r.ok) cached = r.data;
    return r.ok ? r.data : null;
  });
  return inFlight;
}

export function useFormOptions(kind: VehicleKind | undefined) {
  const [options, setOptions] = useState<AllOptions | null>(cached);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Waits for an explicit retry after a failure, rather than looping.
    if (options || failed) return;
    let cancelled = false;
    load().then((o) => {
      if (cancelled) return;
      if (o) setOptions(o);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [options, failed]);

  return { options: kind && options ? options[kind] : null, failed, retry: () => setFailed(false) };
}

export function findLabel(groups: OptionGroup[], value: string): string | undefined {
  for (const g of groups) {
    const hit = g.options.find((o) => o.value === value);
    if (hit) return hit.label;
  }
  return undefined;
}
