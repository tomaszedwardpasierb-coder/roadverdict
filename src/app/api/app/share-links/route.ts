// Place at: src/app/api/app/share-links/route.ts
//
// The Android app's Shareable links for one of the signed-in owner's
// vehicles (see lib/app/shareLinksData.ts): the links made for it and
// buyers' receipt requests waiting on a decision. Read-only - the app
// makes and manages links through the web's own share-link routes.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getShareLinks } from "@/lib/app/shareLinksData";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const params = req.nextUrl.searchParams;
  const kind = params.get("kind");
  const id = params.get("id");
  if ((kind !== "bike" && kind !== "car") || !id) {
    return NextResponse.json({ error: "kind (bike or car) and id are required" }, { status: 400, headers: NO_STORE });
  }

  const data = await getShareLinks(session.email, kind, id);
  if (!data) return NextResponse.json({ error: "Vehicle not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(data, { headers: NO_STORE });
}
