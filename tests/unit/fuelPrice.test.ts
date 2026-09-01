import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getContainer: vi.fn(),
  read: vi.fn(),
  item: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: mocks.getContainer,
}));

import { getCurrentPetrolPricePenceLitre, saveCurrentPetrolPrice } from "@/lib/fuelPrice";

beforeEach(() => {
  mocks.getContainer.mockReset();
  mocks.read.mockReset();
  mocks.item.mockReset();
  mocks.upsert.mockReset();

  mocks.item.mockReturnValue({ read: mocks.read });
  mocks.getContainer.mockReturnValue({ item: mocks.item, items: { upsert: mocks.upsert } });
});

describe("getCurrentPetrolPricePenceLitre", () => {
  it("returns the stored price when the document exists", async () => {
    mocks.read.mockResolvedValue({ resource: { pricePenceLitre: 142.9 } });
    const result = await getCurrentPetrolPricePenceLitre();
    expect(result).toBe(142.9);
  });

  it("reads the fixed system-partitioned fuelPrice document", async () => {
    mocks.read.mockResolvedValue({ resource: { pricePenceLitre: 142.9 } });
    await getCurrentPetrolPricePenceLitre();
    expect(mocks.item).toHaveBeenCalledWith("fuelPrice", "system");
  });

  it("falls back to the hardcoded price when no document exists yet", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    const result = await getCurrentPetrolPricePenceLitre();
    expect(result).toBe(150.53);
  });

  it("falls back to the hardcoded price when the stored value isn't a number", async () => {
    mocks.read.mockResolvedValue({ resource: { pricePenceLitre: "not-a-number" } });
    const result = await getCurrentPetrolPricePenceLitre();
    expect(result).toBe(150.53);
  });

  it("falls back to the hardcoded price when the read call throws (Cosmos unreachable)", async () => {
    mocks.read.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await getCurrentPetrolPricePenceLitre();
    expect(result).toBe(150.53);
  });

  it("falls back to the hardcoded price when getContainer itself throws (e.g. missing connection string)", async () => {
    mocks.getContainer.mockImplementation(() => {
      throw new Error("Missing COSMOS_CONNECTION_STRING environment variable");
    });
    const result = await getCurrentPetrolPricePenceLitre();
    expect(result).toBe(150.53);
  });
});

describe("saveCurrentPetrolPrice", () => {
  it("upserts a record with the fixed id/pk/type and the given price and week", async () => {
    await saveCurrentPetrolPrice(148.2, "13/07/2026");
    expect(mocks.upsert).toHaveBeenCalledOnce();
    const record = mocks.upsert.mock.calls[0][0];
    expect(record).toMatchObject({
      id: "fuelPrice",
      pk: "system",
      type: "fuelPrice",
      pricePenceLitre: 148.2,
      weekCommencing: "13/07/2026",
    });
  });

  it("stamps fetchedAt with a current ISO timestamp", async () => {
    const before = Date.now();
    await saveCurrentPetrolPrice(148.2, "13/07/2026");
    const after = Date.now();
    const ts = new Date(mocks.upsert.mock.calls[0][0].fetchedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("propagates the error rather than failing soft, unlike the read path", async () => {
    mocks.upsert.mockRejectedValue(new Error("Cosmos unavailable"));
    await expect(saveCurrentPetrolPrice(148.2, "13/07/2026")).rejects.toThrow("Cosmos unavailable");
  });
});
