// Place at: src/app/api/account/trusted-devices/route.ts
//
// The phones trusted to open the Vault with a fingerprint, face or PIN -
// listed in Settings on the website and in the app, so a lost phone can be
// cut off from anywhere.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { listTrustedDevices } from "@/lib/auth/trustedDevice";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const devices = await listTrustedDevices(session.email);
  return NextResponse.json({ devices }, { headers: { "Cache-Control": "private, no-store" } });
}
