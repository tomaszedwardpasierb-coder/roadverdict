// Place at: src/lib/tracker/vehicleLookupCooldown.ts
//
// Anti-spam-click floor for the handful of VDG-backed vehicle lookup
// routes that had NO cap at all before this: plate-lookup,
// mot-history-preview, mot-history (bike + car import), quote-lookup, and
// cost-calculator-lookup. One shared cooldown across all of them, not a
// separate one per route - otherwise bouncing between tools would dodge
// the limit entirely, e.g. hammering the same plate by alternating
// between Quote Checker and Cost Calculator.
//
// Deliberately short: this is a floor against literal rapid or scripted
// re-clicking, not the real monthly cost-budget enforcement - that's a
// separate, larger piece of work (a genuine per-account spend tracker)
// still pending real per-call VDG/Gemini costs. Comparing a handful of
// different vehicles in one sitting is normal use and should never be
// blocked by this; only a tight, repeated loop should be.
import { getContainer } from "@/lib/cosmos";
import type { UserDoc } from "@/lib/tracker/userDoc";

export const VEHICLE_LOOKUP_COOLDOWN_MS = 10 * 1000;

function samePlate(vrm: string): string {
  return vrm.toUpperCase().replace(/\s+/g, "");
}

// The plate looked up last is always let through again: adding a vehicle
// looks its plate up, reads its last MOT mileage and imports its MOT
// history within seconds of each other, and refusing the middle step left
// the mileage box empty with no MOT floor. One plate over and over is no
// threat to the budget (lookups of it are cached), so the floor still does
// its real job - stopping a run through many different plates.
export function canRunVehicleLookup(user: UserDoc | null, vrm?: string): boolean {
  const usage = user?.vehicleLookupUsage;
  if (!usage) return true;
  if (vrm && usage.lastVrm === samePlate(vrm)) return true;
  return Date.now() - new Date(usage.lastRunAt).getTime() > VEHICLE_LOOKUP_COOLDOWN_MS;
}

export async function recordVehicleLookupRun(email: string, vrm?: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(email, email).read<UserDoc>();
  if (!resource) return;
  resource.vehicleLookupUsage = { lastRunAt: new Date().toISOString(), ...(vrm ? { lastVrm: samePlate(vrm) } : {}) };
  await container.items.upsert(resource);
}
