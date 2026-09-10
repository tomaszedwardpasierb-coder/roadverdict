// Place at: src/app/api/cars/car-bill-series/[id]/route.ts
// Car mirror of api/tracker/bill-series/[id]/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { endCarBillSeries } from "@/lib/tracker/carBillSeries";
import { getPrimaryCar, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { deleteCarRemindersBySourceKey } from "@/lib/tracker/carReminder";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carBillSeries::`)) {
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

  const car = await getPrimaryCar(session.email);
  if (car && isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const series = await endCarBillSeries(session.email, id);
  if (!series) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  if (car) {
    await deleteCarRemindersBySourceKey(session.email, car.id, `bill-series:${series.id}`);
  }

  return NextResponse.json({ series });
}
