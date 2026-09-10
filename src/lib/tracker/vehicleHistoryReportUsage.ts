// Place at: src/lib/tracker/vehicleHistoryReportUsage.ts
//
// Per-account cooldown on Pro's one free Buying Guide vehicle-history
// report every 4 weeks (see buyingGuideReportTier.ts/pricing.ts's
// PRO_FREE_REPORT_COOLDOWN_MS) - Pro-only, unlike
// valuationCheckUsage.ts's cooldown (which applies to both Free and Pro,
// just at different lengths). Same field+predicate+recorder shape as
// valuationCheckUsage.ts/receiptRequest.ts's canSendReminder/
// recordReminderSent.
import { getContainer } from "@/lib/cosmos";
import type { UserDoc } from "@/lib/tracker/userDoc";
import { PRO_FREE_REPORT_COOLDOWN_MS } from "@/lib/payments/pricing";

export function canRunFreeVehicleHistoryReport(user: UserDoc | null): boolean {
  if (!user?.vehicleHistoryReportUsage) return true;
  return Date.now() - new Date(user.vehicleHistoryReportUsage.lastRunAt).getTime() > PRO_FREE_REPORT_COOLDOWN_MS;
}

// Null once the cooldown has already elapsed (or never started) - a
// free report is available right now, so there is no "next" date to show.
export function nextFreeVehicleHistoryReportAt(user: UserDoc | null): string | null {
  if (!user?.vehicleHistoryReportUsage) return null;
  const nextMs = new Date(user.vehicleHistoryReportUsage.lastRunAt).getTime() + PRO_FREE_REPORT_COOLDOWN_MS;
  return nextMs > Date.now() ? new Date(nextMs).toISOString() : null;
}

export async function recordVehicleHistoryReportRun(email: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(email, email).read<UserDoc>();
  if (!resource) return;
  resource.vehicleHistoryReportUsage = { lastRunAt: new Date().toISOString() };
  await container.items.upsert(resource);
}
