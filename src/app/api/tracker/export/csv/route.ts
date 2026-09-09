// Place at: src/app/api/tracker/export/csv/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { materializeAllDueForBike } from "@/lib/tracker/billSeries";
import { isBikeReadOnly, type BikeDoc } from "@/lib/tracker/bike";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { MOD_LABELS } from "@/lib/tracker/modTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import { resolveActiveVehicle } from "@/lib/tracker/activeVehicle";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarMods } from "@/lib/tracker/carMod";
import { getCarBills } from "@/lib/tracker/carBill";
import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";
import { CAR_MOD_LABELS } from "@/lib/tracker/carModTypes";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import type { CarDoc } from "@/lib/tracker/car";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

interface Row {
  date: string;
  type: string;
  description: string;
  cost: number;
  mileage: string;
  notes: string;
}

function toCsvResponse(rows: Row[], rawFilenamePart: string): NextResponse {
  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const header = "Date,Type,Description,Cost,Mileage,Notes";
  const lines = rows.map((r) =>
    [
      csvEscape(r.date),
      csvEscape(r.type),
      csvEscape(r.description),
      csvEscape(r.cost.toFixed(2)),
      csvEscape(r.mileage),
      csvEscape(r.notes),
    ].join(",")
  );
  const csv = [header, ...lines].join("\n");
  const filename = `${rawFilenamePart.replace(/[^a-z0-9-]/gi, "-")}-history.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function buildBikeCsvResponse(email: string, bike: BikeDoc): Promise<NextResponse> {
  // Same lazy-materialisation call as the dashboard, so an export taken
  // without ever loading the dashboard first still includes whatever an
  // instalment plan owes by today. Skipped for a transferred (read-only)
  // bike, same reasoning as the dashboard's own call.
  if (!isBikeReadOnly(bike)) {
    await materializeAllDueForBike(email, bike.id);
  }

  const [records, fuelLogs, mods, bills] = await Promise.all([
    getServiceRecords(email, bike.id),
    getFuelLogs(email, bike.id),
    getMods(email, bike.id),
    getBills(email, bike.id),
  ]);

  const rows: Row[] = [
    ...records.map((r) => ({
      date: r.date, type: "Service", description: JOB_LABELS[r.jobType] ?? r.jobType,
      cost: r.cost, mileage: String(r.mileage), notes: r.notes,
    })),
    ...fuelLogs.map((f) => ({
      date: f.date, type: "Fuel", description: `${f.litres.toFixed(1)}L${f.filledToFull ? " (full)" : ""}`,
      cost: f.cost, mileage: String(f.mileage), notes: "",
    })),
    ...mods.map((m) => ({
      date: m.date, type: "Modification", description: `${MOD_LABELS[m.category] ?? m.category}: ${m.name}`,
      cost: m.cost, mileage: String(m.mileage), notes: m.notes,
    })),
    ...bills.map((b) => ({
      date: b.date, type: "Bill", description: BILL_LABELS[b.billType] ?? b.billType,
      cost: b.cost, mileage: "", notes: b.notes,
    })),
  ];

  return toCsvResponse(rows, bike.nickname || bike.make || "roadverdict");
}

// Car equivalent of buildBikeCsvResponse - mirrored, not shared, same
// sister-schema convention as every other bike/car pair in this app.
// No materialize-due-instalments step here: recurring bill series
// (billSeries.ts) has no car equivalent yet, so there's nothing to
// materialize for a car's bills.
async function buildCarCsvResponse(email: string, car: CarDoc): Promise<NextResponse> {
  const [records, fuelLogs, mods, bills] = await Promise.all([
    getCarServiceRecords(email, car.id),
    getCarFuelLogs(email, car.id),
    getCarMods(email, car.id),
    getCarBills(email, car.id),
  ]);

  const rows: Row[] = [
    ...records.map((r) => ({
      date: r.date, type: "Service", description: CAR_JOB_LABELS[r.jobType] ?? r.jobType,
      cost: r.cost, mileage: String(r.mileage), notes: r.notes,
    })),
    ...fuelLogs.map((f) => ({
      date: f.date, type: "Fuel",
      description: f.fuelType === "electric" ? `${(f.kwh ?? 0).toFixed(1)} kWh` : `${(f.litres ?? 0).toFixed(1)}L${f.filledToFull ? " (full)" : ""}`,
      cost: f.cost, mileage: String(f.mileage), notes: "",
    })),
    ...mods.map((m) => ({
      date: m.date, type: "Modification", description: `${CAR_MOD_LABELS[m.category] ?? m.category}: ${m.name}`,
      cost: m.cost, mileage: String(m.mileage), notes: m.notes,
    })),
    ...bills.map((b) => ({
      date: b.date, type: "Bill", description: CAR_BILL_LABELS[b.billType] ?? b.billType,
      cost: b.cost, mileage: "", notes: b.notes,
    })),
  ];

  return toCsvResponse(rows, car.nickname || car.make || "roadverdict");
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Exports whichever vehicle the account is currently viewing (same
  // resolution the dashboard itself uses), not always the bike - an
  // account with a car but no bike used to get a 404 here, since this
  // route only ever looked for a bike.
  const activeVehicle = await resolveActiveVehicle(session.email);
  if (!activeVehicle) {
    return NextResponse.json({ error: "No vehicle found for this account." }, { status: 404 });
  }

  if (activeVehicle.kind === "car") {
    return buildCarCsvResponse(session.email, activeVehicle.car);
  }
  return buildBikeCsvResponse(session.email, activeVehicle.bike);
}
