// Place at: src/lib/tracker/vehicleHistoryReportUsage.ts
//
// Per-account cooldown on Pro's one free Buying Guide vehicle-history
// report every 4 weeks (see buyingGuideReportTier.ts/pricing.ts's
// PRO_FREE_REPORT_COOLDOWN_MS) - Pro-only, unlike
// valuationCheckUsage.ts's cooldown (which applies to both Free and Pro,
// just at different lengths). Same field+predicate+recorder shape as
// valuationCheckUsage.ts/receiptRequest.ts's canSendReminder/
// recordReminderSent.
import type { UserDoc } from "@/lib/tracker/userDoc";
import { PRO_FREE_REPORT_COOLDOWN_MS } from "@/lib/payments/pricing";
import { replaceIfUnchanged } from "@/lib/tracker/atomicUpdate";

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

// Takes the exact UserDoc + etag the caller already read to run
// canRunFreeVehicleHistoryReport in the first place (see getDocWithEtag),
// and writes the new lastRunAt conditioned on nothing else having
// changed that document since - see atomicUpdate.ts's own comment for
// why a plain read-then-upsert here let two concurrent requests both
// grant themselves the same month's free report.
export async function recordVehicleHistoryReportRun(
  email: string,
  etag: string,
  baseUser: UserDoc
): Promise<{ recorded: boolean; alreadyUsed?: boolean }> {
  const result = await replaceIfUnchanged<UserDoc>(
    email,
    email,
    etag,
    baseUser,
    (doc) => ({ ...doc, vehicleHistoryReportUsage: { lastRunAt: new Date().toISOString() } }),
    canRunFreeVehicleHistoryReport
  );
  if (result.ok) return { recorded: true };
  if (result.reason === "not_found") return { recorded: false };
  return { recorded: false, alreadyUsed: true };
}
