import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";

const mocks = vi.hoisted(() => ({
  createTrackerDoc: vi.fn(),
  queryTrackerDocs: vi.fn(),
  updateTrackerDoc: vi.fn(),
  deleteTrackerDoc: vi.fn(),
}));

// The true I/O boundary for every doc type this file touches
// (serviceRecord/fuelLog/mod/bill/reminder, and reestimateFuelMileage's
// own reads/writes) - all of them delegate to cosmosHelpers, so mocking
// it here is enough to control every write commitReceiptItem triggers,
// directly or indirectly, without mocking any of those thin wrapper
// modules individually.
vi.mock("@/lib/tracker/cosmosHelpers", () => ({
  createTrackerDoc: mocks.createTrackerDoc,
  queryTrackerDocs: mocks.queryTrackerDocs,
  updateTrackerDoc: mocks.updateTrackerDoc,
  deleteTrackerDoc: mocks.deleteTrackerDoc,
}));
// Pulled in transitively via reportAccess.ts (for normalizePlate/
// allKnownPlates, which ARE exercised for real below) - mocked purely so
// importing that module doesn't require a real request context or a
// live Cosmos connection. None of the functions that actually use these
// are ever called from commitReceiptItem.ts.
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: vi.fn() })) }));

// Deliberately NOT mocked - every one of these is pure, already has its
// own dedicated test file, and is exactly the kind of "already-tested
// pure dependency" this suite should exercise for real rather than
// re-mock: mileageEstimate.ts, mpgCalc.ts, guessCategory.ts, jobTypes.ts,
// billTypes.ts, aiDescription.ts, duplicateCheck.ts, mileageCheck.ts,
// tankGuess.ts, fuelPlausibility.ts, and normalizePlate/allKnownPlates
// from reportAccess.ts.

import { commitReceiptItem } from "@/lib/tracker/commitReceiptItem";

const email = "rider@example.com";

const bike = {
  id: "bike-1",
  make: "Honda",
  originalRegistration: "AB12CDE",
  registrationChanges: [],
  tankCapacityLitres: 15,
  startingMileage: 1000,
  currentMileage: 20000,
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
    merchantName: "Dave's Motorcycles",
    address: "14 High Street",
    city: "Colchester",
    vehicleMakeOnReceipt: null,
    vehicleModelOnReceipt: null,
    attachment: { blobName: "blob-1", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2025-06-15T00:00:00.000Z" },
    forceReview: false,
    ...overrides,
  };
}

let queryResults: Record<string, any[]>;
let callIndex: number;

beforeEach(() => {
  vi.clearAllMocks();
  queryResults = { serviceRecord: [], fuelLog: [], mod: [], bill: [], reminder: [] };
  callIndex = 0;
  mocks.queryTrackerDocs.mockImplementation(async (_email: string, type: string) => {
    callIndex++;
    return queryResults[type] ?? [];
  });
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
  it("flags a registration that has never belonged to this bike", async () => {
    const result: any = await commitReceiptItem(email, bike, makeItem({ category: "bills", description: "Annual insurance renewal", registrationOnReceipt: "XY99ZZZ" }));
    expect(result.plateMismatch).toEqual({ registrationOnReceipt: "XY99ZZZ" });
  });

  it("does not flag the bike's own current registration", async () => {
    const result: any = await commitReceiptItem(email, bike, makeItem({ category: "bills", description: "Annual insurance renewal", registrationOnReceipt: "AB12CDE" }));
    expect(result.plateMismatch).toBeNull();
  });

  it("matches regardless of the receipt's own spacing/casing", async () => {
    const result: any = await commitReceiptItem(email, bike, makeItem({ category: "bills", description: "Annual insurance renewal", registrationOnReceipt: "ab12 cde" }));
    expect(result.plateMismatch).toBeNull();
  });

  it("matches against a historical registration change, not just the current plate", async () => {
    const withHistory = { ...bike, registrationChanges: [{ plate: "OLD123", reason: "correction", changedAt: "2023-01-01" }] };
    const result: any = await commitReceiptItem(email, withHistory, makeItem({ category: "bills", description: "Annual insurance renewal", registrationOnReceipt: "OLD 123" }));
    expect(result.plateMismatch).toBeNull();
  });

  it("does not check plate at all when the receipt has none", async () => {
    const result: any = await commitReceiptItem(email, bike, makeItem({ category: "bills", description: "Annual insurance renewal", registrationOnReceipt: null }));
    expect(result.plateMismatch).toBeNull();
  });
});

describe("vehicle mismatch", () => {
  it("flags a make that shares no substring with the bike's own make", async () => {
    const result: any = await commitReceiptItem(email, bike, makeItem({ category: "bills", description: "Annual insurance renewal", vehicleMakeOnReceipt: "Royal Enfield", vehicleModelOnReceipt: "Meteor 350" }));
    expect(result.vehicleMismatch).toEqual({ makeOnReceipt: "Royal Enfield", modelOnReceipt: "Meteor 350" });
  });

  it("loosely matches a differently-worded rendering of the same make", async () => {
    const result: any = await commitReceiptItem(email, bike, makeItem({ category: "bills", description: "Annual insurance renewal", vehicleMakeOnReceipt: "HONDA MOTOR CO" }));
    expect(result.vehicleMismatch).toBeNull();
  });

  it("does not check make at all when the receipt states none", async () => {
    const result: any = await commitReceiptItem(email, bike, makeItem({ category: "bills", description: "Annual insurance renewal", vehicleMakeOnReceipt: null }));
    expect(result.vehicleMismatch).toBeNull();
  });
});

describe("service category", () => {
  it("uses the receipt's own printed mileage when it doesn't conflict with anything", async () => {
    const item = makeItem({ description: "Basic service", costGbp: 80, mileageOnReceipt: 15000 });
    const result: any = await commitReceiptItem(email, bike, item);

    expect(result.category).toBe("service");
    expect(result.mileage).toBe(15000);
    expect(result.mileageNeedsManualEntry).toBe(false);
    expect(result.jobType).toBe("basic-service");
    expect(result.aiDescription).toBe("Basic service at Dave's Motorcycles - 14 High Street, Colchester (Service)");

    const [, , , payload] = callsFor("service")[0];
    expect(payload).toMatchObject({ bikeId: "bike-1", jobType: "basic-service", cost: 80, mileage: 15000, needsReview: true, attachments: [item.attachment] });
    expect(payload.mileageConfidence).toBeUndefined();
  });

  it("creates a reminder using the job type's own default interval, keyed to service:<jobType>", async () => {
    await commitReceiptItem(email, bike, makeItem({ description: "Basic service", mileageOnReceipt: 15000 }));
    expect(callsFor("reminder")).toHaveLength(1);
    const [, , , payload] = callsFor("reminder")[0];
    expect(payload).toMatchObject({ bikeId: "bike-1", name: "Basic service", intervalType: "mileage", intervalValue: 4000, baseMileage: 15000, sourceKey: "service:basic-service" });
  });

  it("creates no reminder for a job type with no reminder default", async () => {
    await commitReceiptItem(email, bike, makeItem({ description: "Some unrecognisable one-off job", mileageOnReceipt: 15000 }));
    expect(callsFor("reminder")).toHaveLength(0);
  });

  it("still returns the saved record if reminder creation fails - the record itself must not be lost", async () => {
    mocks.createTrackerDoc.mockImplementation(async (email: string, idPrefix: string, type: string, data: any) => {
      if (idPrefix === "reminder") throw new Error("reminder write failed");
      return { id: `${email}::${idPrefix}::fixed-id`, pk: email, type, createdAt: "2025-06-15T00:00:00.000Z", ...data };
    });
    const result: any = await commitReceiptItem(email, bike, makeItem({ description: "Basic service", mileageOnReceipt: 15000 }));
    expect(result.id).toBe(`${email}::service::fixed-id`);
  });

  it("re-estimates nearby fuel mileage only when the mileage came directly off the receipt (undefined confidence)", async () => {
    await commitReceiptItem(email, bike, makeItem({ description: "Basic service", mileageOnReceipt: 15000 }));
    // 4 initial fetches (service/fuel/mod/bill) + 4 more from reestimateFuelMileage's own fetch = 8.
    expect(mocks.queryTrackerDocs).toHaveBeenCalledTimes(8);
  });

  it("does not re-estimate fuel mileage when the mileage was itself an estimate", async () => {
    // No printed mileage and no history at all - forces the generic,
    // already-estimated fallback path, which must never re-trigger the
    // fuel re-estimation pass (that's reserved for a genuinely new anchor).
    await commitReceiptItem(email, bike, makeItem({ description: "Basic service", mileageOnReceipt: null }));
    expect(mocks.queryTrackerDocs).toHaveBeenCalledTimes(4);
  });

  it("still returns success if the fuel-mileage re-estimation pass throws", async () => {
    mocks.queryTrackerDocs.mockImplementation(async (_email: string, type: string) => {
      callIndex++;
      if (callIndex > 4) throw new Error("re-estimate failed");
      return queryResults[type] ?? [];
    });
    const result: any = await commitReceiptItem(email, bike, makeItem({ description: "Basic service", mileageOnReceipt: 15000 }));
    expect(result.id).toBe(`${email}::service::fixed-id`);
  });

  it("flags the notes with a currency caveat when the item was forced for review", async () => {
    const result: any = await commitReceiptItem(email, bike, makeItem({ description: "Basic service", mileageOnReceipt: 15000, forceReview: true }));
    expect(result.notes).toBe("Basic service (currency could not be auto-converted - please check the amount)");
  });

  it("finds a same-day, same-cost, similarly-described existing service record as a duplicate", async () => {
    queryResults.serviceRecord = [
      { id: "svc-existing", date: "2025-06-15T09:00:00.000Z", mileage: 14990, cost: 80, notes: "Basic service", jobType: "basic-service" },
    ];
    const result: any = await commitReceiptItem(email, bike, makeItem({ description: "Basic service", costGbp: 80, mileageOnReceipt: 15000 }));
    expect(result.duplicate).toEqual({ id: "svc-existing", date: "2025-06-15T09:00:00.000Z", cost: 80, description: "Basic service" });
  });

  it("falls back to a lifetime interpolation when there's no printed mileage and no history at all", async () => {
    const result: any = await commitReceiptItem(email, bike, makeItem({ description: "Basic service", mileageOnReceipt: null }));
    // Bounded by the bike's own recorded lifetime range - the exact
    // figure depends on how much of that lifetime has elapsed, which
    // this test deliberately doesn't pin down (see mileageEstimate.test.ts
    // for the maths itself).
    expect(result.mileage).toBeGreaterThanOrEqual(bike.startingMileage);
    expect(result.mileage).toBeLessThanOrEqual(bike.currentMileage);
    expect(result.mileageNeedsManualEntry).toBe(false);
    const [, , , payload] = callsFor("service")[0];
    expect(payload.mileageConfidence).toBe("estimated");
  });
});

describe("mileage conflict detection", () => {
  it("flags a printed mileage that contradicts a later, already-logged record", async () => {
    queryResults.serviceRecord = [
      { id: "svc-later", date: "2025-08-01T00:00:00.000Z", mileage: 5000, cost: 50, notes: "Later job", jobType: "other" },
    ];
    const result: any = await commitReceiptItem(email, bike, makeItem({ description: "Basic service", mileageOnReceipt: 8000, date: "2025-06-15" }));

    expect(result.mileageNeedsManualEntry).toBe(true);
    expect(result.mileageWarningText).toContain("8,000 mi");
    expect(result.mileageWarningText).toContain("5,000 miles");
    expect(result.mileageWarningText).toContain("fewer");
    expect(result.mileageConflictReferenceId).toBe("svc-later");
    expect(result.mileageConflictReferenceCategory).toBe("service");
  });

  // The documented gap-fix: a computed estimate must be cross-checked
  // against EVERY logged point, not just the trustworthy ones used to
  // derive it - here the receipt has no printed mileage at all, so the
  // first (receipt-vs-trusted) check never runs, and only the full-history
  // cross-check catches the contradiction with the untrusted fuel log.
  it("catches an estimate that contradicts an untrusted point the receipt-mileage check never sees", async () => {
    queryResults.serviceRecord = [
      { id: "svc-A", date: "2024-01-01T00:00:00.000Z", mileage: 5000, cost: 50, notes: "Old", jobType: "other" },
      { id: "svc-C", date: "2025-01-01T00:00:00.000Z", mileage: 15000, cost: 60, notes: "Recent", jobType: "other" },
    ];
    queryResults.fuelLog = [
      { id: "fuel-B", date: "2025-01-10T00:00:00.000Z", mileage: 9000, litres: 10, cost: 15, filledToFull: false, mileageConfidence: "estimated" },
    ];

    const result: any = await commitReceiptItem(email, bike, makeItem({ description: "Chain adjustment", costGbp: 40, date: "2025-01-05", mileageOnReceipt: null }));

    expect(result.mileage).toBe(15109);
    expect(result.mileageNeedsManualEntry).toBe(true);
    expect(result.mileageWarningText).toContain("9,000 miles");
    expect(result.mileageWarningText).toContain("fewer");
    expect(result.mileageConflictReferenceId).toBe("fuel-B");
    expect(result.mileageConflictReferenceCategory).toBe("fuel");
  });
});

describe("fuel category", () => {
  it("logs a small top-up as not filled-to-full, with no plausibility check applied", async () => {
    const item = makeItem({ category: "fuel", description: "Fuel", costGbp: 12, litres: 3, mileageOnReceipt: 15000 });
    const result: any = await commitReceiptItem(email, bike, item);

    expect(result.filledToFull).toBe(false);
    expect(result.mileage).toBe(15000);
    expect(result.mileageNeedsManualEntry).toBe(false);
    expect(result.precedingFuelMileage).toBeUndefined();
    expect(result.tankCapacityLitres).toBe(15);

    const [, , , payload] = callsFor("fuel")[0];
    expect(payload).toMatchObject({ litres: 3, cost: 12, mileage: 15000, filledToFull: false });
  });

  it("estimates mileage from litres consumed since the last full tank when no mileage is printed", async () => {
    queryResults.fuelLog = [
      { id: "fuel-prev", date: "2025-01-01T00:00:00.000Z", mileage: 10000, litres: 12, cost: 15, filledToFull: true },
    ];
    const item = makeItem({ category: "fuel", description: "Fuel", costGbp: 15, litres: 12, date: "2025-02-01", mileageOnReceipt: null });
    const result: any = await commitReceiptItem(email, bike, item);

    // 12L / 4.546 gallons * 57mpg generic fallback (no bike-specific MPG
    // history yet - only one prior fill-up, not enough to compute one) ≈
    // 150 miles on from the last full-tank anchor.
    expect(result.mileage).toBe(10150);
    expect(result.mileageNeedsManualEntry).toBe(false);
    expect(result.mileageWarningText).toBeUndefined();
    expect(result.precedingFuelMileage).toBe(10000);
    expect(result.filledToFull).toBe(true);

    const [, , , payload] = callsFor("fuel")[0];
    expect(payload.mileageConfidence).toBe("estimated");
  });

  it("flags an implausibly short distance for a full tank rather than accepting it silently", async () => {
    queryResults.fuelLog = [
      { id: "fuel-prev", date: "2025-01-01T00:00:00.000Z", mileage: 10000, litres: 12, cost: 15, filledToFull: true },
    ];
    // Only 5 miles since the last fill-up, but this one is a full 12L tank -
    // physically implausible for a petrol engine.
    const item = makeItem({ category: "fuel", description: "Fuel", costGbp: 15, litres: 12, date: "2025-01-02", mileageOnReceipt: 10005 });
    const result: any = await commitReceiptItem(email, bike, item);

    expect(result.mileageNeedsManualEntry).toBe(true);
    expect(result.mileageWarningText).toContain("12.0L");
    expect(result.mileageWarningText).toContain("isn't realistic");
  });

  it("finds a same-day, same-cost existing fuel log as a duplicate", async () => {
    queryResults.fuelLog = [
      { id: "fuel-existing", date: "2025-01-02T08:00:00.000Z", mileage: 10005, litres: 10, cost: 15, filledToFull: false },
    ];
    const item = makeItem({ category: "fuel", description: "Fuel", costGbp: 15, litres: 10, date: "2025-01-02", mileageOnReceipt: 10005 });
    const result: any = await commitReceiptItem(email, bike, item);
    expect(result.duplicate).toMatchObject({ id: "fuel-existing", cost: 15 });
  });
});

describe("mods category", () => {
  it("guesses the mod category from the description and composes the right aiDescription", async () => {
    const item = makeItem({ category: "mods", description: "Heated grips", costGbp: 25, mileageOnReceipt: 15000 });
    const result: any = await commitReceiptItem(email, bike, item);

    expect(result.modCategory).toBe("heated-grips");
    expect(result.name).toBe("Heated grips");
    expect(result.aiDescription).toBe("Heated grips at Dave's Motorcycles - 14 High Street, Colchester (Parts & Accessories)");

    const [, , , payload] = callsFor("mod")[0];
    expect(payload).toMatchObject({ bikeId: "bike-1", category: "heated-grips", name: "Heated grips", cost: 25, mileage: 15000 });
  });

  it("notes the currency caveat without repeating the description (unlike service/bills)", async () => {
    const item = makeItem({ category: "mods", description: "Heated grips", mileageOnReceipt: 15000, forceReview: true });
    const result: any = await commitReceiptItem(email, bike, item);
    expect(result.notes).toBe("Currency could not be auto-converted - please check the amount");
  });

  it("re-estimates nearby fuel mileage when the mileage came directly off the receipt, same as service", async () => {
    await commitReceiptItem(email, bike, makeItem({ category: "mods", description: "Heated grips", mileageOnReceipt: 15000 }));
    expect(mocks.queryTrackerDocs).toHaveBeenCalledTimes(8);
  });
});

describe("bills category", () => {
  it("guesses the bill type and composes the right aiDescription", async () => {
    const item = makeItem({ category: "bills", description: "Annual insurance renewal", costGbp: 250 });
    const result: any = await commitReceiptItem(email, bike, item);

    expect(result.billType).toBe("insurance");
    expect(result.aiDescription).toBe("Insurance at Dave's Motorcycles - 14 High Street, Colchester (Insurance, tax & MOT)");
    const [, , , payload] = callsFor("bill")[0];
    expect(payload).toMatchObject({ bikeId: "bike-1", billType: "insurance", cost: 250, needsReview: true });
    expect(payload.mileage).toBeUndefined();
  });

  it("creates a renewal reminder keyed to bill:<billType>, based on the bike's current mileage", async () => {
    await commitReceiptItem(email, bike, makeItem({ category: "bills", description: "Annual insurance renewal" }));
    const [, , , payload] = callsFor("reminder")[0];
    expect(payload).toMatchObject({ name: "Insurance renewal", intervalType: "months", intervalValue: 12, baseMileage: 20000, sourceKey: "bill:insurance" });
  });

  it("never attempts a mileage estimate, and never triggers fuel re-estimation, for a bill", async () => {
    await commitReceiptItem(email, bike, makeItem({ category: "bills", description: "Annual insurance renewal" }));
    // Only the 4 initial fetches - bills have no mileage concept, so the
    // reestimateNearbyFuelLogs pass (which would add 4 more) never runs.
    expect(mocks.queryTrackerDocs).toHaveBeenCalledTimes(4);
  });

  it("has no mileage-related fields at all on the returned entry", async () => {
    const result: any = await commitReceiptItem(email, bike, makeItem({ category: "bills", description: "Annual insurance renewal" }));
    expect(result.mileage).toBeUndefined();
    expect(result.mileageNeedsManualEntry).toBeUndefined();
  });
});

describe("batchHints and boundsOnlyHints", () => {
  it("uses batchHints as genuine trusted anchors, capable of driving an interpolation", async () => {
    const batchHints = [
      { date: "2025-01-01", mileage: 8000 },
      { date: "2025-03-01", mileage: 9200 },
    ];
    const item = makeItem({ description: "Basic service", date: "2025-02-01", mileageOnReceipt: null });
    const result: any = await commitReceiptItem(email, bike, item, batchHints);

    expect(result.mileage).toBe(8631);
    expect(result.mileageNeedsManualEntry).toBe(false);
  });

  // boundsOnlyHints deliberately do NOT feed the rate/interpolation
  // calculation itself (unlike batchHints) - they only cap the final
  // result. Here the bike's whole-lifetime estimate would land well
  // above 1,000, but a boundsOnlyHint dated after the target, showing a
  // lower mileage, forces the result down to exactly that ceiling.
  it("uses boundsOnlyHints only to cap the result, never to compute it", async () => {
    const boundsOnlyHints = [{ date: "2025-06-01", mileage: 1000 }];
    const item = makeItem({ description: "Basic service", date: "2025-01-01", mileageOnReceipt: null });
    const result: any = await commitReceiptItem(email, bike, item, [], boundsOnlyHints);

    expect(result.mileage).toBe(1000);
    expect(result.mileageNeedsManualEntry).toBe(false);
    expect(result.mileageWarningText).toBeUndefined();
  });
});
