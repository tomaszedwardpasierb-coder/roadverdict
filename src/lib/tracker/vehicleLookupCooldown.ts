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

export function canRunVehicleLookup(user: UserDoc | null): boolean {
  if (!user?.vehicleLookupUsage) return true;
  return Date.now() - new Date(user.vehicleLookupUsage.lastRunAt).getTime() > VEHICLE_LOOKUP_COOLDOWN_MS;
}

export async function recordVehicleLookupRun(email: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(email, email).read<UserDoc>();
  if (!resource) return;
  resource.vehicleLookupUsage = { lastRunAt: new Date().toISOString() };
  await container.items.upsert(resource);
}
