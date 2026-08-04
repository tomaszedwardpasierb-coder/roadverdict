// Place at: src/lib/tracker/demoSeedRunner.ts
//
// Deliberately kept separate from demoSeed.ts, which stays pure and
// Cosmos-free (it's imported client-side for the DEMO_EMAIL constant).
// This file is the one that actually writes to the database, so it's
// only ever imported from server-side routes.
import { getBikesForUser, createBike, deleteBike } from "@/lib/tracker/bike";
import { getBikeClassForCC } from "@/lib/motorcycleModels";
import { createServiceRecord } from "@/lib/tracker/serviceRecord";
import { createFuelLog } from "@/lib/tracker/fuelLog";
import { createMod } from "@/lib/tracker/mod";
import { createBill } from "@/lib/tracker/bill";
import { createReminder } from "@/lib/tracker/reminder";
import {
  generateDemoDataset,
  DEMO_EMAIL,
  DEMO_MAKE,
  DEMO_MODEL,
  DEMO_ENGINE_CC,
  DEMO_REGION,
  DEMO_REGISTRATION,
  DEMO_NICKNAME,
} from "@/lib/tracker/demoSeed";

export interface SeedCounts {
  fuel: number;
  service: number;
  mods: number;
  bills: number;
}

export async function demoBikeExists(): Promise<boolean> {
  const bikes = await getBikesForUser(DEMO_EMAIL);
  return bikes.length > 0;
}

// Wipes any existing demo bike (cascade-deleting every record and
// reminder attached) and rebuilds the whole 10-year dataset fresh.
// Sequential writes, not parallel - the free Cosmos tier this app runs
// on is capped at 1000 RU/s, and firing hundreds of writes at once risks
// hitting that ceiling. This only ever runs on a reset or a first login,
// never a hot path, so trading speed for reliability here is the right
// call.
export async function runDemoSeed(): Promise<SeedCounts> {
  const existingBikes = await getBikesForUser(DEMO_EMAIL);
  for (const bike of existingBikes) {
    await deleteBike(DEMO_EMAIL, bike.id);
  }

  const dataset = generateDemoDataset(new Date());
  const productionYear = new Date().getFullYear() - 10;

  const result = await createBike(DEMO_EMAIL, {
    make: DEMO_MAKE,
    model: DEMO_MODEL,
    engineCC: DEMO_ENGINE_CC,
    bikeClass: getBikeClassForCC(DEMO_ENGINE_CC),
    year: productionYear,
    registration: DEMO_REGISTRATION,
    currentMileage: dataset.finalMileage,
    nickname: DEMO_NICKNAME,
    region: DEMO_REGION,
  });

  if (!result.ok) {
    throw new Error("Could not create the demo bike.");
  }
  const bikeId = result.bike.id;

  for (const f of dataset.fuel) {
    await createFuelLog(DEMO_EMAIL, { bikeId, litres: f.litres, cost: f.cost, mileage: f.mileage, date: f.date, filledToFull: f.filledToFull });
  }
  for (const s of dataset.service) {
    await createServiceRecord(DEMO_EMAIL, { bikeId, jobType: s.jobType, cost: s.cost, mileage: s.mileage, date: s.date, notes: "" });
  }
  for (const m of dataset.mods) {
    await createMod(DEMO_EMAIL, { bikeId, category: m.category, name: m.name, cost: m.cost, mileage: m.mileage, date: m.date, notes: "" });
  }
  for (const b of dataset.bills) {
    await createBill(DEMO_EMAIL, { bikeId, billType: b.billType, cost: b.cost, date: b.date, notes: "" });
  }

  const lastService = dataset.service[dataset.service.length - 1];
  const lastInsurance = [...dataset.bills].reverse().find((b) => b.billType === "insurance");
  if (lastService) {
    await createReminder(DEMO_EMAIL, {
      bikeId,
      name: "Basic service",
      intervalType: "mileage",
      intervalValue: 4000,
      baseMileage: lastService.mileage,
      date: lastService.date,
      sourceKey: "service:basic-service",
    });
  }
  if (lastInsurance) {
    await createReminder(DEMO_EMAIL, {
      bikeId,
      name: "Insurance renewal",
      intervalType: "months",
      intervalValue: 12,
      date: lastInsurance.date,
      sourceKey: "bill:insurance",
    });
  }

  return { fuel: dataset.fuel.length, service: dataset.service.length, mods: dataset.mods.length, bills: dataset.bills.length };
}
