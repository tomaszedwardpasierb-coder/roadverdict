import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAttachmentContainer: vi.fn(),
  download: vi.fn(),
  ownsAttachment: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: mocks.getAttachmentContainer }));
vi.mock("@/lib/tracker/attachmentOwnership", () => ({ ownsAttachment: mocks.ownsAttachment }));

import { GET } from "@/app/api/tracker/attachment/[blobName]/route";

function fakeStream(chunks: Buffer[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c;
    },
  };
}

function request(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/attachment/x", { method: "GET" });
}

describe("GET /api/tracker/attachment/[blobName]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAttachmentContainer.mockResolvedValue({
      getBlockBlobClient: () => ({ download: mocks.download }),
    });
    mocks.ownsAttachment.mockResolvedValue(true);
  });

  it("rejects unauthenticated requests without ever touching blob storage", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request(), { params: { blobName: "abc.jpg" } });
    expect(response.status).toBe(401);
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  // The actual security fix: any signed-in account used to be enough to
  // fetch ANY blob by name, regardless of whose it was. A blobName that
  // isn't among the caller's own records must now be refused before
  // blob storage is ever touched.
  it("returns 404 without touching blob storage when the caller doesn't own the attachment", async () => {
    mocks.getSession.mockResolvedValue({ email: "attacker@example.com" });
    mocks.ownsAttachment.mockResolvedValue(false);
    const response = await GET(request(), { params: { blobName: "victims-receipt.jpg" } });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Attachment not found." });
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  it("checks ownership against the signed-in session's own email, not any client-supplied value", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.download.mockResolvedValue({ contentType: "image/jpeg", readableStreamBody: fakeStream([]) });
    await GET(request(), { params: { blobName: "abc.jpg" } });
    expect(mocks.ownsAttachment).toHaveBeenCalledWith("owner@example.com", "abc.jpg");
  });

  it("streams the blob back with its content type, inline disposition, and a private cache header", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.download.mockResolvedValue({
      contentType: "image/jpeg",
      readableStreamBody: fakeStream([Buffer.from("hello "), Buffer.from("world")]),
    });

    const response = await GET(request(), { params: { blobName: "abc.jpg" } });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.toString()).toBe("hello world");
  });

  it("falls back to a generic content type when the blob has none", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.download.mockResolvedValue({ contentType: undefined, readableStreamBody: fakeStream([]) });

    const response = await GET(request(), { params: { blobName: "abc.jpg" } });

    expect(response.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("decodes a URL-encoded blob name before requesting it", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.download.mockResolvedValue({ contentType: "image/png", readableStreamBody: fakeStream([]) });
    const getBlockBlobClient = vi.fn(() => ({ download: mocks.download }));
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient });

    await GET(request(), { params: { blobName: encodeURIComponent("has space.jpg") } });

    expect(getBlockBlobClient).toHaveBeenCalledWith("has space.jpg");
  });

  it("reports 404 rather than a 500 when the blob doesn't exist or the download throws", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.download.mockRejectedValue(new Error("BlobNotFound"));

    const response = await GET(request(), { params: { blobName: "missing.jpg" } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Attachment not found." });
  });
});