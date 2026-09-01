import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getContainer: vi.fn(),
  read: vi.fn(),
  item: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: mocks.getContainer,
}));

import { getExchangeRates } from "@/lib/tracker/currencyRates";

beforeEach(() => {
  mocks.getContainer.mockReset();
  mocks.read.mockReset();
  mocks.item.mockReset();

  mocks.item.mockReturnValue({ read: mocks.read });
  mocks.getContainer.mockReturnValue({ item: mocks.item });
});

describe("getExchangeRates", () => {
  it("returns the stored rates document when it exists", async () => {
    const rates = { rates: { EUR: 1.17, USD: 1.27 }, fetchedAt: "2025-06-01T00:00:00.000Z" };
    mocks.read.mockResolvedValue({ resource: rates });
    const result = await getExchangeRates();
    expect(result).toEqual(rates);
  });

  it("reads the fixed system-partitioned exchangeRates document", async () => {
    mocks.read.mockResolvedValue({ resource: { rates: {}, fetchedAt: "2025-06-01T00:00:00.000Z" } });
    await getExchangeRates();
    expect(mocks.item).toHaveBeenCalledWith("exchangeRates", "system");
  });

  it("returns null when no document exists yet", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    const result = await getExchangeRates();
    expect(result).toBeNull();
  });

  it("fails soft to null when the read call throws (Cosmos unreachable)", async () => {
    mocks.read.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await getExchangeRates();
    expect(result).toBeNull();
  });

  it("fails soft to null when getContainer itself throws (e.g. missing connection string)", async () => {
    mocks.getContainer.mockImplementation(() => {
      throw new Error("Missing COSMOS_CONNECTION_STRING environment variable");
    });
    const result = await getExchangeRates();
    expect(result).toBeNull();
  });
});
