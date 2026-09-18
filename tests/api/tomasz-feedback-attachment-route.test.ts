// Place at: tests/api/tomasz-feedback-attachment-route.test.ts
//
// Mirrors tests/api/attachment-blobname-route.test.ts's own conventions.
// The one behaviour genuinely specific to THIS route is its auth gate -
// getAdminSession(), not a user session/ownsAttachment check - since a
// FeedbackDoc's attachments don't belong to any tracker doc type or the
// submitter's own email partition the tracker route's ownership check
// understands. Everything else (streaming, headers, blob-name decoding,
// 404 on failure) is exercised once each, not duplicated in full.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  getAttachmentContainer: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: mocks.getAttachmentContainer }));

import { GET } from "@/app/api/tomasz/feedback-attachment/[blobName]/route";

function fakeStream(chunks: Buffer[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c;
    },
  };
}

function request(): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/feedback-attachment/x", { method: "GET" });
}

describe("GET /api/tomasz/feedback-attachment/[blobName]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient: () => ({ download: mocks.download }) });
  });

  it("rejects a request with no admin session, without ever touching blob storage", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await GET(request(), { params: Promise.resolve({ blobName: "abc.png" }) });
    expect(response.status).toBe(401);
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  it("streams the blob back with its content type, inline disposition, and a private cache header for an admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.download.mockResolvedValue({ contentType: "image/png", readableStreamBody: fakeStream([Buffer.from("hello "), Buffer.from("world")]) });

    const response = await GET(request(), { params: Promise.resolve({ blobName: "abc.png" }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    const body = Buffer.from(await response.arrayBuffer());
    expect(body.toString()).toBe("hello world");
  });

  it("decodes a URL-encoded blob name before requesting it", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.download.mockResolvedValue({ contentType: "image/png", readableStreamBody: fakeStream([]) });
    const getBlockBlobClient = vi.fn(() => ({ download: mocks.download }));
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient });

    await GET(request(), { params: Promise.resolve({ blobName: encodeURIComponent("has space.png") }) });

    expect(getBlockBlobClient).toHaveBeenCalledWith("has space.png");
  });

  it("reports 404 rather than a 500 when the blob doesn't exist or the download throws", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.download.mockRejectedValue(new Error("BlobNotFound"));

    const response = await GET(request(), { params: Promise.resolve({ blobName: "missing.png" }) });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Attachment not found." });
  });
});
