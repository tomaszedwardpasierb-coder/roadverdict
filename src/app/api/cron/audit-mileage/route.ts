// Place at: src/app/api/cron/audit-mileage/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { updateTrackerDoc } from "@/lib/tracker/cosmosHelpers";
import { runInBatches } from "@/lib/concurrency";
import type { BikeDoc } from "@/lib/tracker/bike";
import { getServiceRecords, type ServiceRecordDoc } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, type FuelLogDoc } from "@/lib/tracker/fuelLog";
import { getMods, type ModDoc } from "@/lib/tracker/mod";
import type { CarDoc } from "@/lib/tracker/car";
import { getCarServiceRecords, type CarServiceRecordDoc } from "@/lib/tracker/carServiceRecord";
import { getCarFuelLogs, type CarFuelLogDoc } from "@/lib/tracker/carFuelLog";
import { getCarMods, type CarModDoc } from "@/lib/tracker/carMod";
import { findMileageMonotonicityViolations, findImplausibleFuelFills, type AuditableRecord, type AuditableFuelLog } from "@/lib/tracker/mileageAudit";

export const dynamic = "force-dynamic";

type FlaggableType = "serviceRecord" | "fuelLog" | "mod";
type CarFlaggableType = "carServiceRecord" | "carFuelLog" | "carMod";

// How many bikes/cars this runs at once. Was a plain sequential for-loop
// (one vehicle's reads/writes fully finished before the next one even
// started) - fine at a handful of vehicles, but runtime scaled linearly
// with the whole fleet's size with zero parallelism. Chunked via
// runInBatches instead of one big Promise.all over the entire fleet, so
// concurrent Cosmos load stays bounded even once there are thousands of
// vehicles, not just fast today.
const CRON_BATCH_SIZE = 20;

interface AuditOutcome {
  flagged: number;
  error?: string;
}

// Idempotent and safe to re-run, same as backfill-bike-id: it only ever
// sets needsReview true (and downgrades a stale "confirmed" tag back to
// "estimated", since the audit is specifically saying that confirmation
// doesn't look right) on records currently inconsistent with their own
// neighbours' dates. A record that's already fine, or already flagged,
// is untouched either way. Never rewrites the mileage value itself -
// only a human or a real receipt gets to do that.
//
// Isolated per bike: one bike's own read/write failure shouldn't stop the
// audit from ever reaching every other bike in the run - caught here
// rather than left to reject, so a failure surfaces as an AuditOutcome
// the caller can log without runInBatches' Promise.allSettled ever
// actually seeing a rejection.
async function auditBike(bike: BikeDoc): Promise<AuditOutcome> {
  try {
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

    // Second pass: full-tank fuel entries whose litres imply an
    // impossible mpg against the fill immediately before them - a
    // different kind of inconsistency to the chronological one above,
    // so checked separately, but flagged into the same set.
    const fuelForPlausibilityCheck: AuditableFuelLog[] = fuelLogs.map((f) => ({
      id: f.id, date: f.date, mileage: f.mileage, mileageConfidence: f.mileageConfidence, litres: f.litres, filledToFull: f.filledToFull,
    }));
    for (const id of findImplausibleFuelFills(fuelForPlausibilityCheck)) violatingIds.add(id);

    const flaggedItems = combined.filter((item) => violatingIds.has(item.id));
    // Independent writes to different doc IDs, so these go out together
    // rather than one at a time - a bike with several flagged records no
    // longer pays for each write's own round-trip in series.
    await Promise.all(
      flaggedItems.map((item) => {
        const updates = {
          needsReview: true,
          mileageConfidence: "estimated" as const,
          mileageConflictWarning: "This record's mileage looks chronologically inconsistent with another record for this bike (found by the mileage audit) - please double-check the figure.",
        };
        if (item.type === "serviceRecord") return updateTrackerDoc<ServiceRecordDoc>(bike.pk, item.id, updates);
        if (item.type === "fuelLog") return updateTrackerDoc<FuelLogDoc>(bike.pk, item.id, updates);
        return updateTrackerDoc<ModDoc>(bike.pk, item.id, updates);
      })
    );

    return { flagged: flaggedItems.length };
  } catch (err) {
    console.error(`Mileage audit failed for bike ${bike.id} (${bike.pk}):`, err);
    return { flagged: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

// Cars - mirrored, not shared, same sister-schema convention as every
// other bike/car pair in this app: getCarServiceRecords/getCarFuelLogs/
// getCarMods instead of their bike equivalents. findMileageMonotonicity
// Violations/findImplausibleFuelFills are reused directly (already
// vehicle-neutral, taking plain {id, date, mileage, mileageConfidence,
// ...} shapes).
async function auditCar(car: CarDoc): Promise<AuditOutcome> {
  try {
    const [records, fuelLogs, mods] = await Promise.all([
      getCarServiceRecords(car.pk, car.id),
      getCarFuelLogs(car.pk, car.id),
      getCarMods(car.pk, car.id),
    ]);

    const combined: (AuditableRecord & { type: CarFlaggableType })[] = [
      ...records.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage, mileageConfidence: r.mileageConfidence, type: "carServiceRecord" as const })),
      ...fuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage, mileageConfidence: f.mileageConfidence, type: "carFuelLog" as const })),
      ...mods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage, mileageConfidence: m.mileageConfidence, type: "carMod" as const })),
    ];

    const violatingIds = new Set(findMileageMonotonicityViolations(combined));

    // Electric-only fill-ups (kWh charging, no litres) have no fuel
    // efficiency to check for implausibility against - same reason
    // dashboard/page.tsx's own MPG chart excludes them.
    const fuelForPlausibilityCheck: AuditableFuelLog[] = fuelLogs
      .filter((f): f is typeof f & { litres: number } => f.litres != null)
      .map((f) => ({
        id: f.id, date: f.date, mileage: f.mileage, mileageConfidence: f.mileageConfidence, litres: f.litres, filledToFull: f.filledToFull ?? false,
      }));
    for (const id of findImplausibleFuelFills(fuelForPlausibilityCheck)) violatingIds.add(id);

    const flaggedItems = combined.filter((item) => violatingIds.has(item.id));
    await Promise.all(
      flaggedItems.map((item) => {
        const updates = {
          needsReview: true,
          mileageConfidence: "estimated" as const,
          mileageConflictWarning: "This record's mileage looks chronologically inconsistent with another record for this car (found by the mileage audit) - please double-check the figure.",
        };
        if (item.type === "carServiceRecord") return updateTrackerDoc<CarServiceRecordDoc>(car.pk, item.id, updates);
        if (item.type === "carFuelLog") return updateTrackerDoc<CarFuelLogDoc>(car.pk, item.id, updates);
        return updateTrackerDoc<CarModDoc>(car.pk, item.id, updates);
      })
    );

    return { flagged: flaggedItems.length };
  } catch (err) {
    console.error(`Mileage audit failed for car ${car.id} (${car.pk}):`, err);
    return { flagged: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

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

    let recordsFlagged = 0;
    const perBike: { email: string; bikeId: string; flagged: number }[] = [];
    const errors: ({ email: string; bikeId: string; error: string } | { email: string; carId: string; error: string })[] = [];

    const bikeOutcomes = await runInBatches(bikes, CRON_BATCH_SIZE, auditBike);
    bikes.forEach((bike, i) => {
      const outcome = bikeOutcomes[i];
      // auditBike always catches its own errors and resolves rather than
      // rejects (see its own comment) - the "rejected" branch only
      // guards against something unexpected slipping past that, same
      // spirit as every other defensive catch in this file.
      if (outcome.status === "rejected") {
        errors.push({ email: bike.pk, bikeId: bike.id, error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) });
        return;
      }
      recordsFlagged += outcome.value.flagged;
      if (outcome.value.flagged > 0) perBike.push({ email: bike.pk, bikeId: bike.id, flagged: outcome.value.flagged });
      if (outcome.value.error) errors.push({ email: bike.pk, bikeId: bike.id, error: outcome.value.error });
    });
    const bikesProcessed = bikes.length;

    const { resources: cars } = await container.items
      .query<CarDoc>({ query: "SELECT * FROM c WHERE c.type = 'car'" })
      .fetchAll();

    // Flagged records are counted into the SAME recordsFlagged total as
    // bikes - there's exactly one daily audit run, not two separately-
    // tracked ones per vehicle kind - but kept in their own perCar/
    // carsProcessed fields, since a bikeId and a carId aren't
    // interchangeable.
    const perCar: { email: string; carId: string; flagged: number }[] = [];

    const carOutcomes = await runInBatches(cars, CRON_BATCH_SIZE, auditCar);
    cars.forEach((car, i) => {
      const outcome = carOutcomes[i];
      if (outcome.status === "rejected") {
        errors.push({ email: car.pk, carId: car.id, error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason) });
        return;
      }
      recordsFlagged += outcome.value.flagged;
      if (outcome.value.flagged > 0) perCar.push({ email: car.pk, carId: car.id, flagged: outcome.value.flagged });
      if (outcome.value.error) errors.push({ email: car.pk, carId: car.id, error: outcome.value.error });
    });
    const carsProcessed = cars.length;

    return NextResponse.json({
      bikesProcessed, carsProcessed, recordsFlagged, perBike, perCar,
      ...(errors.length ? { errors } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Audit failed.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
