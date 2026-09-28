// Shareable links: the shapes /api/app/share-links answers with, and the
// website's own routes the app makes and manages links through (the
// bike and car ones differ only in their path).
import type { GarageVehicle } from '@/lib/vehicle';

export type ShareDuration = '1week' | '1month' | '6months';

// The website's own choices (shareLink.ts's SHARE_LINK_DURATION_LABELS).
export const DURATIONS: { value: ShareDuration; label: string }[] = [
  { value: '1week', label: '1 week' },
  { value: '1month', label: '1 month' },
  { value: '6months', label: '6 months' },
];

// The share-link routes' own sanity limit on an asking price.
export const MAX_ASKING_PRICE = 200000;

export type ShareLink = {
  token: string;
  url: string;
  recipientEmail: string | null;
  // Always pounds, as on the website.
  askingPrice: number | null;
  createdAt: string;
  expiresAt: string | null;
  expired: boolean;
};

export type ReceiptAttachment = { fileName: string; fileType: 'image/jpeg' | 'image/png' | 'application/pdf'; path: string };
export type Decision = 'approved' | 'declined' | 'pending';

export type ReceiptRequest = {
  id: string;
  buyerEmail: string | null;
  buyerMessage: string | null;
  createdAt: string;
  items: {
    entryId: string;
    description: string;
    status: Decision;
    reason: string | null;
    priorDecline: { decidedAt: string; reason: string | null } | null;
    attachment: ReceiptAttachment | null;
  }[];
};

export type ShareLinksData = { links: ShareLink[]; requests: ReceiptRequest[] };

export function shareLinksPath(vehicle: GarageVehicle): string {
  return `/api/app/share-links?kind=${vehicle.kind}&id=${encodeURIComponent(vehicle.id)}`;
}

// Makes a link for the vehicle named in vehicleHeaders().
export function createLinkRoute(vehicle: GarageVehicle): string {
  return vehicle.kind === 'bike' ? '/api/tracker/share-link' : '/api/cars/car-share-link';
}

// One link's own route; /extend, /asking-price and /send-email hang off it.
export function linkRoute(vehicle: GarageVehicle, token: string): string {
  return `${createLinkRoute(vehicle)}/${encodeURIComponent(token)}`;
}

// Bike and car receipt requests alike.
export function decideRoute(requestId: string): string {
  return `/api/tracker/receipt-request/${encodeURIComponent(requestId)}/decide`;
}

// A typed asking price: blank is "no price", anything else must be a
// sensible amount. Returns undefined when it isn't.
export function parseAskingPrice(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 && value <= MAX_ASKING_PRICE ? value : undefined;
}

export function formatPounds(value: number): string {
  return `£${value.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`;
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDayTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDay(iso)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}
