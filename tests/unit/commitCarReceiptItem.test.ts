import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";

const mocks = vi.hoisted(() => ({
  createTrackerDoc: vi.fn(),
  updateTrackerDoc: vi.fn(),
  deleteTrackerDoc: vi.fn(),
  queryCarTrackerDocs: vi.fn(),
}));

// Same split as carServiceRecord.test.ts etc: createTrackerDoc/
// updateTrackerDoc live in cosmosHelpers.ts, but queryCarTrackerDocs
// lives in car.ts (see that file's own comment on why) - mocked
// separately. This is also the true I/O boundary reestimateCarFuelMileage
// itself writes/reads through, so mocking it here is enough to control
// every write commitCarReceiptItem triggers, directly or indirectly.
vi.mock("@/lib/tracker/cosmosHelpers", () => ({
  createTrackerDoc: mocks.createTrackerDoc,
  updateTrackerDoc: mocks.updateTrackerDoc,
  deleteTrackerDoc: mocks.deleteTrackerDoc,
}));
vi.mock("@/lib/tracker/car", () => ({ queryCarTrackerDocs: mocks.queryCarTrackerDocs }));
// Pulled in transitively via reportAccess.ts (for normalizePlate only -
// allKnownCarPlates is this file's own local copy, not reportAccess.ts's
// allKnownPlates) - mocked purely so importing that module doesn't
// require a real request context.
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: vi.fn() })) }));

// Deliberately NOT mocked - every one of these is pure, already generic
// (confirmed vehicle-agnostic when this file was designed), and already
// has its own dedicated test file: mileageEstimate.ts, mpgCalc.ts,
// aiDescription.ts, duplicateCheck.ts, mileageCheck.ts, tankGuess.ts,
// fuelPlausibility.ts, normalizePlate (reportAccess.ts), and the car
// catalogs/guessers (carJobTypes.ts, carModTypes.ts, carBillTypes.ts,
// carGuessCategory.ts) - all already covered by carCatalogs.test.ts /
// carGuessCategory.test.ts.

import { commitCarReceiptItem } from "@/lib/tracker/commitCarReceiptItem";

const email = "driver@example.com";

const car = {
  id: "car-1",
  type: "car",
  make: "Ford",
  model: "Focus",
  fuelType: "petrol",
  originalRegistration: "AB12CDE",
  registrationChanges: [],
  startingMileage: 1000,
  currentMileage: 45000,
  dateAdded: "2024-01-01T00:00:00.000Z",
} as any;

function makeItem(overrides: Partial<ParsedReceiptItem> = {}): ParsedReceiptItem {
  return {
    fileName: "receipt.jpg",
    category: "service",
    date: "2025-06-15",
    costGbp: 60,
    description: "Oil change",
    litres: null,
    mileageOnReceipt: null,
    registrationOnReceipt: null,
    merchantName: "Dave's Garage",
    address: "14 High Street",
    city: "Colchester",
    vehicleMakeOnReceipt: null,
    vehicleModelOnReceipt: null,
    attachment: { blobName: "blob-1", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2025-06-15T00:00:00.000Z" },
    forceReview: false,
    aiLowConfidence: false,
    ...overrides,
  };
}

let queryResults: Record<string, any[]>;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  queryResults = { carServiceRecord: [], carFuelLog: [], carMod: [], carBill: [] };
  mocks.queryCarTrackerDocs.mockImplementation(async (_email: string, type: string) => queryResults[type] ?? []);
  mocks.createTrackerDoc.mockImplementation(async (email: string, idPrefix: string, type: string, data: any) => ({
    id: `${email}::${idPrefix}::fixed-id`,
    pk: email,
    type,
    createdAt: "2025-06-15T00:00:00.000Z",
    ...data,
  }));
  mocks.updateTrackerDoc.mockResolvedValue(null);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

function callsFor(idPrefix: string) {
  return mocks.createTrackerDoc.mock.calls.filter((c) => c[1] === idPrefix);
}

describe("plate mismatch", () => {
  it("flags a registration that has never belonged to this car", async () => {
    const result: any = await commitCarReceiptItem(email, car, makeItem({ category: "bills", description: "Annual insurance renewal", registrationOnReceipt: "XY99ZZZ" }));
    expect(result.plateMismatch).toEqual({ registrationOnReceipt: "XY99ZZZ" });
  });

  it("does not flag the car's own current registration, regardless of spacing/casing", async () => {
    const result: any = await commitCarReceiptItem(email, car, makeItem({ category: "bills", description: "Annual insurance renewal", registrationOnReceipt: "ab12 cde" }));
    expect(result.plateMismatch).toBeNull();
  });

  it("matches against a historical registration change, not just the current plate", async () => {
    const withHistory = { ...car, registrationChanges: [{ plate: "OLD123", reason: "correction", changedAt: "2023-01-01" }] };
    const result: any = await commitCarReceiptItem(email, withHistory, makeItem({ category: "bills", description: "Annual insurance renewal", registrationOnReceipt: "OLD 123" }));
    expect(result.plateMismatch).toBeNull();
  });
});

describe("vehicle mismatch", () => {
  it("flags a make that shares no substring with the car's own make", async () => {
    const result: any = await commitCarReceiptItem(email, car, makeItem({ category: "bills", description: "Annual insurance renewal", vehicleMakeOnReceipt: "Toyota", vehicleModelOnReceipt: "Yaris" }));
    expect(result.vehicleMismatch).toEqual({ makeOnReceipt: "Toyota", modelOnReceipt: "Yaris" });
  });

  it("loosely matches a differently-worded rendering of the same make", async () => {
    const result: any = await commitCarReceiptItem(email, car, makeItem({ category: "bills", description: "Annual insurance renewal", vehicleMakeOnReceipt: "FORD MOTOR CO" }));
    expect(result.vehicleMismatch).toBeNull();
  });
});

describe("service category", () => {
  it("guesses the car job type (cambelt, not a motorcycle-only label) and wires carId", async () => {
    const item = makeItem({ description: "Cambelt and water pump replacement", costGbp: 350, mileageOnReceipt: 42000 });
    const result: any = await commitCarReceiptItem(email, car, item);

    expect(result.category).toBe("service");
    expect(result.jobType).toBe("cambelt");
    expect(result.mileage).toBe(42000);

    const [, , , payload] = callsFor("carService")[0];
    expect(payload).toMatchObject({ carId: "car-1", jobType: "cambelt", cost: 350, mileage: 42000, needsReview: true });
  });

  // Deliberate scope cut vs the motorcycle path (see the file header) -
  // no createReminder import exists in commitCarReceiptItem.ts at all,
  // so there is no code path that could create one.
  it("creates no reminder, unlike the motorcycle path", async () => {
    await commitCarReceiptItem(email, car, makeItem({ description: "Cambelt", mileageOnReceipt: 42000 }));
    expect(callsFor("reminder")).toHaveLength(0);
    expect(mocks.createTrackerDoc.mock.calls.every((c) => c[1] !== "reminder")).toBe(true);
  });

  it("re-estimates nearby car fuel mileage only when the mileage came directly off the receipt", async () => {
    await commitCarReceiptItem(email, car, makeItem({ description: "Cambelt", mileageOnReceipt: 42000 }));
    // 4 initial fetches (service/fuel/mod/bill) + 4 more from
    // reestimateCarFuelMileage's own fetch = 8 - same shape as the
    // motorcycle version's equivalent test.
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledTimes(8);
  });

  it("does not re-estimate fuel mileage when the mileage was itself an estimate", async () => {
    await commitCarReceiptItem(email, car, makeItem({ description: "Cambelt", mileageOnReceipt: null }));
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledTimes(4);
  });

  it("finds a same-day, same-cost, similarly-described existing service record as a duplicate", async () => {
    queryResults.carServiceRecord = [
      { id: "svc-existing", date: "2025-06-15T09:00:00.000Z", mileage: 41990, cost: 350, notes: "Cambelt and water pump", jobType: "cambelt" },
    ];
    const result: any = await commitCarReceiptItem(email, car, makeItem({ description: "Cambelt and water pump", costGbp: 350, mileageOnReceipt: 42000 }));
    expect(result.duplicate).toEqual({ id: "svc-existing", date: "2025-06-15T09:00:00.000Z", cost: 350, description: "Cambelt and water pump" });
  });
});

describe("fuel category", () => {
  it("logs the car's own fuelType onto the created fuel log", async () => {
    const item = makeItem({ category: "fuel", description: "Fuel", costGbp: 60, litres: 40, mileageOnReceipt: 42000 });
    const result: any = await commitCarReceiptItem(email, car, item);

    expect(result.category).toBe("fuel");
    expect(result.mileage).toBe(42000);
    const [, , , payload] = callsFor("carFuel")[0];
    expect(payload).toMatchObject({ carId: "car-1", fuelType: "petrol", litres: 40, cost: 60, mileage: 42000 });
  });

  // CarDoc has no tankCapacityLitres field at all (out of scope - see
  // the ADR) - always undefined, unlike the motorcycle equivalent which
  // can carry a real figure.
  it("always reports tankCapacityLitres as undefined on the returned entry", async () => {
    const item = makeItem({ category: "fuel", description: "Fuel", costGbp: 12, litres: 3, mileageOnReceipt: 15000 });
    const result: any = await commitCarReceiptItem(email, car, item);
    expect(result.tankCapacityLitres).toBeUndefined();
  });

  it("estimates mileage from litres consumed since the last full tank when no mileage is printed", async () => {
    queryResults.carFuelLog = [
      { id: "fuel-prev", date: "2025-01-01T00:00:00.000Z", mileage: 40000, litres: 45, cost: 60, filledToFull: true, fuelType: "petrol" },
    ];
    const item = makeItem({ category: "fuel", description: "Fuel", costGbp: 55, litres: 42, date: "2025-02-01", mileageOnReceipt: null });
    const result: any = await commitCarReceiptItem(email, car, item);

    expect(result.mileage).toBeGreaterThan(40000);
    expect(result.filledToFull).toBe(true);
    const [, , , payload] = callsFor("carFuel")[0];
    expect(payload.mileageConfidence).toBe("estimated");
  });

  it("finds a same-day, same-cost existing fuel log as a duplicate", async () => {
    queryResults.carFuelLog = [
      { id: "fuel-existing", date: "2025-01-02T08:00:00.000Z", mileage: 10005, litres: 40, cost: 60, filledToFull: false, fuelType: "petrol" },
    ];
    const item = makeItem({ category: "fuel", description: "Fuel", costGbp: 60, litres: 40, date: "2025-01-02", mileageOnReceipt: 10005 });
    const result: any = await commitCarReceiptItem(email, car, item);
    expect(result.duplicate).toMatchObject({ id: "fuel-existing", cost: 60 });
  });
});

describe("mods category", () => {
  it("guesses the car mod category (far shorter catalog than motorcycle mods) and wires carId", async () => {
    const item = makeItem({ category: "mods", description: "Dash cam", costGbp: 80, mileageOnReceipt: 42000 });
    const result: any = await commitCarReceiptItem(email, car, item);

    expect(result.modCategory).toBe("dash-cam");
    expect(result.name).toBe("Dash cam");
    const [, , , payload] = callsFor("carMod")[0];
    expect(payload).toMatchObject({ carId: "car-1", category: "dash-cam", name: "Dash cam", cost: 80, mileage: 42000 });
  });

  it("notes the currency caveat without repeating the description, same as the motorcycle path", async () => {
    const item = makeItem({ category: "mods", description: "Dash cam", mileageOnReceipt: 42000, forceReview: true });
    const result: any = await commitCarReceiptItem(email, car, item);
    expect(result.notes).toBe("Currency could not be auto-converted - please check the amount");
  });
});

describe("bills category", () => {
  it("guesses the bill type (shared catalog) and wires carId", async () => {
    const item = makeItem({ category: "bills", description: "Annual insurance renewal", costGbp: 400 });
    const result: any = await commitCarReceiptItem(email, car, item);

    expect(result.billType).toBe("insurance");
    const [, , , payload] = callsFor("carBill")[0];
    expect(payload).toMatchObject({ carId: "car-1", billType: "insurance", cost: 400, needsReview: true });
  });

  // Car-only bill type, no motorcycle equivalent at all - proves
  // CAR_BILL_LABELS (not BILL_LABELS) is really what's wired in here.
  it("recognises a car-only bill type such as congestion charge", async () => {
    const item = makeItem({ category: "bills", description: "Congestion charge payment", costGbp: 15 });
    const result: any = await commitCarReceiptItem(email, car, item);
    expect(result.billType).toBe("congestion");
  });

  it("creates no reminder, unlike the motorcycle path", async () => {
    await commitCarReceiptItem(email, car, makeItem({ category: "bills", description: "Annual insurance renewal" }));
    expect(mocks.createTrackerDoc.mock.calls.every((c) => c[1] !== "reminder")).toBe(true);
  });

  it("never attempts a mileage estimate for a bill", async () => {
    await commitCarReceiptItem(email, car, makeItem({ category: "bills", description: "Annual insurance renewal" }));
    // Only the 4 initial fetches - bills have no mileage concept, so the
    // fuel re-estimation pass never runs.
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledTimes(4);
  });
});

describe("batchHints", () => {
  it("uses batchHints as genuine trusted anchors, capable of driving an interpolation", async () => {
    const batchHints = [
      { date: "2025-01-01", mileage: 40000 },
      { date: "2025-03-01", mileage: 41200 },
    ];
    const item = makeItem({ description: "Cambelt", date: "2025-02-01", mileageOnReceipt: null });
    const result: any = await commitCarReceiptItem(email, car, item, batchHints);

    expect(result.mileage).toBe(40631);
    expect(result.mileageNeedsManualEntry).toBe(false);
  });
});
