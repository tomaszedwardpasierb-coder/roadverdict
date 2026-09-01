import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fromConnectionString: vi.fn(),
  getContainerClient: vi.fn(),
  createIfNotExists: vi.fn(),
}));

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: { fromConnectionString: mocks.fromConnectionString },
}));

const fakeContainer = { marker: "attachments-container", createIfNotExists: mocks.createIfNotExists };

beforeEach(() => {
  vi.resetModules();
  mocks.fromConnectionString.mockReset();
  mocks.getContainerClient.mockReset();
  mocks.createIfNotExists.mockReset();
  mocks.createIfNotExists.mockResolvedValue(undefined);
  mocks.getContainerClient.mockReturnValue(fakeContainer);
  mocks.fromConnectionString.mockReturnValue({ getContainerClient: mocks.getContainerClient });
  delete process.env.AZURE_STORAGE_CONNECTION_STRING;
});

describe("getAttachmentContainer", () => {
  it("throws when AZURE_STORAGE_CONNECTION_STRING is not set", async () => {
    const { getAttachmentContainer } = await import("@/lib/blobStorage");
    await expect(getAttachmentContainer()).rejects.toThrow(
      "Missing AZURE_STORAGE_CONNECTION_STRING environment variable"
    );
    expect(mocks.fromConnectionString).not.toHaveBeenCalled();
  });

  it("builds the client from the connection string", async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = "DefaultEndpointsProtocol=https;AccountName=x;";
    const { getAttachmentContainer } = await import("@/lib/blobStorage");
    await getAttachmentContainer();
    expect(mocks.fromConnectionString).toHaveBeenCalledWith(
      "DefaultEndpointsProtocol=https;AccountName=x;"
    );
  });

  it("resolves the 'attachments' container", async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = "conn";
    const { getAttachmentContainer } = await import("@/lib/blobStorage");
    await getAttachmentContainer();
    expect(mocks.getContainerClient).toHaveBeenCalledWith("attachments");
  });

  it("ensures the container exists before returning it", async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = "conn";
    const { getAttachmentContainer } = await import("@/lib/blobStorage");
    await getAttachmentContainer();
    expect(mocks.createIfNotExists).toHaveBeenCalledOnce();
  });

  it("returns the container instance", async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = "conn";
    const { getAttachmentContainer } = await import("@/lib/blobStorage");
    const result = await getAttachmentContainer();
    expect(result).toBe(fakeContainer);
  });

  it("caches the container across calls, building the client only once", async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = "conn";
    const { getAttachmentContainer } = await import("@/lib/blobStorage");
    await getAttachmentContainer();
    await getAttachmentContainer();
    await getAttachmentContainer();
    expect(mocks.fromConnectionString).toHaveBeenCalledOnce();
    expect(mocks.createIfNotExists).toHaveBeenCalledOnce();
  });

  it("does not cache the container when createIfNotExists rejects", async () => {
    process.env.AZURE_STORAGE_CONNECTION_STRING = "conn";
    mocks.createIfNotExists.mockRejectedValueOnce(new Error("storage unavailable"));
    const { getAttachmentContainer } = await import("@/lib/blobStorage");

    await expect(getAttachmentContainer()).rejects.toThrow("storage unavailable");

    // A subsequent call should retry rather than serve a half-initialised cached instance.
    mocks.createIfNotExists.mockResolvedValueOnce(undefined);
    const result = await getAttachmentContainer();
    expect(result).toBe(fakeContainer);
    expect(mocks.fromConnectionString).toHaveBeenCalledTimes(2);
  });
});
