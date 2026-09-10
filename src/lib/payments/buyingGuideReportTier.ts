// Place at: src/lib/payments/buyingGuideReportTier.ts
//
// Computes which price tier a signed-in account should be charged for
// the Buying Guide's vehicle-history report - always server-side, from
// the account's own email, never trusting a client-supplied price or
// tier. Deliberately its own module rather than living in
// vdiPurchase.ts: it needs isPro (subscriptions.ts) and
// getBikesForUser/getCarsForUser (bike.ts/car.ts), and userDoc.ts's own
// comment documents the real circular-import trap
// (subscriptions -> userAccount -> bike -> subscriptions) that pulling
// those into a tracker/ file would risk.
import { isPro } from "@/lib/subscriptions";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { getBikesForUser, countActiveBikes } from "@/lib/tracker/bike";
import { getCarsForUser, countActiveCars } from "@/lib/tracker/car";
import { canRunFreeVehicleHistoryReport, nextFreeVehicleHistoryReportAt } from "@/lib/tracker/vehicleHistoryReportUsage";
import { BUYING_GUIDE_REPORT_PRICE_PENCE, type BuyingGuideReportTier } from "@/lib/payments/pricing";

export interface BuyingGuideReportTierResult {
  tier: BuyingGuideReportTier;
  pricePence: number;
  proFreeAvailable: boolean;
  nextFreeAt: string | null;
}

export async function computeBuyingGuideReportTier(email: string): Promise<BuyingGuideReportTierResult> {
  if (await isPro(email)) {
    const user = await getUserDoc(email);
    const free = canRunFreeVehicleHistoryReport(user);
    return {
      tier: "pro",
      pricePence: free ? 0 : BUYING_GUIDE_REPORT_PRICE_PENCE.pro,
      proFreeAvailable: free,
      nextFreeAt: free ? null : nextFreeVehicleHistoryReportAt(user),
    };
  }

  const [bikes, cars] = await Promise.all([getBikesForUser(email), getCarsForUser(email)]);
  const tier: BuyingGuideReportTier = countActiveBikes(bikes) + countActiveCars(cars) > 0 ? "freeWithVehicle" : "freeNoVehicle";
  return { tier, pricePence: BUYING_GUIDE_REPORT_PRICE_PENCE[tier], proFreeAvailable: false, nextFreeAt: null };
}
