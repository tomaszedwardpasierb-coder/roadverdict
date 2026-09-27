// What the app knows about logbook entries across all seven categories:
// which website route owns each one, and the full record the entry
// screen and the edit forms work from (/api/app/entry on the server).
import { router } from 'expo-router';

import type { EntryCategory, LogEntry } from '@/components/entry-row';
import { useApi } from '@/lib/use-api';
import { useVehicle, type GarageVehicle } from '@/lib/vehicle';

export type { EntryCategory } from '@/components/entry-row';

// The website's own routes: POST to add, and PATCH or DELETE on
// `<route>/<entry id>` to edit or remove - the same calls its cards make.
export const ENTRY_ROUTES: Record<EntryCategory, { bike: string; car: string }> = {
  fuel: { bike: '/api/tracker/fuel', car: '/api/cars/car-fuel' },
  service: { bike: '/api/tracker/services', car: '/api/cars/car-services' },
  mods: { bike: '/api/tracker/mods', car: '/api/cars/car-mods' },
  labour: { bike: '/api/tracker/labour', car: '/api/cars/car-labour' },
  bills: { bike: '/api/tracker/bills', car: '/api/cars/car-bills' },
  fines: { bike: '/api/tracker/fines', car: '/api/cars/car-fines' },
  tolls: { bike: '/api/tracker/tolls', car: '/api/cars/car-tolls' },
};

// Every category but fuel is one chosen type plus a cost - these are the
// field the type goes in, and whether a mileage or a name comes with it.
export type TypedCategory = Exclude<EntryCategory, 'fuel'>;

export const TYPED_FIELDS: Record<TypedCategory, { field: string; hasMileage: boolean; hasName?: boolean }> = {
  service: { field: 'jobType', hasMileage: true },
  mods: { field: 'category', hasMileage: true, hasName: true },
  labour: { field: 'category', hasMileage: true },
  bills: { field: 'billType', hasMileage: false },
  fines: { field: 'fineType', hasMileage: false },
  tolls: { field: 'tollType', hasMileage: false },
};

// Entry ids carry the owner's email and "::" separators, so they always
// go into a path encoded.
export function recordPath(vehicle: GarageVehicle, category: EntryCategory, id: string): string {
  return `${ENTRY_ROUTES[category][vehicle.kind]}/${encodeURIComponent(id)}`;
}

export type EntryDetail = {
  vehicle: GarageVehicle;
  entry: LogEntry & {
    typeKey: string | null;
    name: string | null;
    notes: string;
    // As stored (GBP, miles) - sent straight back for any field the
    // person didn't change, so an edit never re-converts a number.
    costGbp: number;
    mileageMiles: number | null;
    // In the vehicle's own currency and unit, for the forms.
    costDisplay: number;
    mileageDisplay: number | null;
    mileageEstimated: boolean;
    fuel: { amount: number; unit: 'L' | 'kWh'; filledToFull: boolean } | null;
    instalmentPlan: boolean;
    attachments: { fileName: string; fileType: 'image/jpeg' | 'image/png' | 'application/pdf'; path: string }[];
  };
};

export type Entry = EntryDetail['entry'];

export function useEntryDetail(category: EntryCategory, entryId: string) {
  const { selected } = useVehicle();
  return useApi<EntryDetail>(
    selected
      ? `/api/app/entry?kind=${selected.kind}&id=${encodeURIComponent(selected.id)}&category=${category}&entryId=${encodeURIComponent(entryId)}`
      : null
  );
}

// The entry exactly as stored - what "Looks right" sends to confirm a
// scanned entry. Saving through the website's edit route is itself the
// review there too: it clears the "check details" flag. Receipts are
// left out, which the routes read as "keep them as they are".
export function unchangedBody(entry: Entry): Record<string, unknown> {
  if (entry.category === 'fuel') {
    const fuel = entry.fuel ?? { amount: 0, unit: 'L', filledToFull: false };
    return {
      [fuel.unit === 'kWh' ? 'kwh' : 'litres']: fuel.amount,
      cost: entry.costGbp,
      mileage: entry.mileageMiles,
      date: entry.date,
      filledToFull: fuel.filledToFull,
    };
  }
  const typed = TYPED_FIELDS[entry.category];
  return {
    [typed.field]: entry.typeKey,
    ...(typed.hasName ? { name: entry.name } : {}),
    cost: entry.costGbp,
    date: entry.date,
    notes: entry.notes,
    ...(typed.hasMileage ? { mileage: entry.mileageMiles } : {}),
  };
}

export function openEntry(entry: { category: EntryCategory; id: string }) {
  router.push({ pathname: '/entry', params: { category: entry.category, id: entry.id } });
}

export function hasMileage(category: EntryCategory): boolean {
  return category === 'fuel' || TYPED_FIELDS[category].hasMileage;
}
