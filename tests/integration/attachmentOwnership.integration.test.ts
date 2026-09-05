// Place at: tests/integration/attachmentOwnership.integration.test.ts
//
// Exercises ownsAttachment() (src/lib/tracker/attachmentOwnership.ts)
// against the real Cosmos DB Emulator - this is the actual access-
// control gate behind the attachment and verify-receipt routes, and
// its ARRAY_CONTAINS partial-match query is exactly the kind of thing
// a mocked container can't prove works: a mock returns whatever a
// test tells it to, regardless of whether the real query syntax is
// even valid or means what it's assumed to mean.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ownsAttachment } from "@/lib/tracker/attachmentOwnership";
import { createTrackerDoc, type TrackerDocBase, type Attachment } from "@/lib/tracker/cosmosHelpers";
import { getContainer } from "@/lib/cosmos";
import { cleanupPartition, testPk } from "./testCosmos";

interface FixtureDoc extends TrackerDocBase {
  type: "serviceRecord" | "fuelLog" | "mod" | "bill";
  bikeId: string;
  attachments?: Attachment[];
}

function attachment(blobName: string): Attachment {
  return { blobName, fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: new Date().toISOString() };
}

describe("ownsAttachment against a real Cosmos container (emulator)", () => {
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

  it("returns true when the blobName appears on a service record's attachments", async () => {
    const pk = trackPk("owns-service-record");
    await createTrackerDoc<FixtureDoc>(pk, "sr", "serviceRecord", {
      date: "2026-01-01",
      bikeId: "bike-1",
      attachments: [attachment("real-blob.jpg")],
    });

    expect(await ownsAttachment(pk, "real-blob.jpg")).toBe(true);
  });

  it("returns true for a match on a fuel log, mod, or bill - every attachment-bearing type", async () => {
    const pk = trackPk("owns-all-types");
    await createTrackerDoc<FixtureDoc>(pk, "fl", "fuelLog", { date: "2026-01-01", bikeId: "bike-1", attachments: [attachment("fuel-blob.jpg")] });
    await createTrackerDoc<FixtureDoc>(pk, "md", "mod", { date: "2026-01-01", bikeId: "bike-1", attachments: [attachment("mod-blob.jpg")] });
    await createTrackerDoc<FixtureDoc>(pk, "bl", "bill", { date: "2026-01-01", bikeId: "bike-1", attachments: [attachment("bill-blob.jpg")] });

    expect(await ownsAttachment(pk, "fuel-blob.jpg")).toBe(true);
    expect(await ownsAttachment(pk, "mod-blob.jpg")).toBe(true);
    expect(await ownsAttachment(pk, "bill-blob.jpg")).toBe(true);
  });

  it("returns false when the blobName doesn't appear on any of this partition's records", async () => {
    const pk = trackPk("owns-no-match");
    await createTrackerDoc<FixtureDoc>(pk, "sr", "serviceRecord", {
      date: "2026-01-01",
      bikeId: "bike-1",
      attachments: [attachment("real-blob.jpg")],
    });

    expect(await ownsAttachment(pk, "someone-elses-blob.jpg")).toBe(false);
  });

  it("returns false for a record with no attachments field at all", async () => {
    const pk = trackPk("owns-no-attachments-field");
    await createTrackerDoc<FixtureDoc>(pk, "sr", "serviceRecord", { date: "2026-01-01", bikeId: "bike-1" });

    expect(await ownsAttachment(pk, "any-blob.jpg")).toBe(false);
  });

  // The actual security property this whole function exists for: a
  // blobName real elsewhere must never resolve to true for a caller
  // who isn't its owner, no matter how the query is phrased.
  it("never matches a blobName that only exists in a DIFFERENT partition - no cross-account leak", async () => {
    const ownerPk = trackPk("owns-isolation-owner");
    const attackerPk = trackPk("owns-isolation-attacker");
    await createTrackerDoc<FixtureDoc>(ownerPk, "sr", "serviceRecord", {
      date: "2026-01-01",
      bikeId: "bike-1",
      attachments: [attachment("owners-private-receipt.jpg")],
    });

    expect(await ownsAttachment(attackerPk, "owners-private-receipt.jpg")).toBe(false);
    // Confirms the false above is a real isolation result, not the
    // fixture doc having silently failed to write in the first place.
    expect(await ownsAttachment(ownerPk, "owners-private-receipt.jpg")).toBe(true);
  });

  it("ignores a doc type that isn't one of the four attachment-bearing kinds, even with a matching blobName", async () => {
    const pk = trackPk("owns-wrong-type");
    const container = getContainer();
    await container.items.create({
      id: `${pk}::reminder::1`,
      pk,
      type: "reminder",
      date: "2026-01-01",
      createdAt: new Date().toISOString(),
      attachments: [attachment("sneaky-blob.jpg")],
    });

    expect(await ownsAttachment(pk, "sneaky-blob.jpg")).toBe(false);
  });
});
