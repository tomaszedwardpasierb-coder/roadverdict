// Place at: tests/integration/cosmosHelpers.integration.test.ts
//
// Exercises the shared repository layer (src/lib/tracker/cosmosHelpers.ts)
// against the real Cosmos DB Emulator - no @/lib/cosmos mock. Every other
// tracker doc type (bill, fuelLog, mod, serviceRecord, reminder, ...) is
// built on these five functions, and the unit suite has already proven
// their business logic against a mocked container; what a mock can't
// prove is that the actual query shape, partition-key scoping, and
// upsert/point-read semantics genuinely work against real Cosmos. This
// file is that proof.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  copyTrackerDoc,
  createTrackerDoc,
  deleteTrackerDoc,
  getTrackerDocById,
  queryTrackerDocs,
  updateTrackerDoc,
  type TrackerDocBase,
} from "@/lib/tracker/cosmosHelpers";
import { cleanupPartition, testPk } from "./testCosmos";

interface IntegrationTestDoc extends TrackerDocBase {
  type: "integrationTestDoc";
  bikeId: string;
  note: string;
}

describe("cosmosHelpers against a real Cosmos container (emulator)", () => {
  let pks: string[];

  beforeEach(() => {
    pks = [];
  });

  afterEach(async () => {
    await Promise.all(pks.map((pk) => cleanupPartition(pk)));
  });

  function trackPk(label: string): string {
    const pk = testPk(label);
    pks.push(pk);
    return pk;
  }

  it("creates a doc and reads it back by id", async () => {
    const pk = trackPk("create-read");
    const created = await createTrackerDoc<IntegrationTestDoc>(pk, "itd", "integrationTestDoc", {
      date: "2026-01-01",
      bikeId: "bike-1",
      note: "hello",
    });

    expect(created.id).toContain(pk);
    expect(created.pk).toBe(pk);

    const fetched = await getTrackerDocById<IntegrationTestDoc>(pk, created.id);
    expect(fetched).toMatchObject({ id: created.id, note: "hello", bikeId: "bike-1" });
  });

  it("queries every doc of a type scoped to one bike within a partition, newest first", async () => {
    const pk = trackPk("query");
    const older = await createTrackerDoc<IntegrationTestDoc>(pk, "itd", "integrationTestDoc", {
      date: "2026-01-01",
      bikeId: "bike-1",
      note: "older",
    });
    const newer = await createTrackerDoc<IntegrationTestDoc>(pk, "itd", "integrationTestDoc", {
      date: "2026-02-01",
      bikeId: "bike-1",
      note: "newer",
    });
    // A doc for a different bike in the SAME partition must never show up.
    await createTrackerDoc<IntegrationTestDoc>(pk, "itd", "integrationTestDoc", {
      date: "2026-03-01",
      bikeId: "bike-2",
      note: "other bike",
    });

    const results = await queryTrackerDocs<IntegrationTestDoc>(pk, "integrationTestDoc", "bike-1");
    expect(results.map((r) => r.id)).toEqual([newer.id, older.id]);
  });

  it("updates a doc in place without disturbing fields it didn't touch", async () => {
    const pk = trackPk("update");
    const created = await createTrackerDoc<IntegrationTestDoc>(pk, "itd", "integrationTestDoc", {
      date: "2026-01-01",
      bikeId: "bike-1",
      note: "original",
    });

    const updated = await updateTrackerDoc<IntegrationTestDoc>(pk, created.id, { note: "changed" });
    expect(updated?.note).toBe("changed");
    expect(updated?.bikeId).toBe("bike-1"); // untouched field survives the read-merge-upsert

    const fetched = await getTrackerDocById<IntegrationTestDoc>(pk, created.id);
    expect(fetched?.note).toBe("changed");
  });

  it("returns null updating a doc that doesn't exist, rather than creating one", async () => {
    const pk = trackPk("update-missing");
    const result = await updateTrackerDoc<IntegrationTestDoc>(pk, "does-not-exist", { note: "x" });
    expect(result).toBeNull();
  });

  it("deletes a doc so it's genuinely gone, not just soft-hidden", async () => {
    const pk = trackPk("delete");
    const created = await createTrackerDoc<IntegrationTestDoc>(pk, "itd", "integrationTestDoc", {
      date: "2026-01-01",
      bikeId: "bike-1",
      note: "to be deleted",
    });

    await deleteTrackerDoc(pk, created.id);
    const fetched = await getTrackerDocById<IntegrationTestDoc>(pk, created.id);
    expect(fetched).toBeNull();
  });

  it("copies a doc into a different account/bike's partition without touching the original", async () => {
    const fromPk = trackPk("copy-from");
    const toPk = trackPk("copy-to");
    const original = await createTrackerDoc<IntegrationTestDoc>(fromPk, "itd", "integrationTestDoc", {
      date: "2026-01-01",
      bikeId: "bike-1",
      note: "original owner's record",
    });

    const copy = await copyTrackerDoc<IntegrationTestDoc>(original, "itd", toPk, "bike-2");

    expect(copy.id).not.toBe(original.id);
    expect(copy.pk).toBe(toPk);
    expect(copy.bikeId).toBe("bike-2");
    expect(copy.note).toBe("original owner's record");

    // the original is untouched in its own partition
    const stillThere = await getTrackerDocById<IntegrationTestDoc>(fromPk, original.id);
    expect(stillThere).toMatchObject({ note: "original owner's record", bikeId: "bike-1" });
  });

  it("scopes queries to their own partition - a doc in another partition never leaks across", async () => {
    const pkA = trackPk("isolation-a");
    const pkB = trackPk("isolation-b");
    await createTrackerDoc<IntegrationTestDoc>(pkA, "itd", "integrationTestDoc", {
      date: "2026-01-01",
      bikeId: "bike-1",
      note: "belongs to A",
    });

    const resultsForB = await queryTrackerDocs<IntegrationTestDoc>(pkB, "integrationTestDoc", "bike-1");
    expect(resultsForB).toEqual([]);
  });
});
