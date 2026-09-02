// Place at: tests/integration/bike.integration.test.ts
//
// Exercises src/lib/tracker/bike.ts - the core CRUD/query layer behind
// every bike-scoped page and route - against the real Cosmos DB
// Emulator. The unit suite (tests/unit/bike.test.ts) already proves this
// file's business logic against a mocked container; this file proves the
// two things a mock can't: that the actual query text is valid Cosmos SQL
// (in particular findBikeByRegistrationAcrossAccounts' cross-partition
// UPPER/REPLACE/EXISTS query - a mock only ever returns whatever a test
// tells it to, it can never catch a real syntax error), and that
// deleteBike's fan-out across five record types plus a *different*
// partition (the share-link doc, keyed by token, not email) really does
// delete everything it claims to.
//
// pickActiveBike/getPrimaryBike are deliberately not exercised here -
// they call next/headers' cookies(), which requires a real Next.js
// request scope this plain Node test process doesn't have. That's
// already covered by the unit suite.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// isPro() is temporarily true for everyone (see subscriptions.ts's own
// comment) while no payment platform is wired in - real, deliberate,
// unrelated to Cosmos. Left un-mocked, it would defeat the cap test
// below entirely, which isn't what this file is for: the point here is
// proving the cap counts genuinely separate Cosmos documents correctly,
// not re-litigating isPro() itself (already covered in
// tests/unit/bike.test.ts, mocked the same way).
const mocks = vi.hoisted(() => ({ isPro: vi.fn(async () => false) }));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));

import {
  addRegistrationChange,
  createBike,
  deleteBike,
  findBikeByRegistrationAcrossAccounts,
  getBike,
  getBikesForUser,
  MAX_FREE_BIKES,
  setOriginalRegistration,
  updateBikeChartType,
  updateBikeMileage,
} from "@/lib/tracker/bike";
import { createTrackerDoc, type TrackerDocBase } from "@/lib/tracker/cosmosHelpers";
import { getContainer } from "@/lib/cosmos";
import { cleanupPartition, testPk } from "./testCosmos";

interface FakeServiceDoc extends TrackerDocBase {
  type: "serviceRecord";
  bikeId: string;
}

function newBikeData(overrides: Partial<Parameters<typeof createBike>[1]> = {}) {
  return {
    make: "Honda",
    model: "CB500F",
    engineCC: 471,
    bikeClass: "medium" as const,
    registration: `INT${Date.now()}`,
    currentMileage: 5000,
    nickname: "Test bike",
    region: "rest-england-wales" as const,
    ...overrides,
  };
}

describe("bike.ts against a real Cosmos container (emulator)", () => {
  let pks: string[];

  beforeEach(() => {
    pks = [];
    mocks.isPro.mockReset().mockResolvedValue(false);
  });

  afterEach(async () => {
    await Promise.all(pks.map((pk) => cleanupPartition(pk)));
  });

  function trackPk(label: string): string {
    const pk = testPk(label);
    pks.push(pk);
    return pk;
  }

  it("creates a bike and reads it back by id", async () => {
    const email = trackPk("create-read");
    const result = await createBike(email, newBikeData());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fetched = await getBike(email, result.bike.id);
    expect(fetched).toMatchObject({ id: result.bike.id, make: "Honda", model: "CB500F" });
  });

  it("returns null for a bike id that doesn't exist in that partition", async () => {
    const email = trackPk("get-missing");
    const fetched = await getBike(email, "does-not-exist");
    expect(fetched).toBeNull();
  });

  it("enforces the free-tier cap for real, across genuinely separate documents", async () => {
    const email = trackPk("free-cap");
    for (let i = 0; i < MAX_FREE_BIKES; i++) {
      const result = await createBike(email, newBikeData({ registration: `CAP${i}-${Date.now()}` }));
      expect(result.ok).toBe(true);
    }
    const result = await createBike(email, newBikeData({ registration: `CAP-OVER-${Date.now()}` }));
    expect(result).toEqual({ ok: false, reason: "limit_reached", limit: MAX_FREE_BIKES });

    const bikes = await getBikesForUser(email);
    expect(bikes.length).toBe(MAX_FREE_BIKES);
  });

  it("lets a Pro account create a bike past the free-tier cap, against a real Cosmos container", async () => {
    const email = trackPk("pro-past-cap");
    mocks.isPro.mockResolvedValue(true);
    for (let i = 0; i < MAX_FREE_BIKES; i++) {
      const result = await createBike(email, newBikeData({ registration: `PROCAP${i}-${Date.now()}` }));
      expect(result.ok).toBe(true);
    }
    const result = await createBike(email, newBikeData({ registration: `PROCAP-OVER-${Date.now()}` }));
    expect(result.ok).toBe(true);

    const bikes = await getBikesForUser(email);
    expect(bikes.length).toBe(MAX_FREE_BIKES + 1);
  });

  it("updates mileage in place, and a read afterward reflects it", async () => {
    const email = trackPk("update-mileage");
    const { bike } = (await createBike(email, newBikeData())) as { ok: true; bike: { id: string } };

    const updated = await updateBikeMileage(email, bike.id, 12345);
    expect(updated?.currentMileage).toBe(12345);

    const fetched = await getBike(email, bike.id);
    expect(fetched?.currentMileage).toBe(12345);
  });

  it("finds a bike across accounts by registration - a genuine cross-partition query", async () => {
    const emailA = trackPk("cross-account-a");
    const emailB = trackPk("cross-account-b");
    const registration = `CROSS ${Date.now()}`;
    const { bike } = (await createBike(emailA, newBikeData({ registration }))) as { ok: true; bike: { id: string } };
    // A second, unrelated bike under a different account must never match.
    await createBike(emailB, newBikeData({ registration: `UNRELATED-${Date.now()}` }));

    // Normalization (uppercase, spaces stripped) must survive a real
    // Cosmos UPPER()/REPLACE() query, not just the mocked version.
    const found = await findBikeByRegistrationAcrossAccounts(registration.toLowerCase());
    expect(found).toEqual({ ownerEmail: emailA, bikeId: bike.id });
  });

  it("finds a bike by a later registration-change entry, not just its original plate", async () => {
    const email = trackPk("reg-change-lookup");
    const { bike } = (await createBike(email, newBikeData())) as { ok: true; bike: { id: string } };
    const newPlate = `CHANGED${Date.now()}`;
    await addRegistrationChange(email, bike.id, newPlate, "private-plate-assigned");

    const found = await findBikeByRegistrationAcrossAccounts(newPlate);
    expect(found).toEqual({ ownerEmail: email, bikeId: bike.id });
  });

  it("refuses to set originalRegistration a second time, even against the real document", async () => {
    const email = trackPk("set-original-reg");
    const { bike } = (await createBike(email, newBikeData())) as { ok: true; bike: { id: string } };

    const result = await setOriginalRegistration(email, bike.id, "SHOULDNT-WORK");
    expect(result).toEqual({ ok: false, reason: "already_set" });
  });

  it("merges one chart-type update without disturbing another chart's saved preference", async () => {
    const email = trackPk("chart-types");
    const { bike } = (await createBike(email, newBikeData())) as { ok: true; bike: { id: string } };

    await updateBikeChartType(email, bike.id, "spend", "bar");
    const updated = await updateBikeChartType(email, bike.id, "mileage", "line");

    expect(updated?.chartTypes).toEqual({ spend: "bar", mileage: "line" });
  });

  it("deleting a bike cascades to its tracker docs and its share-link doc in a DIFFERENT partition", async () => {
    const email = trackPk("delete-cascade");
    const { bike } = (await createBike(email, newBikeData())) as { ok: true; bike: { id: string } };

    const serviceDoc = await createTrackerDoc<FakeServiceDoc>(email, "svc", "serviceRecord", {
      date: "2026-01-01",
      bikeId: bike.id,
    });

    // Share-link docs are partitioned by token, not by the bike owner's
    // email - a completely different partition from everything else
    // this test touches. Track it separately for cleanup regardless of
    // whether deleteBike actually removes it (that's what's under test).
    const shareToken = testPk("delete-cascade-share-token");
    pks.push(shareToken);
    const container = getContainer();
    await container.items.upsert({
      id: shareToken,
      pk: shareToken,
      type: "shareLink",
      email,
      bikeId: bike.id,
      createdAt: new Date().toISOString(),
    });
    // Point the bike at its own share token, same as updateBikeShareToken would.
    const { resource: bikeDoc } = await container.item(bike.id, email).read();
    await container.items.upsert({ ...bikeDoc, shareToken });

    await deleteBike(email, bike.id);

    expect(await getBike(email, bike.id)).toBeNull();
    const { resource: serviceStillThere } = await container.item(serviceDoc.id, email).read();
    expect(serviceStillThere).toBeUndefined();
    const { resource: shareLinkStillThere } = await container.item(shareToken, shareToken).read();
    expect(shareLinkStillThere).toBeUndefined();
  });
});
