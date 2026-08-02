// Place at: src/app/api/cron/backfill-bike-id/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import type { BikeDoc } from "@/lib/tracker/bike";
import type { TrackerDocBase } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

// Every doc type that needs a bikeId to eventually support multi-bike
// filtering. Keep this in sync with cosmosHelpers.ts consumers - if a new
// tracker doc type is added later, add its `type` string here too.
const TRACKER_TYPES = ["serviceRecord", "fuelLog", "mod", "bill", "reminder"] as const;

// Idempotent by design: re-running this is always safe. Docs that
// already have a bikeId are never touched again (the query explicitly
// excludes them), so running this twice does nothing the second time.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const container = getContainer();

    // Cross-partition - scans every bike doc that exists, same deliberate
    // exception as getAllReminders() in reminder.ts. Only ever run by hand
    // from the admin dashboard, never on a normal page load.
    const { resources: bikes } = await container.items
      .query<BikeDoc>({ query: "SELECT * FROM c WHERE c.type = 'bike'" })
      .fetchAll();

    let bikesProcessed = 0;
    let docsPatched = 0;
    const perBike: { email: string; bikeId: string; patched: number }[] = [];

    for (const bike of bikes) {
      bikesProcessed++;
      let patchedForThisBike = 0;

      for (const trackerType of TRACKER_TYPES) {
        // Scoped to this bike's own partition (its email) via
        // partitionKey - a cheap single-partition query, not a further
        // cross-partition fan-out. Only picks up docs missing bikeId,
        // which is what makes this safe to run more than once.
        const { resources: docs } = await container.items
          .query<TrackerDocBase>(
            {
              query: "SELECT * FROM c WHERE c.type = @type AND NOT IS_DEFINED(c.bikeId)",
              parameters: [{ name: "@type", value: trackerType }],
            },
            { partitionKey: bike.pk }
          )
          .fetchAll();

        for (const doc of docs) {
          const updated = { ...doc, bikeId: bike.id };
          await container.items.upsert(updated);
          docsPatched++;
          patchedForThisBike++;
        }
      }

      perBike.push({ email: bike.pk, bikeId: bike.id, patched: patchedForThisBike });
    }

    await container.items.upsert({
      id: "cronStatus::backfillBikeId",
      pk: "system",
      type: "cronStatus",
      lastRunAt: new Date().toISOString(),
      bikesProcessed,
      docsPatched,
    });

    return NextResponse.json({ ok: true, bikesProcessed, docsPatched, perBike });
  } catch (err) {
    return NextResponse.json(
      { error: "Unexpected error running bike-id backfill", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
