// Place at: src/app/api/app/entry/route.ts
//
// One logbook entry in full, for the Android app's entry screen and its
// edit forms: every field the web's own edit forms work with, its
// receipts, and the stored values the app sends back unchanged. Editing
// and deleting then go through the website's own routes for that
// category, exactly as the web cards do. The entry is looked up among the
// named vehicle's records inside the signed-in account's own partition,
// so an id belonging to anyone else simply isn't found.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { ENTRY_CATEGORIES, getEntryDetail, type EntryCategory } from "@/lib/app/homeData";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function isCategory(value: string | null): value is EntryCategory {
  return value !== null && (ENTRY_CATEGORIES as string[]).includes(value);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const params = req.nextUrl.searchParams;
  const kind = params.get("kind");
  const id = params.get("id");
  const category = params.get("category");
  const entryId = params.get("entryId");
  if ((kind !== "bike" && kind !== "car") || !id || !isCategory(category) || !entryId) {
    return NextResponse.json(
      { error: "kind (bike or car), id, category and entryId are required" },
      { status: 400, headers: NO_STORE }
    );
  }

  const data = await getEntryDetail(session.email, kind, id, category, entryId);
  if (!data) return NextResponse.json({ error: "Entry not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(data, { headers: NO_STORE });
}
