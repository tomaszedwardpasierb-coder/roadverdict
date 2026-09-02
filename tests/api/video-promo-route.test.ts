// Place at: tests/api/video-promo-route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fromConnectionString: vi.fn(),
  getContainerClient: vi.fn(),
  getBlobClient: vi.fn(),
  getProperties: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: { fromConnectionString: mocks.fromConnectionString },
}));

import { GET } from "@/app/api/video/promo/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/video/promo", { headers });
}

function fakeStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
}

describe("GET /api/video/promo", () => {
  const originalConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    process.env.AZURE_STORAGE_CONNECTION_STRING = "conn";
    mocks.fromConnectionString.mockReturnValue({ getContainerClient: mocks.getContainerClient });
    mocks.getContainerClient.mockReturnValue({ getBlobClient: mocks.getBlobClient });
    mocks.getBlobClient.mockReturnValue({ getProperties: mocks.getProperties, download: mocks.download });
    mocks.getProperties.mockResolvedValue({ contentLength: 1000, contentType: "video/mp4" });
    mocks.download.mockResolvedValue({ readableStreamBody: fakeStream() });
  });

  afterEach(() => {
    if (originalConnectionString === undefined) delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    else process.env.AZURE_STORAGE_CONNECTION_STRING = originalConnectionString;
  });

  it("returns 503 without touching blob storage when the connection string isn't configured", async () => {
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("Storage not configured");
    expect(mocks.fromConnectionString).not.toHaveBeenCalled();
  });

  it("streams the full file with 200 when no range header is present", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(response.headers.get("Content-Length")).toBe("1000");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(mocks.download).toHaveBeenCalledWith();
  });

  it("falls back to video/mp4 when the blob's own contentType is empty", async () => {
    mocks.getProperties.mockResolvedValue({ contentLength: 1000, contentType: "" });
    const response = await GET(request());
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
  });

  it("serves a bounded byte range with 206 and the correct Content-Range", async () => {
    const response = await GET(request({ range: "bytes=100-199" }));
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 100-199/1000");
    expect(response.headers.get("Content-Length")).toBe("100");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(mocks.download).toHaveBeenCalledWith(100, 100);
  });

  it("serves an open-ended byte range up to the real content length", async () => {
    const response = await GET(request({ range: "bytes=900-" }));
    expect(response.status).toBe(206);
    // end defaults to contentLength - 1 = 999, chunkSize = 999 - 900 + 1 = 100
    expect(response.headers.get("Content-Range")).toBe("bytes 900-999/1000");
    expect(mocks.download).toHaveBeenCalledWith(900, 100);
  });

  it("returns 500 if the full-file download has no readable stream body", async () => {
    mocks.download.mockResolvedValue({ readableStreamBody: null });
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Stream unavailable");
  });

  it("returns 500 if a ranged download has no readable stream body", async () => {
    mocks.download.mockResolvedValue({ readableStreamBody: null });
    const response = await GET(request({ range: "bytes=0-99" }));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Stream unavailable");
  });

  it("returns 404 when the blob lookup itself throws (e.g. the blob doesn't exist)", async () => {
    mocks.getProperties.mockRejectedValue(new Error("BlobNotFound"));
    const response = await GET(request());
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Video not found");
  });
});
