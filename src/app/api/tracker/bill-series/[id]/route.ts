// Place at: src/app/api/tracker/bill-series/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { endBillSeries } from "@/lib/tracker/billSeries";
import { getPrimaryBike, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE } from "@/lib/tracker/bike";
import { deleteRemindersBySourceKey } from "@/lib/tracker/reminder";

export const dynamic = "force-dynamic";

// Only supported action is ending a plan (bike sold, insurance
// cancelled) - there's no "edit a series' terms" path. Ending stops all
// future materialisation and clears the plan's renewal reminder, but
// never touches instalments already written.
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::billSeries::`)) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { action } = body as { action?: string };
  if (action !== "end") {
    return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (bike && isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const series = await endBillSeries(session.email, id);
  if (!series) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  if (bike) {
    await deleteRemindersBySourceKey(session.email, bike.id, `bill-series:${series.id}`);
  }

  return NextResponse.json({ series });
}
