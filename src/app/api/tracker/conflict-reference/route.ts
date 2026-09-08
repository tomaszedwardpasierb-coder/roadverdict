// Place at: src/app/api/tracker/conflict-reference/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getTrackerDocById } from "@/lib/tracker/cosmosHelpers";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";
import type { ServiceRecordDoc } from "@/lib/tracker/serviceRecord";
import type { FuelLogDoc } from "@/lib/tracker/fuelLog";
import type { ModDoc } from "@/lib/tracker/mod";
import type { BillDoc } from "@/lib/tracker/bill";
import type { CarServiceRecordDoc } from "@/lib/tracker/carServiceRecord";
import type { CarFuelLogDoc } from "@/lib/tracker/carFuelLog";
import type { CarModDoc } from "@/lib/tracker/carMod";
import type { CarBillDoc } from "@/lib/tracker/carBill";
import type { LabourDoc } from "@/lib/tracker/labour";
import type { CarLabourDoc } from "@/lib/tracker/carLabour";
import { LABOUR_LABELS } from "@/lib/tracker/labourTypes";
import { CAR_LABOUR_LABELS } from "@/lib/tracker/carLabourTypes";

export const dynamic = "force-dynamic";

// Read-only lookup used solely by the mileage-conflict-resolution modal
// (reached from the receipt-review queue, shared between vehicle kinds -
// see ReviewQueueModal.tsx) to show the OTHER entry in a detected
// conflict, including its own receipt image. Returns the category-
// specific fields (jobType/notes, litres-or-kwh/filledToFull, or
// modCategory/name/notes) alongside the summary ones - the modal needs
// the real values to correct this record's mileage without overwriting
// everything else with a placeholder, since the PATCH routes require a
// complete body, not a partial one.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const id = searchParams.get("id");
  const vehicleKind = searchParams.get("vehicleKind") === "car" ? "car" : "motorcycle";
  if (!id || !category || !["service", "fuel", "mods", "mot", "labour"].includes(category)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!id.startsWith(`${session.email}::`)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (category === "service") {
    const doc =
      vehicleKind === "car"
        ? await getTrackerDocById<CarServiceRecordDoc>(session.email, id)
        : await getTrackerDocById<ServiceRecordDoc>(session.email, id);
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const label = vehicleKind === "car" ? CAR_JOB_LABELS[doc.jobType] ?? doc.jobType : JOB_LABELS[doc.jobType] ?? doc.jobType;
    return NextResponse.json({
      id: doc.id, category: "service", date: doc.date, mileage: doc.mileage,
      label, cost: doc.cost,
      attachment: doc.attachments?.[0] ?? null,
      // Needed so a correction to this record's mileage can be saved
      // without overwriting its real job type and notes with a
      // placeholder - the PATCH route requires the complete field set,
      // not a partial patch.
      jobType: doc.jobType, notes: doc.notes,
    });
  }
  if (category === "fuel") {
    const doc =
      vehicleKind === "car"
        ? await getTrackerDocById<CarFuelLogDoc>(session.email, id)
        : await getTrackerDocById<FuelLogDoc>(session.email, id);
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    // A car fuel log may be a charging session (kwh, no litres at all) -
    // guard against calling .toFixed on undefined, the way the bike-only
    // FuelLogDoc.litres (never optional) never needed to.
    const carDoc = doc as Partial<CarFuelLogDoc>;
    const label =
      vehicleKind === "car" && carDoc.litres == null
        ? `${(carDoc.kwh ?? 0).toFixed(1)} kWh charge`
        : `${(doc.litres ?? 0).toFixed(1)}L fill-up`;
    return NextResponse.json({
      id: doc.id, category: "fuel", date: doc.date, mileage: doc.mileage,
      label, cost: doc.cost,
      attachment: doc.attachments?.[0] ?? null,
      litres: doc.litres, filledToFull: doc.filledToFull,
    });
  }
  if (category === "mot") {
    const doc =
      vehicleKind === "car"
        ? await getTrackerDocById<CarBillDoc>(session.email, id)
        : await getTrackerDocById<BillDoc>(session.email, id);
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({
      id: doc.id, category: "mot", date: doc.date, mileage: doc.mileage,
      label: "MOT test", cost: doc.cost,
      attachment: doc.attachments?.[0] ?? null,
      billType: doc.billType, notes: doc.notes,
    });
  }
  if (category === "labour") {
    const doc =
      vehicleKind === "car"
        ? await getTrackerDocById<CarLabourDoc>(session.email, id)
        : await getTrackerDocById<LabourDoc>(session.email, id);
    if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const label = vehicleKind === "car" ? CAR_LABOUR_LABELS[doc.category] ?? doc.category : LABOUR_LABELS[doc.category] ?? doc.category;
    return NextResponse.json({
      id: doc.id, category: "labour", date: doc.date, mileage: doc.mileage,
      label, cost: doc.cost,
      attachment: doc.attachments?.[0] ?? null,
      labourCategory: doc.category, notes: doc.notes,
    });
  }
  const doc =
    vehicleKind === "car"
      ? await getTrackerDocById<CarModDoc>(session.email, id)
      : await getTrackerDocById<ModDoc>(session.email, id);
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({
    id: doc.id, category: "mods", date: doc.date, mileage: doc.mileage,
    label: doc.name, cost: doc.cost,
    attachment: doc.attachments?.[0] ?? null,
    modCategory: doc.category, name: doc.name, notes: doc.notes,
  });
}
