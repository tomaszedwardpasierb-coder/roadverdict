// Place at: src/lib/payments/buyingGuideVdiCheckout.ts
//
// Shared by both the bike and car buying-guide-vdi-checkout API routes,
// and by the buying-guide-lookup routes' own success-return self-heal -
// one place that knows how to create/verify a Stripe Checkout Session
// for the Buying Guide's standalone, pay-per-use VDI check, mirroring
// vdiCheckout.ts's own report-unlock flow but backed by a one-off
// vdiPurchase.ts doc instead of a field on a persistent share link
// (a Buying Guide lookup isn't tied to any share link at all).
import { getStripe } from "@/lib/payments/stripe";
import { BUYING_GUIDE_VDI_CHECK_PRICE_PENCE, BUYING_GUIDE_VDI_CHECK_PRODUCT_NAME } from "@/lib/payments/pricing";
import { createVdiPurchase, getVdiPurchase, markVdiPurchasePaid, type VdiPurchaseDoc } from "@/lib/tracker/vdiPurchase";
import type { VehicleKind } from "@/lib/tracker/vdiUnlock";

export type CreateBuyingGuideVdiCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: "creation_failed" };

function buyingGuidePath(vehicleKind: VehicleKind): string {
  return vehicleKind === "bike" ? "/buying-guide" : "/cars/buying-guide";
}

export async function createBuyingGuideVdiCheckoutSession(
  email: string,
  vrm: string,
  vehicleKind: VehicleKind,
  appUrl: string
): Promise<CreateBuyingGuideVdiCheckoutResult> {
  const purchase = await createVdiPurchase(email, vrm, vehicleKind);
  const path = buyingGuidePath(vehicleKind);
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      client_reference_id: purchase.id,
      metadata: { purchaseId: purchase.id, vehicleKind },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: BUYING_GUIDE_VDI_CHECK_PRICE_PENCE,
            product_data: { name: BUYING_GUIDE_VDI_CHECK_PRODUCT_NAME[vehicleKind] },
          },
        },
      ],
      success_url: `${appUrl}${path}?vdiPurchaseId=${purchase.id}&vrm=${encodeURIComponent(vrm)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}${path}`,
    });
    if (!session.url) return { ok: false, reason: "creation_failed" };
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("Buying Guide VDI checkout session creation failed:", err);
    return { ok: false, reason: "creation_failed" };
  }
}

// Covers the case where the browser returns from Stripe before the
// webhook has landed - the webhook remains the authoritative path for
// whenever the buyer closes the tab before returning, but this avoids
// making them wait on webhook latency for the common case. Re-verifies
// against Stripe directly rather than trusting the query params alone.
export async function selfHealBuyingGuideVdiPurchase(purchaseId: string, stripeSessionId: string): Promise<VdiPurchaseDoc | null> {
  const purchase = await getVdiPurchase(purchaseId);
  if (!purchase || purchase.status !== "pending") return purchase;
  try {
    const session = await getStripe().checkout.sessions.retrieve(stripeSessionId);
    if (session.payment_status !== "paid") return purchase;
    if (session.metadata?.purchaseId !== purchaseId) return purchase;
    return await markVdiPurchasePaid(purchaseId, session.id);
  } catch (err) {
    console.error("Buying Guide VDI purchase self-heal failed:", err);
    return purchase;
  }
}

// The webhook's own write - deliberately just the payment-confirmation
// state transition, same "keep the webhook minimal" reasoning as
// applyVdiUnlockFromWebhookSession in vdiCheckout.ts.
export async function applyBuyingGuideVdiPurchaseFromWebhookSession(
  purchaseId: string,
  session: { id: string }
): Promise<void> {
  const purchase = await getVdiPurchase(purchaseId);
  if (!purchase) {
    console.error(`Stripe webhook: no Buying Guide VDI purchase found for id ${purchaseId}.`);
    return;
  }
  await markVdiPurchasePaid(purchaseId, session.id);
}
