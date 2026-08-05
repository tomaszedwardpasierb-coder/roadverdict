// Place at: src/app/api/tracker/scan-receipt/route.ts
//
// Parse-only now - reads one receipt photo and returns structured items,
// creates nothing in the database. The client collects results across
// every selected file, sorts the combined list into true chronological
// order, and sends that whole sorted batch to commit-receipt-items in
// one request - that's where records actually get created, in date
// order, so each one can see genuinely earlier ones as real anchors
// instead of estimating blind in upload order.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { parseReceiptFile } from "@/lib/tracker/receiptParse";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Receipt scanning isn't configured yet." }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  const result = await parseReceiptFile(file, apiKey, bike);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (result.items.length === 0) {
    const reasons: string[] = [];
    if (result.skippedBeforeProduction > 0) reasons.push(`dated before ${bike.year}, when this bike was made`);
    if (result.skippedNonPetrol > 0) reasons.push("not petrol - motorcycles run on petrol, so this wasn't logged");
    if (result.skippedUnreadableLitres > 0) reasons.push("the litres couldn't be read clearly enough to log automatically");
    return NextResponse.json(
      { error: reasons.length > 0 ? `Nothing to log from this receipt: ${reasons.join("; ")}.` : "Nothing usable was found on this receipt." },
      { status: 422 }
    );
  }

  return NextResponse.json(result);
}
