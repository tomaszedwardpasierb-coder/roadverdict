import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  CosmosClient: vi.fn(),
  database: vi.fn(),
  container: vi.fn(),
}));

vi.mock("@azure/cosmos", () => ({
  CosmosClient: mocks.CosmosClient,
}));

const fakeContainer = { marker: "app-container" };

beforeEach(() => {
  vi.resetModules();
  mocks.CosmosClient.mockReset();
  mocks.database.mockReset();
  mocks.container.mockReset();
  mocks.container.mockReturnValue(fakeContainer);
  mocks.database.mockReturnValue({ container: mocks.container });
  mocks.CosmosClient.mockImplementation(function () {
    return { database: mocks.database };
  });
  delete process.env.COSMOS_CONNECTION_STRING;
});

describe("getContainer", () => {
  it("throws when COSMOS_CONNECTION_STRING is not set", async () => {
    const { getContainer } = await import("@/lib/cosmos");
    expect(() => getContainer()).toThrow("Missing COSMOS_CONNECTION_STRING environment variable");
    expect(mocks.CosmosClient).not.toHaveBeenCalled();
  });

  it("constructs CosmosClient with the connection string", async () => {
    process.env.COSMOS_CONNECTION_STRING = "AccountEndpoint=https://x;AccountKey=y;";
    const { getContainer } = await import("@/lib/cosmos");
    getContainer();
    expect(mocks.CosmosClient).toHaveBeenCalledWith("AccountEndpoint=https://x;AccountKey=y;");
  });

  it("selects the roadverdict database", async () => {
    process.env.COSMOS_CONNECTION_STRING = "conn";
    const { getContainer } = await import("@/lib/cosmos");
    getContainer();
    expect(mocks.database).toHaveBeenCalledWith("roadverdict");
  });

  it("selects the app container within that database", async () => {
    process.env.COSMOS_CONNECTION_STRING = "conn";
    const { getContainer } = await import("@/lib/cosmos");
    getContainer();
    expect(mocks.container).toHaveBeenCalledWith("app");
  });

  it("returns the resolved container instance", async () => {
    process.env.COSMOS_CONNECTION_STRING = "conn";
    const { getContainer } = await import("@/lib/cosmos");
    expect(getContainer()).toBe(fakeContainer);
  });

  it("caches the container across calls, constructing the client only once", async () => {
    process.env.COSMOS_CONNECTION_STRING = "conn";
    const { getContainer } = await import("@/lib/cosmos");
    getContainer();
    getContainer();
    getContainer();
    expect(mocks.CosmosClient).toHaveBeenCalledOnce();
    expect(mocks.database).toHaveBeenCalledOnce();
    expect(mocks.container).toHaveBeenCalledOnce();
  });

  it("returns the same container instance across repeated calls", async () => {
    process.env.COSMOS_CONNECTION_STRING = "conn";
    const { getContainer } = await import("@/lib/cosmos");
    const first = getContainer();
    const second = getContainer();
    expect(first).toBe(second);
  });
});
