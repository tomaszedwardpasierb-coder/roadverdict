// Place at: src/app/api/app/compare/route.ts
//
// The Android app's Compare screen - see lib/app/compareData.ts. Read-only.
// ?ids=a,b,c picks the vehicles; without it, just the list to pick from.
// Only the signed-in account's own vehicles can ever be picked.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAppComparison } from "@/lib/app/compareData";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 10);
  return NextResponse.json(await getAppComparison(session.email, ids), { headers: NO_STORE });
}
