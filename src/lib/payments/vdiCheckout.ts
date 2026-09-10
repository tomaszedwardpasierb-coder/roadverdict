// Place at: src/lib/payments/vdiCheckout.ts
//
// Shared by both the bike and car vdi-checkout API routes, and by the
// detailed report pages' own success-return self-heal - one place that
// knows how to create/verify a Stripe Checkout Session for the
// Independent Vehicle Check, rather than duplicating Stripe SDK usage
// across four call sites.
import { getStripe } from "@/lib/payments/stripe";
import { VDI_CHECK_PRICE_PENCE, VDI_CHECK_PRODUCT_NAME } from "@/lib/payments/pricing";
import { resolveShareToken, updateShareLinkVdiUnlock } from "@/lib/tracker/shareLink";
import { resolveCarShareToken, updateCarShareLinkVdiUnlock } from "@/lib/tracker/carShareLink";
import type { VehicleKind, VdiUnlock } from "@/lib/tracker/vdiUnlock";

export type CreateVdiCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: "not_found" | "already_unlocked" | "creation_failed" };

function detailedPath(token: string, vehicleKind: VehicleKind): string {
  return vehicleKind === "bike" ? `/report/${token}/detailed` : `/car-report/${token}/detailed`;
}

export async function createVdiCheckoutSession(token: string, vehicleKind: VehicleKind, appUrl: string): Promise<CreateVdiCheckoutResult> {
  const resolved = vehicleKind === "bike" ? await resolveShareToken(token) : await resolveCarShareToken(token);
  if (!resolved) return { ok: false, reason: "not_found" };
  if (resolved.vdiUnlock) return { ok: false, reason: "already_unlocked" };

  const path = detailedPath(token, vehicleKind);
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      client_reference_id: token,
      metadata: { token, vehicleKind },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "gbp",
            unit_amount: VDI_CHECK_PRICE_PENCE[vehicleKind],
            product_data: { name: VDI_CHECK_PRODUCT_NAME[vehicleKind] },
          },
        },
      ],
      success_url: `${appUrl}${path}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}${path}`,
    });
    if (!session.url) return { ok: false, reason: "creation_failed" };
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("Stripe Checkout Session creation failed:", err);
    return { ok: false, reason: "creation_failed" };
  }
}

function unlockPatchFromSession(session: { id: string; amount_total: number | null; currency: string | null }, vehicleKind: VehicleKind): VdiUnlock {
  return {
    unlockedAt: new Date().toISOString(),
    stripeSessionId: session.id,
    amountPaidPence: session.amount_total ?? VDI_CHECK_PRICE_PENCE[vehicleKind],
    currency: session.currency ?? "gbp",
  };
}

// Covers the case where the browser returns from Stripe before the
// webhook has landed - the webhook remains the authoritative path for
// whenever the buyer closes the tab before returning, but this avoids
// making them wait on webhook latency for the common case. Re-verifies
// against Stripe directly rather than trusting the query param alone.
export async function selfHealVdiUnlock(token: string, vehicleKind: VehicleKind, stripeSessionId: string): Promise<VdiUnlock | null> {
  try {
    const session = await getStripe().checkout.sessions.retrieve(stripeSessionId);
    if (session.payment_status !== "paid") return null;
    if (session.metadata?.token !== token || session.metadata?.vehicleKind !== vehicleKind) return null;

    const patch = unlockPatchFromSession(session, vehicleKind);
    const updated =
      vehicleKind === "bike" ? await updateShareLinkVdiUnlock(token, patch) : await updateCarShareLinkVdiUnlock(token, patch);
    return updated?.vdiUnlock ?? null;
  } catch (err) {
    console.error("VDI unlock self-heal failed:", err);
    return null;
  }
}

// The webhook's own minimal, fast, reliable write - deliberately just
// the payment fields (see vdiUnlock.ts's own comment: the VDG fetch + AI
// summary are done lazily by the report page instead, kept out of the
// webhook's latency/failure path).
export async function applyVdiUnlockFromWebhookSession(
  token: string,
  vehicleKind: VehicleKind,
  session: { id: string; amount_total: number | null; currency: string | null }
): Promise<void> {
  const resolved = vehicleKind === "bike" ? await resolveShareToken(token) : await resolveCarShareToken(token);
  if (!resolved) {
    console.error(`Stripe webhook: no share link found for token from a completed VDI checkout (vehicleKind=${vehicleKind}).`);
    return;
  }
  // Already recorded this exact session - a Stripe webhook retry (or the
  // success-page self-heal already having run first) should never cause
  // a second, redundant write.
  if (resolved.vdiUnlock?.stripeSessionId === session.id) return;

  const patch = unlockPatchFromSession(session, vehicleKind);
  if (vehicleKind === "bike") await updateShareLinkVdiUnlock(token, patch);
  else await updateCarShareLinkVdiUnlock(token, patch);
}
