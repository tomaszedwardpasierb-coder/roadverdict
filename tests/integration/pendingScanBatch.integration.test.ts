// Place at: tests/integration/pendingScanBatch.integration.test.ts
//
// Exercises purgeStalePendingScanBatches() (src/lib/tracker/pendingScanBatch.ts)
// against the real Cosmos DB Emulator - proves the createdAt cutoff
// query behaves correctly against the real query engine, not just a
// mock's idea of it. Batches are partitioned per-user-email, so each
// test gets its own fresh, isolated partition like the rest of this
// app's per-owner doc types.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getContainer } from "@/lib/cosmos";
import { getPendingScanBatch, purgeStalePendingScanBatches } from "@/lib/tracker/pendingScanBatch";
import { cleanupPartition, testPk } from "./testCosmos";

async function createRawBatch(email: string, bikeId: string, createdAt: string): Promise<void> {
  const container = getContainer();
  await container.items.create({
    id: `${email}::pendingScanBatch::${bikeId}`,
    pk: email,
    type: "pendingScanBatch",
    bikeId,
    date: createdAt,
    createdAt,
    items: [{ fileName: "receipt.jpg", category: "fuel" }],
  });
}

function hoursAgo(n: number): string {
  const d = new Date();
  d.setHours(d.getHours() - n);
  return d.toISOString();
}

describe("purgeStalePendingScanBatches against a real Cosmos container (emulator)", () => {
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

  it("deletes a batch older than the 48-hour cutoff", async () => {
    const email = trackPk("stale-batch");
    await createRawBatch(email, "bike-1", hoursAgo(72));

    await purgeStalePendingScanBatches();

    expect(await getPendingScanBatch(email, "bike-1")).toBeNull();
  });

  it("keeps a batch within the cutoff", async () => {
    const email = trackPk("fresh-batch");
    await createRawBatch(email, "bike-1", hoursAgo(1));

    await purgeStalePendingScanBatches();

    expect(await getPendingScanBatch(email, "bike-1")).not.toBeNull();
  });
});
