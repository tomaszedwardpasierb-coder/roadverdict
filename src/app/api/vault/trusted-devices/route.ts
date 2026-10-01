// Place at: src/app/api/vault/trusted-devices/route.ts
//
// Trusts this phone to open the Vault with its fingerprint, face or PIN
// next time. Only while the Vault is open - so only straight after a real
// authenticator or backup code - and the phone gets its secret once, here,
// to keep in its own encrypted storage. See trustedDevice.ts.
import { NextRequest, NextResponse } from "next/server";
import { checkVaultGate } from "@/lib/tracker/vaultAccess";
import { createTrustedDevice, MAX_TRUSTED_DEVICES } from "@/lib/auth/trustedDevice";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const gate = await checkVaultGate(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { name } = body as { name?: unknown };

  const result = await createTrustedDevice(gate.email, typeof name === "string" ? name : "");
  if (!result.ok) {
    return NextResponse.json(
      { error: `You already trust ${MAX_TRUSTED_DEVICES} phones - remove one in Settings first.` },
      { status: 409 }
    );
  }
  return NextResponse.json({ device: result.device, deviceId: result.device.id, secret: result.secret }, { headers: { "Cache-Control": "no-store" } });
}
