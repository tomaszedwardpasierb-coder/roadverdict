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
import { isInProTrial } from "@/lib/payments/proTrial";
import { replaceIfUnchanged } from "@/lib/tracker/atomicUpdate";

// Accounts tagged "tester" (the Play closed-test testers - see
// ACCOUNT_TAGS in userAccount.ts, which this deliberately doesn't import:
// it pulls in bike/subscriptions and the circular-import trap userDoc.ts
// documents) are given Pro from /tomasz so they can try every screen.
// Each free report is a paid data lookup, so theirs never come free;
// they can still buy one at the Pro price like anyone else.
function isTesterAccount(user: UserDoc | null): boolean {
  return user?.tags?.includes("tester") ?? false;
}

// A free Pro trial doesn't include it: each report costs a paid data
// lookup, so the free one starts with the first payment.
export function canRunFreeVehicleHistoryReport(user: UserDoc | null): boolean {
  if (isTesterAccount(user)) return false;
  if (isInProTrial(user)) return false;
  if (!user?.vehicleHistoryReportUsage) return true;
  return Date.now() - new Date(user.vehicleHistoryReportUsage.lastRunAt).getTime() > PRO_FREE_REPORT_COOLDOWN_MS;
}

// Null once the cooldown has already elapsed (or never started) - a
// free report is available right now, so there is no "next" date to show
// - and null for a tester, who never gets one.
export function nextFreeVehicleHistoryReportAt(user: UserDoc | null): string | null {
  // A tester's free report never arrives, so don't promise a date.
  if (isTesterAccount(user)) return null;
  if (isInProTrial(user)) return user!.plan!.trialEndsAt!;
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
