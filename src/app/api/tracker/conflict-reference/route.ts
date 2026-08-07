// Place at: src/app/api/tracker/conflict-reference/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getTrackerDocById } from "@/lib/tracker/cosmosHelpers";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import type { ServiceRecordDoc } from "@/lib/tracker/serviceRecord";
import type { FuelLogDoc } from "@/lib/tracker/fuelLog";
import type { ModDoc } from "@/lib/tracker/mod";

export const dynamic = "force-dynamic";

// Read-only lookup used solely by the mileage-conflict-resolution modal
// to show the OTHER entry in a detected conflict, including its own
// receipt image - the check result only ever carries an id/category,
// never the full record.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const id = searchParams.get("id");
  if (!id || !category || !["service", "fuel", "mods"].includes(category)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!id.startsWith(`${session.email}::`)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (category === "service") {
    const doc = await getTrackerDocById<ServiceRecordDoc>(session.email, id);
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({
      id: doc.id, category: "service", date: doc.date, mileage: doc.mileage,
      label: JOB_LABELS[doc.jobType] ?? doc.jobType, cost: doc.cost,
      attachment: doc.attachments?.[0] ?? null,
    });
  }
  if (category === "fuel") {
    const doc = await getTrackerDocById<FuelLogDoc>(session.email, id);
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({
      id: doc.id, category: "fuel", date: doc.date, mileage: doc.mileage,
      label: `${doc.litres.toFixed(1)}L fill-up`, cost: doc.cost,
      attachment: doc.attachments?.[0] ?? null,
    });
  }
  const doc = await getTrackerDocById<ModDoc>(session.email, id);
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({
    id: doc.id, category: "mods", date: doc.date, mileage: doc.mileage,
    label: doc.name, cost: doc.cost,
    attachment: doc.attachments?.[0] ?? null,
  });
}
