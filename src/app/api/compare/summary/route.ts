// Place at: src/app/api/compare/summary/route.ts
//
// The AI-written summary on the garage comparison - the website's
// /garage/compare and the Android app's Compare screen both call this.
// See comparisonSummary.ts. generate: false asks only for a saved summary
// that still matches the data; generate: true writes one if there isn't.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getComparisonSummary } from "@/lib/tracker/comparisonSummary";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401, headers: NO_STORE });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400, headers: NO_STORE });
  }
  const { ids, from, to, generate } = (body ?? {}) as { ids?: unknown; from?: unknown; to?: unknown; generate?: unknown };
  if (!Array.isArray(ids) || ids.length > 10 || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "ids must be a list of vehicle ids." }, { status: 400, headers: NO_STORE });
  }
  for (const d of [from, to]) {
    if (d !== undefined && d !== null && d !== "" && (typeof d !== "string" || !DATE.test(d))) {
      return NextResponse.json({ error: "Dates must be YYYY-MM-DD." }, { status: 400, headers: NO_STORE });
    }
  }
  const period = from || to ? { from: (from as string) || undefined, to: (to as string) || undefined } : null;

  const result = await getComparisonSummary(session.email, ids as string[], period, generate === true);
  if (result.ok) return NextResponse.json({ summary: result.summary }, { headers: NO_STORE });
  if (result.reason === "not_pro") return NextResponse.json({ error: "Comparison summaries are part of Pro." }, { status: 403, headers: NO_STORE });
  if (result.reason === "invalid") return NextResponse.json({ error: "Pick 2 to 4 of your own vehicles to compare." }, { status: 400, headers: NO_STORE });
  return NextResponse.json({ error: "The summary couldn't be written just now. Try again in a moment." }, { status: 502, headers: NO_STORE });
}
