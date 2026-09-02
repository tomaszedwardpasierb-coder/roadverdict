// Place at: tests/integration/bikeTransferRequest.integration.test.ts
//
// Exercises src/lib/tracker/bikeTransferRequest.ts against the real
// Cosmos DB Emulator. getBikeTransferRequestByToken is a genuine
// cross-partition query keyed on a real hashed token (via
// @/lib/auth/crypto, not mocked) - proving the actual hash-matches-raw-
// token lookup works against real Cosmos, not just a mock that would
// return whatever a test told it to regardless of the real hash.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBikeTransferRequest,
  decideBikeTransferRequest,
  getBikeTransferRequestById,
  getBikeTransferRequestByToken,
  getPendingTransferRequestsForOwner,
  hasActiveTransferRequestForBike,
} from "@/lib/tracker/bikeTransferRequest";
import { cleanupPartition, testPk } from "./testCosmos";

const bikeSummary = { make: "Honda", model: "CB500F", isCustomBuild: false };

describe("bikeTransferRequest.ts against a real Cosmos container (emulator)", () => {
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

  it("creates a request and resolves it back by its real (hashed) token", async () => {
    const owner = trackPk("create-resolve");
    const { doc, token } = await createBikeTransferRequest({
      ownerEmail: owner,
      bikeId: "bike-1",
      recipientEmail: "buyer@example.com",
      bikeSummary,
    });

    const resolved = await getBikeTransferRequestByToken(token);
    expect(resolved?.id).toBe(doc.id);
    expect(resolved?.status).toBe("pending");
  });

  it("a token that doesn't match any real hash resolves to null, not the wrong request", async () => {
    const owner = trackPk("wrong-token");
    await createBikeTransferRequest({ ownerEmail: owner, bikeId: "bike-1", recipientEmail: "buyer@example.com", bikeSummary });

    expect(await getBikeTransferRequestByToken("completely-made-up-token")).toBeNull();
  });

  it("getPendingTransferRequestsForOwner is scoped to the owner's own partition and only returns pending ones", async () => {
    const owner = trackPk("pending-for-owner");
    const otherOwner = trackPk("pending-other-owner");
    const { doc: pendingReq } = await createBikeTransferRequest({ ownerEmail: owner, bikeId: "bike-1", recipientEmail: "buyer@example.com", bikeSummary });
    const { doc: toDecide } = await createBikeTransferRequest({ ownerEmail: owner, bikeId: "bike-2", recipientEmail: "buyer2@example.com", bikeSummary });
    await decideBikeTransferRequest(toDecide.id, owner, "accepted");
    // A different owner's pending request must never show up here.
    await createBikeTransferRequest({ ownerEmail: otherOwner, bikeId: "bike-9", recipientEmail: "someone@example.com", bikeSummary });

    const pending = await getPendingTransferRequestsForOwner(owner);
    expect(pending.map((r) => r.id)).toEqual([pendingReq.id]);
  });

  it("hasActiveTransferRequestForBike treats pending and accepted as active, but not declined", async () => {
    const owner = trackPk("active-check");
    const { doc } = await createBikeTransferRequest({ ownerEmail: owner, bikeId: "bike-1", recipientEmail: "buyer@example.com", bikeSummary });

    expect(await hasActiveTransferRequestForBike(owner, "bike-1")).toBe(true);
    expect(await hasActiveTransferRequestForBike(owner, "bike-2")).toBe(false);

    await decideBikeTransferRequest(doc.id, owner, "declined");
    expect(await hasActiveTransferRequestForBike(owner, "bike-1")).toBe(false);
  });

  it("decideBikeTransferRequest updates status and decidedAt on the real document, and getBikeTransferRequestById sees it", async () => {
    const owner = trackPk("decide-and-fetch");
    const { doc } = await createBikeTransferRequest({ ownerEmail: owner, bikeId: "bike-1", recipientEmail: "buyer@example.com", bikeSummary });

    const decided = await decideBikeTransferRequest(doc.id, owner, "accepted");
    expect(decided?.status).toBe("accepted");
    expect(decided?.decidedAt).toBeDefined();

    const fetched = await getBikeTransferRequestById(doc.id, owner);
    expect(fetched?.status).toBe("accepted");
  });

  it("returns null deciding or fetching a request id that doesn't exist in that owner's partition", async () => {
    const owner = trackPk("missing-request");
    expect(await decideBikeTransferRequest("does-not-exist", owner, "accepted")).toBeNull();
    expect(await getBikeTransferRequestById("does-not-exist", owner)).toBeNull();
  });
});
