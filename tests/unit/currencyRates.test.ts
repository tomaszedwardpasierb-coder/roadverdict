import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getContainer: vi.fn(),
  read: vi.fn(),
  item: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: mocks.getContainer,
}));

// getExchangeRates keeps a module-level TTL cache, so each test needs a
// genuinely fresh module instance - otherwise the first test's result
// would still be cached and served to every test after it.
let getExchangeRates: typeof import("@/lib/tracker/currencyRates").getExchangeRates;

beforeEach(async () => {
  vi.resetModules();
  mocks.getContainer.mockReset();
  mocks.read.mockReset();
  mocks.item.mockReset();

  mocks.item.mockReturnValue({ read: mocks.read });
  mocks.getContainer.mockReturnValue({ item: mocks.item });

  ({ getExchangeRates } = await import("@/lib/tracker/currencyRates"));
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

  it("caches a successful read, not hitting Cosmos again on the next call", async () => {
    const rates = { rates: { EUR: 1.17 }, fetchedAt: "2025-06-01T00:00:00.000Z" };
    mocks.read.mockResolvedValue({ resource: rates });
    await getExchangeRates();
    await getExchangeRates();
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed read, retrying Cosmos on the next call", async () => {
    mocks.read.mockRejectedValue(new Error("ECONNREFUSED"));
    await getExchangeRates();
    await getExchangeRates();
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
});
