// Place at: src/lib/tracker/vdiCheckUsage.ts
//
// Per-account rate limit on the Buying Guide's free VDI/valuation
// add-on - same field+predicate+recorder shape as receiptRequest.ts's
// canSendReminder/recordReminderSent. Pro accounts never consult this at
// all (see the two buying-guide-lookup routes: Pro always gets VDI data,
// no cooldown check), so this only ever matters for free accounts.
import { getContainer } from "@/lib/cosmos";
import type { UserDoc } from "@/lib/tracker/userDoc";

export const VDI_CHECK_COOLDOWN_MS = 15 * 24 * 60 * 60 * 1000;

export function canRunFreeVdiCheck(user: UserDoc | null): boolean {
  if (!user?.vdiCheckUsage) return true;
  return Date.now() - new Date(user.vdiCheckUsage.lastRunAt).getTime() > VDI_CHECK_COOLDOWN_MS;
}

// Null once the cooldown has already elapsed (or never started) - a
// free run is available right now, so there is no "next" date to show.
export function nextFreeVdiCheckAt(user: UserDoc | null): string | null {
  if (!user?.vdiCheckUsage) return null;
  const nextMs = new Date(user.vdiCheckUsage.lastRunAt).getTime() + VDI_CHECK_COOLDOWN_MS;
  return nextMs > Date.now() ? new Date(nextMs).toISOString() : null;
}

export async function recordVdiCheckRun(email: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(email, email).read<UserDoc>();
  if (!resource) return;
  resource.vdiCheckUsage = { lastRunAt: new Date().toISOString() };
  await container.items.upsert(resource);
}
