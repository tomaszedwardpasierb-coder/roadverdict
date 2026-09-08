// Place at: src/app/api/tracker/mileage-conflict-lookup/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getLabour } from "@/lib/tracker/labour";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarMods } from "@/lib/tracker/carMod";
import { getCarBills } from "@/lib/tracker/carBill";
import { getCarLabour } from "@/lib/tracker/carLabour";
import { checkMileageConsistency, type HistoryPoint } from "@/lib/tracker/mileageCheck";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { getPrimaryCar } from "@/lib/tracker/car";

export const dynamic = "force-dynamic";

// Re-runs the conflict check live, rather than trusting a stored
// reference - mileageConflictWarning on a record is just text, it was
// never persisted alongside which entry actually caused it, and
// re-checking is also naturally self-correcting if data has changed
// since the warning first appeared.
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

  if (vehicleKind === "car") {
    const car = await getPrimaryCar(session.email);
    if (!car) return NextResponse.json({ error: "No car found." }, { status: 404 });

    const [records, fuelLogs, mods, bills, labour] = await Promise.all([
      getCarServiceRecords(session.email, car.id),
      getCarFuelLogs(session.email, car.id),
      getCarMods(session.email, car.id),
      getCarBills(session.email, car.id),
      getCarLabour(session.email, car.id),
    ]);

    const target =
      category === "service" ? records.find((r) => r.id === id)
      : category === "fuel" ? fuelLogs.find((f) => f.id === id)
      : category === "mot" ? bills.find((b) => b.id === id)
      : category === "labour" ? labour.find((l) => l.id === id)
      : mods.find((m) => m.id === id);
    if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (target.mileage == null) {
      return NextResponse.json({ error: "This entry has no mileage recorded." }, { status: 404 });
    }

    const history: HistoryPoint[] = [
      ...records.map((r) => ({ id: r.id, category: "service" as const, date: r.date, mileage: r.mileage })),
      ...fuelLogs.map((f) => ({ id: f.id, category: "fuel" as const, date: f.date, mileage: f.mileage })),
      ...mods.map((m) => ({ id: m.id, category: "mods" as const, date: m.date, mileage: m.mileage })),
      ...bills.filter((b) => b.billType === "mot-test" && b.mileage != null).map((b) => ({ id: b.id, category: "mot" as const, date: b.date, mileage: b.mileage as number })),
      ...labour.map((l) => ({ id: l.id, category: "labour" as const, date: l.date, mileage: l.mileage })),
    ];

    const result = checkMileageConsistency(target.mileage, target.date, history, car.currentMileage, id);
    if (result.status !== "warning" || !result.referenceId || !result.referenceCategory) {
      return NextResponse.json({ error: "No current conflict found for this entry - it may have already been resolved." }, { status: 404 });
    }

    return NextResponse.json({ referenceId: result.referenceId, referenceCategory: result.referenceCategory });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) return NextResponse.json({ error: "No bike found." }, { status: 404 });

  const [records, fuelLogs, mods, bills, labour] = await Promise.all([
    getServiceRecords(session.email, bike.id),
    getFuelLogs(session.email, bike.id),
    getMods(session.email, bike.id),
    getBills(session.email, bike.id),
    getLabour(session.email, bike.id),
  ]);

  const target =
    category === "service" ? records.find((r) => r.id === id)
    : category === "fuel" ? fuelLogs.find((f) => f.id === id)
    : category === "mot" ? bills.find((b) => b.id === id)
    : category === "labour" ? labour.find((l) => l.id === id)
    : mods.find((m) => m.id === id);
  if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (target.mileage == null) {
    return NextResponse.json({ error: "This entry has no mileage recorded." }, { status: 404 });
  }

  const history: HistoryPoint[] = [
    ...records.map((r) => ({ id: r.id, category: "service" as const, date: r.date, mileage: r.mileage })),
    ...fuelLogs.map((f) => ({ id: f.id, category: "fuel" as const, date: f.date, mileage: f.mileage })),
    ...mods.map((m) => ({ id: m.id, category: "mods" as const, date: m.date, mileage: m.mileage })),
    ...bills.filter((b) => b.billType === "mot-test" && b.mileage != null).map((b) => ({ id: b.id, category: "mot" as const, date: b.date, mileage: b.mileage as number })),
    ...labour.map((l) => ({ id: l.id, category: "labour" as const, date: l.date, mileage: l.mileage })),
  ];

  const result = checkMileageConsistency(target.mileage, target.date, history, bike.currentMileage, id);
  if (result.status !== "warning" || !result.referenceId || !result.referenceCategory) {
    return NextResponse.json({ error: "No current conflict found for this entry - it may have already been resolved." }, { status: 404 });
  }

  return NextResponse.json({ referenceId: result.referenceId, referenceCategory: result.referenceCategory });
}
