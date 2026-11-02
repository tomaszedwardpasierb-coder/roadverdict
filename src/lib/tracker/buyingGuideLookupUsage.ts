// Place at: src/lib/tracker/buyingGuideLookupUsage.ts
//
// Per-account daily allowance on the Buying Guide's free lookup itself
// (MOT history + tax details - see buyingGuideLookupCache.ts for the
// separate, plate-level cache that sits alongside this). Unlike
// vehicleHistoryReportUsage.ts's cooldown (Pro-only, gates the paid VDI
// report), this applies to every account alike. Same
// field+predicate+recorder shape as vehicleHistoryReportUsage.ts/
// valuationCheckUsage.ts.
//
// It was one new plate per 30 days while every MOT lookup was a paid VDG
// call. DVSA's free MOT API made the MOT part free, so the allowance is now
// BUYING_GUIDE_FREE_LOOKUPS_PER_DAY new plates per UK day - enough for
// anyone shopping for a vehicle, and still a cap on the small tax lookup
// and the AI briefing each one costs. An older record holding only
// lastRunAt (no day) counts as nothing used today.
import type { UserDoc } from "@/lib/tracker/userDoc";
import { BUYING_GUIDE_FREE_LOOKUPS_PER_DAY } from "@/lib/payments/pricing";
import { replaceIfUnchanged } from "@/lib/tracker/atomicUpdate";

// The UK calendar day, as YYYY-MM-DD.
function ukDay(ms: number = Date.now()): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

// The moment the next UK day starts - midnight UTC, or 23:00 UTC the
// evening before while British Summer Time is on.
function nextUkMidnight(now: number = Date.now()): string {
  const [y, m, d] = ukDay(now).split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d + 1);
  const bstMidnight = utcMidnight - 60 * 60 * 1000;
  return new Date(ukDay(bstMidnight) === ukDay(utcMidnight) ? bstMidnight : utcMidnight).toISOString();
}

function usedToday(user: UserDoc | null): number {
  const usage = user?.buyingGuideLookupUsage;
  return usage?.day === ukDay() ? usage.count ?? 0 : 0;
}

export function canRunFreeBuyingGuideLookup(user: UserDoc | null): boolean {
  return usedToday(user) < BUYING_GUIDE_FREE_LOOKUPS_PER_DAY;
}

// Null while a free lookup is available right now, so there is no "next"
// date to show; otherwise the start of the next UK day.
export function nextFreeBuyingGuideLookupAt(user: UserDoc | null): string | null {
  return canRunFreeBuyingGuideLookup(user) ? null : nextUkMidnight();
}

// Takes the exact UserDoc + etag the caller already read to run
// canRunFreeBuyingGuideLookup in the first place, and writes the new
// count conditioned on nothing else having changed that document since -
// closes the race where two concurrent lookups could both pass the check
// before either write landed.
export async function recordBuyingGuideLookupRun(
  email: string,
  etag: string,
  baseUser: UserDoc
): Promise<{ recorded: boolean; alreadyUsed?: boolean }> {
  const result = await replaceIfUnchanged<UserDoc>(
    email,
    email,
    etag,
    baseUser,
    (doc) => ({
      ...doc,
      buyingGuideLookupUsage: { lastRunAt: new Date().toISOString(), day: ukDay(), count: usedToday(doc) + 1 },
    }),
    canRunFreeBuyingGuideLookup
  );
  if (result.ok) return { recorded: true };
  if (result.reason === "not_found") return { recorded: false };
  return { recorded: false, alreadyUsed: true };
}
