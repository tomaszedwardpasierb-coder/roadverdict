// Place at: src/app/api/tracker/export/csv/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getBike } from "@/lib/tracker/bike";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { MOD_LABELS } from "@/lib/tracker/modTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number): string {
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const bike = await getBike(session.email);
  const [records, fuelLogs, mods, bills] = await Promise.all([
    getServiceRecords(session.email),
    getFuelLogs(session.email),
    getMods(session.email),
    getBills(session.email),
  ]);

  interface Row {
    date: string;
    type: string;
    description: string;
    cost: number;
    mileage: string;
    notes: string;
  }

  const rows: Row[] = [
    ...records.map((r) => ({
      date: r.date,
      type: "Service",
      description: JOB_LABELS[r.jobType] ?? r.jobType,
      cost: r.cost,
      mileage: String(r.mileage),
      notes: r.notes,
    })),
    ...fuelLogs.map((f) => ({
      date: f.date,
      type: "Fuel",
      description: `${f.litres.toFixed(1)}L${f.filledToFull ? " (full)" : ""}`,
      cost: f.cost,
      mileage: String(f.mileage),
      notes: "",
    })),
    ...mods.map((m) => ({
      date: m.date,
      type: "Modification",
      description: `${MOD_LABELS[m.category] ?? m.category}: ${m.name}`,
      cost: m.cost,
      mileage: String(m.mileage),
      notes: m.notes,
    })),
    ...bills.map((b) => ({
      date: b.date,
      type: "Bill",
      description: BILL_LABELS[b.billType] ?? b.billType,
      cost: b.cost,
      mileage: "",
      notes: b.notes,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

  const rawName = bike?.nickname || bike?.make || "roadverdict";
  const filename = `${rawName.replace(/[^a-z0-9-]/gi, "-")}-history.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
