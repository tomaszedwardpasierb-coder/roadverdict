// Place at: src/app/api/app/story/route.ts
//
// The Android app's The Story So Far for one of the signed-in owner's
// vehicles: its already-generated story and the "Getting ready to sell"
// section (see lib/app/storyData.ts). Read-only - generating a story
// goes through the web's own story-so-far routes. The vehicle is looked
// up inside the signed-in account's own partition, so an id belonging
// to anyone else simply isn't found.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getStory } from "@/lib/app/storyData";

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

  const data = await getStory(session.email, kind, id);
  if (!data) return NextResponse.json({ error: "Vehicle not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(data, { headers: NO_STORE });
}
