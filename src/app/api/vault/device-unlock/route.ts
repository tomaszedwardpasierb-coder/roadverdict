// Place at: src/app/api/vault/device-unlock/route.ts
//
// Opens the Vault from a trusted phone: the phone sends its secret only
// after its own fingerprint/face/PIN check (see trustedDevice.ts), in
// place of an authenticator code. Every other check is the same as
// /api/vault/reauth - signed in, Pro, two-factor still on, and the same
// failed-attempt limit - and it opens the same 10-minute Vault session.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isPro } from "@/lib/subscriptions";
import { isTwoFactorEnabled, checkTotpRateLimit, recordTotpAttempt } from "@/lib/auth/twoFactor";
import { verifyTrustedDevice } from "@/lib/auth/trustedDevice";
import { createVaultSession } from "@/lib/tracker/vaultSession";
import { lookupCountry, recordVaultAccess } from "@/lib/tracker/vaultAudit";
import { clientIpFromForwardedFor } from "@/lib/clientIp";

export const dynamic = "force-dynamic";

function getClientIp(req: NextRequest): string {
  return clientIpFromForwardedFor(req.headers.get("x-forwarded-for"));
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await isPro(session.email))) {
    return NextResponse.json({ error: "The Vault is a Premium feature." }, { status: 403 });
  }
  if (!(await isTwoFactorEnabled(session.email))) {
    return NextResponse.json({ error: "Enable two-factor authentication in Settings to use the Vault." }, { status: 403 });
  }
  if (!(await checkTotpRateLimit(session.email, "vault"))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { deviceId, secret } = body as { deviceId?: unknown; secret?: unknown };
  if (typeof deviceId !== "string" || typeof secret !== "string" || !(await verifyTrustedDevice(session.email, deviceId, secret))) {
    await recordTotpAttempt(session.email, "vault");
    // Its own code, so the app knows to forget this phone's trust and ask
    // for an authenticator code instead.
    return NextResponse.json({ error: "This phone isn't trusted any more.", code: "device_not_trusted" }, { status: 401 });
  }

  const country = await lookupCountry(getClientIp(request));
  const [{ cookieValue, maxAge }, previousAccess] = await Promise.all([
    createVaultSession(session.email),
    recordVaultAccess(session.email, { browser: "RoadVerdict Android app (fingerprint or PIN)", country }),
  ]);
  return NextResponse.json({ ok: true, previousAccess, vaultToken: cookieValue, expiresInSeconds: maxAge }, { headers: { "Cache-Control": "no-store" } });
}
