// Place at: src/app/api/app/account/route.ts
//
// The Android app's Settings screen (see lib/app/accountData.ts): the
// signed-in account's own name, two-factor status and any pending
// deletion. Read-only - every change goes through the website's own
// /api/account and /api/auth/totp routes, as the web settings do.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAccountSettings } from "@/lib/app/accountData";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  return NextResponse.json(await getAccountSettings(session.email), { headers: NO_STORE });
}
