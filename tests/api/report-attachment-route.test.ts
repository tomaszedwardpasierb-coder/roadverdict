import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveShareToken: vi.fn(),
  getServiceRecords: vi.fn(),
  getMods: vi.fn(),
  getBills: vi.fn(),
  getAttachmentContainer: vi.fn(),
  download: vi.fn(),
  getReceiptRequestsForShareToken: vi.fn(),
}));

vi.mock("@/lib/tracker/shareLink", () => ({ resolveShareToken: mocks.resolveShareToken }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.getBills }));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: mocks.getAttachmentContainer }));
vi.mock("@/lib/tracker/receiptRequest", () => ({ getReceiptRequestsForShareToken: mocks.getReceiptRequestsForShareToken }));

// One approved request covering entryId, dated so it's the "most recent"
// against any earlier decision a test adds on top.
function approvedRequestFor(entryId: string) {
  return {
    createdAt: "2025-06-01T00:00:00.000Z",
    items: [{ entryId, status: "approved" }],
  };
}

import { GET } from "@/app/api/tracker/report-attachment/[token]/[blobName]/route";

function fakeStream(chunks: Buffer[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c;
    },
  };
}

function request(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/report-attachment/t/b", { method: "GET" });
}

describe("GET /api/tracker/report-attachment/[token]/[blobName]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.resolveShareToken.mockResolvedValue({ email: "owner@example.com", bikeId: "bike-1" });
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.getBills.mockResolvedValue([]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([]);
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient: () => ({ download: mocks.download }) });
    mocks.download.mockResolvedValue({ contentType: "image/jpeg", readableStreamBody: fakeStream([Buffer.from("data")]) });
  });

  it("returns 404 for an invalid or expired share token, without even looking up records", async () => {
    mocks.resolveShareToken.mockResolvedValue(null);
    const response = await GET(request(), { params: Promise.resolve({ token: "bad-token", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Invalid or expired link." });
    expect(mocks.getServiceRecords).not.toHaveBeenCalled();
  });

  it("returns 404 when the blob doesn't belong to any record on this bike's report", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "other.jpg" }] }]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  it("serves the blob when it belongs to an approved service record on this bike", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("sr-1")]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("serves the blob when it belongs to an approved mod", async () => {
    mocks.getMods.mockResolvedValue([{ id: "m-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("m-1")]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(200);
  });

  it("serves the blob when it belongs to an approved bill", async () => {
    mocks.getBills.mockResolvedValue([{ id: "bl-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("bl-1")]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(200);
  });

  it("copes with records that have no attachments array at all", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: undefined }]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
  });

  it("still returns 404 (not a 500) when the blob is authorised but the download itself fails", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("sr-1")]);
    mocks.download.mockRejectedValue(new Error("BlobNotFound"));
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
  });

  it("decodes a URL-encoded blob name before matching or requesting it", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "has space.jpg" }] }]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("sr-1")]);
    const getBlockBlobClient = vi.fn(() => ({ download: mocks.download }));
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient });

    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: encodeURIComponent("has space.jpg") }) });

    expect(response.status).toBe(200);
    expect(getBlockBlobClient).toHaveBeenCalledWith("has space.jpg");
  });

  // The actual security fix: the blob genuinely belongs to this bike's
  // report, but nobody has approved sharing it yet - the whole point of
  // the receipt-request workflow (ReportHistoryTable.tsx never renders a
  // link in this case) is defeated if the file route serves it anyway.
  it("returns 404 for a real attachment that has never been requested at all", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  it("returns 404 for a real attachment whose request is still pending", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([
      { createdAt: "2025-06-01T00:00:00.000Z", items: [{ entryId: "sr-1", status: "pending" }] },
    ]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
  });

  it("returns 404 for a real attachment whose request was declined", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([
      { createdAt: "2025-06-01T00:00:00.000Z", items: [{ entryId: "sr-1", status: "declined" }] },
    ]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
  });

  it("uses the most recent request's decision when an entry was declined then re-approved", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([
      { createdAt: "2025-01-01T00:00:00.000Z", items: [{ entryId: "sr-1", status: "declined" }] },
      { createdAt: "2025-06-01T00:00:00.000Z", items: [{ entryId: "sr-1", status: "approved" }] },
    ]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(200);
  });

  it("does not let an approval on a different entry unlock this one's attachment", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("sr-OTHER")]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
  });
});