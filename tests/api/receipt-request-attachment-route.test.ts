import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getReceiptRequestByDecisionToken: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/lib/tracker/receiptRequest", () => ({
  getReceiptRequestByDecisionToken: mocks.getReceiptRequestByDecisionToken,
}));

const mockContainer = {
  getBlockBlobClient: vi.fn(() => ({ download: mocks.download })),
};
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: async () => mockContainer }));

import { GET } from "@/app/api/report/receipt-request/attachment/[decisionToken]/[blobName]/route";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/report/receipt-request/attachment/tok/blob");
}

const requestDocWithAttachment = {
  id: "req-1",
  items: [
    { entryId: "e1", attachment: { blobName: "receipts/e1-invoice.jpg" } },
    { entryId: "e2" }, // no attachment on this item at all
  ],
};

describe("GET /api/report/receipt-request/attachment/[decisionToken]/[blobName]", () => {
  beforeEach(() => {
    mocks.getReceiptRequestByDecisionToken.mockReset();
    mocks.download.mockReset();
    mockContainer.getBlockBlobClient.mockClear();
  });

  it("returns not found for a token that doesn't resolve to a real request", async () => {
    mocks.getReceiptRequestByDecisionToken.mockResolvedValue(null);

    const response = await GET(req(), { params: { decisionToken: "bad-token", blobName: "anything.jpg" } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "This request is no longer available." });
  });

  // The actual isolation guarantee described in the source comment: a
  // valid, real decision token must NOT unlock an arbitrary blob name
  // that isn't genuinely one of this specific request's own items -
  // otherwise a valid token for request A could be used to probe or
  // fetch attachments belonging to request B, or anything else in the
  // same storage container.
  it("refuses a blob name that isn't actually one of this request's own items", async () => {
    mocks.getReceiptRequestByDecisionToken.mockResolvedValue(requestDocWithAttachment);

    const response = await GET(req(), {
      params: { decisionToken: "tok-1", blobName: "receipts/someone-elses-request.jpg" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Attachment not found." });
    expect(mockContainer.getBlockBlobClient).not.toHaveBeenCalled();
  });

  it("refuses a matching item that has no attachment recorded", async () => {
    mocks.getReceiptRequestByDecisionToken.mockResolvedValue(requestDocWithAttachment);

    // e2 exists on the request but was never given a blobName, so there's
    // no legitimate value to even attempt matching against here - this
    // just confirms the missing-attachment branch, not a real lookup.
    const response = await GET(req(), { params: { decisionToken: "tok-1", blobName: "e2" } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Attachment not found." });
  });

  it("decodes a URL-encoded blob name before matching against the request's items", async () => {
    mocks.getReceiptRequestByDecisionToken.mockResolvedValue(requestDocWithAttachment);
    mocks.download.mockResolvedValue({
      readableStreamBody: Readable.from([Buffer.from("fake jpeg bytes")]),
      contentType: "image/jpeg",
    });

    const response = await GET(req(), {
      params: { decisionToken: "tok-1", blobName: encodeURIComponent("receipts/e1-invoice.jpg") },
    });

    expect(response.status).toBe(200);
    expect(mockContainer.getBlockBlobClient).toHaveBeenCalledWith("receipts/e1-invoice.jpg");
  });

  it("streams the attachment with the right headers on a genuine match", async () => {
    mocks.getReceiptRequestByDecisionToken.mockResolvedValue(requestDocWithAttachment);
    mocks.download.mockResolvedValue({
      readableStreamBody: Readable.from([Buffer.from("fake jpeg bytes")]),
      contentType: "image/jpeg",
    });

    const response = await GET(req(), { params: { decisionToken: "tok-1", blobName: "receipts/e1-invoice.jpg" } });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Content-Disposition")).toBe("inline");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=3600");
    const bodyText = Buffer.from(await response.arrayBuffer()).toString();
    expect(bodyText).toBe("fake jpeg bytes");
  });

  it("falls back to a generic content type when the blob doesn't report one", async () => {
    mocks.getReceiptRequestByDecisionToken.mockResolvedValue(requestDocWithAttachment);
    mocks.download.mockResolvedValue({
      readableStreamBody: Readable.from([Buffer.from("data")]),
      contentType: undefined,
    });

    const response = await GET(req(), { params: { decisionToken: "tok-1", blobName: "receipts/e1-invoice.jpg" } });

    expect(response.headers.get("Content-Type")).toBe("application/octet-stream");
  });

  // The item matches and passes every check, but the actual blob storage
  // call itself fails (deleted, storage outage, etc.) - degrades to the
  // same not-found response rather than leaking a 500 or an error detail.
  it("returns a graceful not-found if the blob download itself fails", async () => {
    mocks.getReceiptRequestByDecisionToken.mockResolvedValue(requestDocWithAttachment);
    mocks.download.mockRejectedValue(new Error("blob storage unavailable"));

    const response = await GET(req(), { params: { decisionToken: "tok-1", blobName: "receipts/e1-invoice.jpg" } });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Attachment not found." });
  });
});