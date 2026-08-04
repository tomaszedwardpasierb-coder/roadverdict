// Place at: src/app/api/cron/audit-mileage/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { updateTrackerDoc } from "@/lib/tracker/cosmosHelpers";
import type { BikeDoc } from "@/lib/tracker/bike";
import { getServiceRecords, type ServiceRecordDoc } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, type FuelLogDoc } from "@/lib/tracker/fuelLog";
import { getMods, type ModDoc } from "@/lib/tracker/mod";
import { findMileageMonotonicityViolations, type AuditableRecord } from "@/lib/tracker/mileageAudit";

export const dynamic = "force-dynamic";

type FlaggableType = "serviceRecord" | "fuelLog" | "mod";

// Idempotent and safe to re-run, same as backfill-bike-id: it only ever
// sets needsReview true (and downgrades a stale "confirmed" tag back to
// "estimated", since the audit is specifically saying that confirmation
// doesn't look right) on records currently inconsistent with their own
// neighbours' dates. A record that's already fine, or already flagged,
// is untouched either way. Never rewrites the mileage value itself -
// only a human or a real receipt gets to do that.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const container = getContainer();
    const { resources: bikes } = await container.items
      .query<BikeDoc>({ query: "SELECT * FROM c WHERE c.type = 'bike'" })
      .fetchAll();

    let bikesProcessed = 0;
    let recordsFlagged = 0;
    const perBike: { email: string; bikeId: string; flagged: number }[] = [];

    for (const bike of bikes) {
      bikesProcessed++;
      const [records, fuelLogs, mods] = await Promise.all([
        getServiceRecords(bike.pk, bike.id),
        getFuelLogs(bike.pk, bike.id),
        getMods(bike.pk, bike.id),
      ]);

      const combined: (AuditableRecord & { type: FlaggableType })[] = [
        ...records.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage, mileageConfidence: r.mileageConfidence, type: "serviceRecord" as const })),
        ...fuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage, mileageConfidence: f.mileageConfidence, type: "fuelLog" as const })),
        ...mods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage, mileageConfidence: m.mileageConfidence, type: "mod" as const })),
      ];

      const violatingIds = new Set(findMileageMonotonicityViolations(combined));
      let flaggedForThisBike = 0;

      for (const item of combined) {
        if (!violatingIds.has(item.id)) continue;
        const updates = {
          needsReview: true,
          mileageConfidence: "estimated" as const,
          mileageConflictWarning: "This record's mileage looks chronologically inconsistent with another record for this bike (found by the mileage audit) - please double-check the figure.",
        };
        if (item.type === "serviceRecord") await updateTrackerDoc<ServiceRecordDoc>(bike.pk, item.id, updates);
        else if (item.type === "fuelLog") await updateTrackerDoc<FuelLogDoc>(bike.pk, item.id, updates);
        else await updateTrackerDoc<ModDoc>(bike.pk, item.id, updates);
        flaggedForThisBike++;
        recordsFlagged++;
      }

      if (flaggedForThisBike > 0) perBike.push({ email: bike.pk, bikeId: bike.id, flagged: flaggedForThisBike });
    }

    return NextResponse.json({ bikesProcessed, recordsFlagged, perBike });
  } catch (err) {
    return NextResponse.json(
      { error: "Audit failed.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
