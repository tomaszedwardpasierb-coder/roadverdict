import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';

// The "Add a vehicle" choices (and Settings' currencies), fetched from the
// website so the app offers exactly its lists (see
// /api/app/vehicle-options on the server).
export type CarFuelType = 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'electric';

export type VehicleOptions = {
  bike: { makes: string[]; models: { make: string; model: string; engineCC: number }[] };
  car: { makes: string[]; models: { make: string; model: string }[]; fuelTypes: { value: CarFuelType; label: string }[] };
  regions: { value: string; label: string }[];
  defaultRegion: string;
  // For Settings: a vehicle's display currency.
  currencies: { value: string; label: string }[];
};

// One request per app session - the lists only change with a deploy.
let cached: VehicleOptions | null = null;

// The route is cached for an hour, on the phone too. Bump this whenever
// the shape above changes, so the app never reads an older copy that's
// missing a field (v2 added currencies).
const OPTIONS_PATH = '/api/app/vehicle-options?v=2';

export function useVehicleOptions() {
  const [options, setOptions] = useState<VehicleOptions | null>(cached);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Waits for an explicit retry after a failure, rather than looping.
    if (options || failed) return;
    let cancelled = false;
    apiFetch<VehicleOptions>(OPTIONS_PATH).then((r) => {
      if (cancelled) return;
      if (r.ok) {
        cached = r.data;
        setOptions(r.data);
      } else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [options, failed]);

  return { options, failed, retry: () => setFailed(false) };
}

// The web forms' matching of DVLA's free-text make and model against the
// curated lists: the make case-insensitively, then the model exactly, or
// failing that either name containing the other ("INTERCEPTOR 650 TWIN"
// finds "Interceptor 650"). No match is a normal outcome - the vehicle
// simply isn't in the list, and goes in as a custom entry.
export function matchMake(makes: string[], dvlaMake: string): string | null {
  const wanted = dvlaMake.trim().toLowerCase();
  return makes.find((m) => m.toLowerCase() === wanted) ?? null;
}

export function matchModel<M extends { model: string }>(models: M[], dvlaModel: string): M | null {
  const wanted = dvlaModel.trim().toLowerCase();
  if (!wanted) return null;
  return (
    models.find((m) => m.model.toLowerCase() === wanted) ??
    models.find((m) => wanted.includes(m.model.toLowerCase()) || m.model.toLowerCase().includes(wanted)) ??
    null
  );
}

// AddCarForm's reading of DVLA's fuel description. DVLA doesn't tell a
// hybrid from a plug-in hybrid, so both come back as "hybrid".
export function mapDvlaFuelType(raw: string): CarFuelType | null {
  const v = raw.toUpperCase();
  if (v.includes('HYBRID')) return 'hybrid';
  if (v === 'ELECTRICITY' || v.includes('ELECTRIC')) return 'electric';
  if (v.includes('DIESEL')) return 'diesel';
  if (v.includes('PETROL') || v.includes('GAS')) return 'petrol';
  return null;
}
