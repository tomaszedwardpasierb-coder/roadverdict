// Place at: src/lib/tracker/reportAccess.ts
import { cookies } from "next/headers";
import { getContainer } from "@/lib/cosmos";
import { hashToken, generateToken } from "@/lib/auth/crypto";
import { getBike, type BikeDoc } from "@/lib/tracker/bike";
import { resolveShareToken } from "@/lib/tracker/shareLink";

const ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60; // a week - long enough that a buyer revisiting the link over a few days of deliberation isn't re-prompted, short enough that a stale cookie on a shared device doesn't stay valid indefinitely
const COOKIE_PREFIX = "rv_report_";

function cookieName(shareToken: string): string {
  // One cookie per report, not one shared cookie for all of them -
  // verifying access to report A must never imply access to report B.
  return `${COOKIE_PREFIX}${hashToken(shareToken).slice(0, 16)}`;
}

export function normalizePlate(plate: string): string {
  return plate.toUpperCase().replace(/\s+/g, "");
}

// Every registration the bike has ever held, not just the current one -
// a buyer told an older plate by mistake, or a listing photo showing a
// plate from just before a change, shouldn't be locked out over it.
export function allKnownPlates(bike: BikeDoc): string[] {
  const plates = new Set<string>();
  if (bike.originalRegistration) plates.add(normalizePlate(bike.originalRegistration));
  for (const change of bike.registrationChanges ?? []) plates.add(normalizePlate(change.plate));
  return [...plates];
}

export async function hasReportAccess(shareToken: string): Promise<boolean> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(cookieName(shareToken))?.value;
  if (!raw) return false;

  const container = getContainer();
  const hash = hashToken(raw);
  try {
    const { resource } = await container.item(hash, shareToken).read();
    if (!resource || resource.type !== "reportAccessSession") return false;
    if (new Date(resource.expiresAt) < new Date()) return false;
    return true;
  } catch {
    return false;
  }
}

export async function grantReportAccess(shareToken: string): Promise<{ cookieName: string; cookieValue: string; maxAge: number }> {
  const container = getContainer();
  const { raw, hash } = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCESS_TTL_SECONDS * 1000);

  await container.items.create({
    id: hash,
    pk: shareToken,
    type: "reportAccessSession",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    ttl: ACCESS_TTL_SECONDS,
  });

  return { cookieName: cookieName(shareToken), cookieValue: raw, maxAge: ACCESS_TTL_SECONDS };
}

const MAX_ATTEMPTS_PER_WINDOW = 8;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// Attempts (successful or not) are logged so the owner can eventually
// see "who's been trying to get in", not just be protected from brute
// forcing - accountability was as much the point as the block itself.
export async function checkPlateRateLimit(shareToken: string): Promise<{ allowed: boolean }> {
  const container = getContainer();
  const id = `plate-attempts:${shareToken}`;
  let resource: { attempts?: string[] } | undefined;
  try {
    const result = await container.item(id, shareToken).read();
    resource = result.resource;
  } catch {
    resource = undefined;
  }
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  const recentAttempts = (resource?.attempts ?? []).filter((t: string) => new Date(t).getTime() > cutoff);
  return { allowed: recentAttempts.length < MAX_ATTEMPTS_PER_WINDOW };
}

export async function recordPlateAttempt(shareToken: string): Promise<void> {
  const container = getContainer();
  const id = `plate-attempts:${shareToken}`;
  const now = new Date().toISOString();
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;

  let existing: { attempts?: string[] } | undefined;
  try {
    const result = await container.item(id, shareToken).read();
    existing = result.resource;
  } catch {
    existing = undefined;
  }
  const attempts = [...(existing?.attempts ?? []).filter((t: string) => new Date(t).getTime() > cutoff), now];

  await container.items.upsert({
    id,
    pk: shareToken,
    type: "reportPlateAttempts",
    attempts,
    // Cosmos TTL cleans this up automatically well after the rate-limit
    // window has passed - no separate cleanup job needed.
    ttl: 60 * 60 * 24,
  });
}

export async function verifyPlate(shareToken: string, submittedPlate: string): Promise<boolean> {
  const resolved = await resolveShareToken(shareToken);
  if (!resolved) return false;
  const bike = await getBike(resolved.email, resolved.bikeId);
  if (!bike) return false;
  const known = allKnownPlates(bike);
  if (known.length === 0) return false; // no registration on record at all - can't gate on something that doesn't exist
  return known.includes(normalizePlate(submittedPlate));
}


