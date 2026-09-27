// Receipt scanning, on the website's own endpoints and rules:
//   1. POST the photo to /api/tracker/scan-receipt - the AI reads it and
//      the image is stored as the entry's attachment. Nothing is saved yet.
//   2. Commit each item in date order via /api/tracker/commit-receipt-item,
//      so every mileage estimate can lean on the entries saved before it.
//      Every committed entry starts flagged "needs review".
//   3. Clean items (mileage printed on the receipt, nothing suspicious)
//      are confirmed straight away; the rest wait for the person to check.
//      Confirming = re-saving the entry through its normal PATCH route,
//      which is the only thing that clears the review flag - exactly what
//      the web's ReviewQueueModal does.
import { File } from 'expo-file-system';

import { API_BASE_URL, apiFetch, type ApiResult } from '@/lib/api';
import { vehicleHeaders, type GarageVehicle } from '@/lib/vehicle';

export type ScanCategory = 'service' | 'fuel' | 'mods' | 'bills' | 'labour';

// The parts of the server's ParsedReceiptItem the app reads. The whole
// object is sent back unchanged when committing.
export type ParsedItem = {
  category: ScanCategory;
  date: string;
  costGbp: number;
  description: string;
  litres: number | null;
  mileageOnReceipt: number | null;
  forceReview: boolean;
  aiLowConfidence: boolean;
  [key: string]: unknown;
};

type EntryCommon = {
  id: string;
  aiDescription: string;
  duplicate: { id: string; date: string; cost: number; description: string } | null;
  plateMismatch: { registrationOnReceipt: string } | null;
  vehicleMismatch: { makeOnReceipt: string; modelOnReceipt: string | null } | null;
  date: string;
  cost: number;
  attachment: { blobName: string; [key: string]: unknown };
};

type MileageFields = {
  mileage: number;
  mileageNeedsManualEntry: boolean;
  mileageWarningText?: string;
};

export type ReviewEntry =
  | (EntryCommon & MileageFields & { category: 'service'; jobType: string; notes: string })
  | (EntryCommon & MileageFields & { category: 'fuel'; litres: number; filledToFull: boolean; tankCapacityLitres?: number })
  | (EntryCommon & MileageFields & { category: 'mods'; name: string; modCategory: string; notes: string })
  | (EntryCommon & MileageFields & { category: 'labour'; labourCategory: string; notes: string })
  | (EntryCommon & { category: 'bills'; billType: string; notes: string });

export const CATEGORY_LABEL: Record<ScanCategory, string> = {
  service: 'Service',
  fuel: 'Fuel',
  mods: 'Part',
  bills: 'Bill',
  labour: 'Labour',
};

const BIKE_ROUTE: Record<ScanCategory, string> = { service: 'services', fuel: 'fuel', mods: 'mods', bills: 'bills', labour: 'labour' };
const CAR_ROUTE: Record<ScanCategory, string> = {
  service: 'car-services',
  fuel: 'car-fuel',
  mods: 'car-mods',
  bills: 'car-bills',
  labour: 'car-labour',
};

export function entryRoute(entry: { category: ScanCategory; id: string }, vehicle: GarageVehicle): string {
  const base = vehicle.kind === 'car' ? `/api/cars/${CAR_ROUTE[entry.category]}` : `/api/tracker/${BIKE_ROUTE[entry.category]}`;
  return `${base}/${encodeURIComponent(entry.id)}`;
}

function serverKind(vehicle: GarageVehicle): 'car' | 'motorcycle' {
  return vehicle.kind === 'car' ? 'car' : 'motorcycle';
}

// Step 1. The photo goes up as an expo-file-system File: Expo's fetch
// (the global fetch in this SDK) only accepts parts it can read bytes
// from, and rejects React Native's older { uri, name, type } objects with
// "Unsupported FormDataPart implementation". The File supplies the
// filename and MIME type itself; the server accepts JPEG or PNG and
// re-checks the bytes.
export async function scanReceiptPhoto(
  photo: { uri: string },
  vehicle: GarageVehicle,
  token: string | null
): Promise<ApiResult<{ items: ParsedItem[]; summary: string | null }>> {
  const file = new File(photo.uri);
  if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
    return { ok: false, status: 0, error: 'That photo format isn’t supported - please choose a JPEG or PNG photo.' };
  }
  const form = new FormData();
  form.append('file', file);
  form.append('vehicleKind', serverKind(vehicle));
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/tracker/scan-receipt`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...vehicleHeaders(vehicle) },
      body: form,
    });
  } catch (err) {
    // In development, show the underlying reason - "network request
    // failed" alone hides whether it was the connection or the upload.
    const detail = __DEV__ ? ` (${err instanceof Error ? err.message : String(err)})` : '';
    return { ok: false, status: 0, error: `Can't reach RoadVerdict. Check your connection and try again.${detail}` };
  }
  const data = (await response.json().catch(() => null)) as { items?: ParsedItem[]; summary?: string | null; error?: string } | null;
  if (!response.ok || !data?.items) {
    return { ok: false, status: response.status, error: data?.error ?? 'The receipt couldn’t be read. Try a clearer, flatter photo.' };
  }
  return { ok: true, status: response.status, data: { items: data.items, summary: data.summary ?? null } };
}

// Step 2.
export async function commitItem(item: ParsedItem, vehicle: GarageVehicle, token: string | null): Promise<ApiResult<{ entry: ReviewEntry }>> {
  return apiFetch<{ entry: ReviewEntry }>('/api/tracker/commit-receipt-item', {
    method: 'POST',
    token,
    headers: vehicleHeaders(vehicle),
    body: { item, vehicleKind: serverKind(vehicle) },
  });
}

// The same body the web's review queue sends - the entry's own values,
// with any corrections applied.
export function reviewBody(entry: ReviewEntry, changes: { date?: string; cost?: number; mileage?: number; litres?: number } = {}) {
  const date = changes.date ?? entry.date;
  const cost = changes.cost ?? entry.cost;
  switch (entry.category) {
    case 'service':
      return { jobType: entry.jobType, cost, mileage: changes.mileage ?? entry.mileage, date, notes: entry.notes, mileageAcknowledged: true };
    case 'fuel':
      return {
        litres: changes.litres ?? entry.litres,
        cost,
        mileage: changes.mileage ?? entry.mileage,
        date,
        filledToFull: entry.filledToFull,
        mileageAcknowledged: true,
      };
    case 'mods':
      return { category: entry.modCategory, name: entry.name, cost, mileage: changes.mileage ?? entry.mileage, date, notes: entry.notes, mileageAcknowledged: true };
    case 'labour':
      return { category: entry.labourCategory, cost, mileage: changes.mileage ?? entry.mileage, date, notes: entry.notes, mileageAcknowledged: true };
    case 'bills':
      return { billType: entry.billType, cost, date, notes: entry.notes };
  }
}

// Step 3.
export async function saveReviewedEntry(
  entry: ReviewEntry,
  vehicle: GarageVehicle,
  token: string | null,
  changes?: Parameters<typeof reviewBody>[1]
): Promise<ApiResult<unknown>> {
  return apiFetch(entryRoute(entry, vehicle), { method: 'PATCH', token, headers: vehicleHeaders(vehicle), body: reviewBody(entry, changes) });
}

export async function deleteEntry(entry: ReviewEntry, vehicle: GarageVehicle, token: string | null): Promise<ApiResult<unknown>> {
  return apiFetch(entryRoute(entry, vehicle), { method: 'DELETE', token, headers: vehicleHeaders(vehicle) });
}

// Mirrors the web's checkLitresPlausibility (fuelPlausibility.ts): more
// than 15% over the tank's capacity (16 litres when unknown) is almost
// certainly a misread. The web only applies it to motorcycles.
const DEFAULT_TANK_CAPACITY_LITRES = 16;
const TANK_OVERFILL_MARGIN = 1.15;

export function litresLookWrong(entry: ReviewEntry, vehicle: GarageVehicle): boolean {
  if (entry.category !== 'fuel' || vehicle.kind === 'car') return false;
  const capacity = entry.tankCapacityLitres && entry.tankCapacityLitres > 0 ? entry.tankCapacityLitres : DEFAULT_TANK_CAPACITY_LITRES;
  return entry.litres > capacity * TANK_OVERFILL_MARGIN;
}

// The web's rule (ReviewQueueModal's classifyReceiptTier + isDirty): only
// a receipt with the mileage printed on it, and nothing else in question,
// is saved without a person looking at it.
export function needsPersonToCheck(entry: ReviewEntry, item: ParsedItem, vehicle: GarageVehicle): boolean {
  const mileagePrinted = typeof item.mileageOnReceipt === 'number';
  if (!mileagePrinted) return true;
  if (entry.duplicate || entry.plateMismatch || entry.vehicleMismatch) return true;
  if (item.forceReview || item.aiLowConfidence) return true;
  if (entry.category !== 'bills' && entry.mileageNeedsManualEntry) return true;
  return litresLookWrong(entry, vehicle);
}

// Plain-language reasons to show on a review card.
export function reviewReasons(entry: ReviewEntry, item: ParsedItem, vehicle: GarageVehicle, money: (gbp: number) => string): string[] {
  const noun = vehicle.kind === 'car' ? 'car' : 'bike';
  const reasons: string[] = [];
  if (entry.duplicate) {
    reasons.push(
      `This may already be in your logbook: ${entry.duplicate.description}, ${formatDay(entry.duplicate.date)}, ${money(entry.duplicate.cost)}. Delete this one if it’s the same.`
    );
  }
  if (entry.plateMismatch) reasons.push(`The receipt shows registration ${entry.plateMismatch.registrationOnReceipt}, which isn’t this ${noun}’s.`);
  if (entry.vehicleMismatch) {
    const v = [entry.vehicleMismatch.makeOnReceipt, entry.vehicleMismatch.modelOnReceipt].filter(Boolean).join(' ');
    reasons.push(`The receipt looks like it’s for a ${v}, not this ${noun}.`);
  }
  if (item.forceReview) reasons.push('The receipt is in another currency - check the converted amount.');
  if (item.aiLowConfidence) reasons.push('The receipt was hard to read - check every figure.');
  if (entry.category !== 'bills') {
    if (entry.mileageNeedsManualEntry) reasons.push('There’s no mileage on the receipt and not enough history to estimate it - please enter it.');
    else if (entry.mileageWarningText) reasons.push(entry.mileageWarningText);
    else if (typeof item.mileageOnReceipt !== 'number') reasons.push('There’s no mileage on the receipt, so it’s been estimated from your history - check it.');
  }
  if (litresLookWrong(entry, vehicle) && entry.category === 'fuel') {
    reasons.push(`${entry.litres.toFixed(1)} litres is more than this bike’s tank holds - it may have been misread.`);
  }
  return reasons;
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
