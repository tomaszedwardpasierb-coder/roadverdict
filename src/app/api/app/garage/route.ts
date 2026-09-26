// Place at: src/app/api/app/garage/route.ts
//
// The Android app's vehicle switcher: every bike and car on the account,
// plus the one to show first. Read-only.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getGarage } from "@/lib/app/homeData";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  return NextResponse.json(await getGarage(session.email), { headers: NO_STORE });
}
