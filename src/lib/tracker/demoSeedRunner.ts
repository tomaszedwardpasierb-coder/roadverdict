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
import { getCarsForUser, createCar, deleteCar } from "@/lib/tracker/car";
import { createCarServiceRecord } from "@/lib/tracker/carServiceRecord";
import { createCarFuelLog } from "@/lib/tracker/carFuelLog";
import { createCarMod } from "@/lib/tracker/carMod";
import { createCarBill } from "@/lib/tracker/carBill";
import { createCarReminder } from "@/lib/tracker/carReminder";
import {
  generateDemoCarDataset,
  DEMO_CAR_MAKE,
  DEMO_CAR_MODEL,
  DEMO_CAR_FUEL_TYPE,
  DEMO_CAR_ENGINE_LITRES,
  DEMO_CAR_REGION,
  DEMO_CAR_REGISTRATION,
  DEMO_CAR_YEAR,
  DEMO_CAR_NICKNAME,
} from "@/lib/tracker/demoCarSeed";

export interface SeedCounts {
  fuel: number;
  service: number;
  mods: number;
  bills: number;
  carFuel: number;
  carService: number;
  carMods: number;
  carBills: number;
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
  const existingCars = await getCarsForUser(DEMO_EMAIL);
  for (const car of existingCars) {
    await deleteCar(DEMO_EMAIL, car.id);
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

  // CAR - a second vehicle alongside the bike, showcasing Pro's
  // side-by-side comparison rather than a single-vehicle demo. Uses
  // car.ts's createCar directly (no route-layer isPro/vehicle-limit
  // check to satisfy here), same reasoning as the bike seeding above.
  const carDataset = generateDemoCarDataset(new Date());
  const car = await createCar(DEMO_EMAIL, {
    make: DEMO_CAR_MAKE,
    model: DEMO_CAR_MODEL,
    fuelType: DEMO_CAR_FUEL_TYPE,
    engineLitres: DEMO_CAR_ENGINE_LITRES,
    year: DEMO_CAR_YEAR,
    registration: DEMO_CAR_REGISTRATION,
    currentMileage: carDataset.finalMileage,
    nickname: DEMO_CAR_NICKNAME,
    region: DEMO_CAR_REGION,
    mayHavePriorHistory: true,
  });
  const carId = car.id;

  for (const f of carDataset.fuel) {
    await createCarFuelLog(DEMO_EMAIL, { carId, fuelType: DEMO_CAR_FUEL_TYPE, litres: f.litres, cost: f.cost, mileage: f.mileage, date: f.date, filledToFull: f.filledToFull });
  }
  for (const s of carDataset.service) {
    await createCarServiceRecord(DEMO_EMAIL, { carId, jobType: s.jobType, cost: s.cost, mileage: s.mileage, date: s.date, notes: "" });
  }
  for (const m of carDataset.mods) {
    await createCarMod(DEMO_EMAIL, { carId, category: m.category, name: m.name, cost: m.cost, mileage: m.mileage, date: m.date, notes: "" });
  }
  for (const b of carDataset.bills) {
    await createCarBill(DEMO_EMAIL, { carId, billType: b.billType, cost: b.cost, date: b.date, notes: "" });
  }

  const lastCarService = carDataset.service[carDataset.service.length - 1];
  const lastCarInsurance = [...carDataset.bills].reverse().find((b) => b.billType === "insurance");
  if (lastCarService) {
    await createCarReminder(DEMO_EMAIL, {
      carId,
      name: "Interim service",
      intervalType: "mileage",
      intervalValue: 6000,
      baseMileage: lastCarService.mileage,
      date: lastCarService.date,
      sourceKey: `service:${lastCarService.jobType}`,
    });
  }
  if (lastCarInsurance) {
    await createCarReminder(DEMO_EMAIL, {
      carId,
      name: "Insurance renewal",
      intervalType: "months",
      intervalValue: 12,
      date: lastCarInsurance.date,
      sourceKey: "bill:insurance",
    });
  }

  return {
    fuel: dataset.fuel.length,
    service: dataset.service.length,
    mods: dataset.mods.length,
    bills: dataset.bills.length,
    carFuel: carDataset.fuel.length,
    carService: carDataset.service.length,
    carMods: carDataset.mods.length,
    carBills: carDataset.bills.length,
  };
}
