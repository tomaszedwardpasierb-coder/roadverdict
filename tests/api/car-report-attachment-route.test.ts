// Mirrors report-attachment-route.test.ts for the car equivalent route.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolveCarShareToken: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarMods: vi.fn(),
  getCarBills: vi.fn(),
  getAttachmentContainer: vi.fn(),
  download: vi.fn(),
  getCarReceiptRequestsForShareToken: vi.fn(),
}));

vi.mock("@/lib/tracker/carShareLink", () => ({ resolveCarShareToken: mocks.resolveCarShareToken }));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.getCarServiceRecords }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.getCarMods }));
vi.mock("@/lib/tracker/carBill", () => ({ getCarBills: mocks.getCarBills }));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: mocks.getAttachmentContainer }));
vi.mock("@/lib/tracker/carReceiptRequest", () => ({ getCarReceiptRequestsForShareToken: mocks.getCarReceiptRequestsForShareToken }));

function approvedRequestFor(entryId: string) {
  return {
    createdAt: "2025-06-01T00:00:00.000Z",
    items: [{ entryId, status: "approved" }],
  };
}

import { GET } from "@/app/api/cars/car-report-attachment/[token]/[blobName]/route";

function fakeStream(chunks: Buffer[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const c of chunks) yield c;
    },
  };
}

function request(): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-report-attachment/t/b", { method: "GET" });
}

describe("GET /api/cars/car-report-attachment/[token]/[blobName]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.resolveCarShareToken.mockResolvedValue({ email: "owner@example.com", carId: "car-1" });
    mocks.getCarServiceRecords.mockResolvedValue([]);
    mocks.getCarMods.mockResolvedValue([]);
    mocks.getCarBills.mockResolvedValue([]);
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([]);
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient: () => ({ download: mocks.download }) });
    mocks.download.mockResolvedValue({ contentType: "image/jpeg", readableStreamBody: fakeStream([Buffer.from("data")]) });
  });

  it("returns 404 for an invalid or expired share token, without even looking up records", async () => {
    mocks.resolveCarShareToken.mockResolvedValue(null);
    const response = await GET(request(), { params: Promise.resolve({ token: "bad-token", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Invalid or expired link." });
    expect(mocks.getCarServiceRecords).not.toHaveBeenCalled();
  });

  it("returns 404 when the blob doesn't belong to any record on this car's report", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "other.jpg" }] }]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  it("serves the blob when it belongs to an approved service record on this car", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("sr-1")]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
  });

  it("serves the blob when it belongs to an approved mod", async () => {
    mocks.getCarMods.mockResolvedValue([{ id: "m-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("m-1")]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(200);
  });

  it("serves the blob when it belongs to an approved bill", async () => {
    mocks.getCarBills.mockResolvedValue([{ id: "bl-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("bl-1")]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(200);
  });

  it("still returns 404 (not a 500) when the blob is authorised but the download itself fails", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("sr-1")]);
    mocks.download.mockRejectedValue(new Error("BlobNotFound"));
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
  });

  it("decodes a URL-encoded blob name before matching or requesting it", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "has space.jpg" }] }]);
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("sr-1")]);
    const getBlockBlobClient = vi.fn(() => ({ download: mocks.download }));
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient });

    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: encodeURIComponent("has space.jpg") }) });

    expect(response.status).toBe(200);
    expect(getBlockBlobClient).toHaveBeenCalledWith("has space.jpg");
  });

  it("returns 404 for a real attachment that has never been requested at all", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  it("returns 404 for a real attachment whose request is still pending", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([
      { createdAt: "2025-06-01T00:00:00.000Z", items: [{ entryId: "sr-1", status: "pending" }] },
    ]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
  });

  it("uses the most recent request's decision when an entry was declined then re-approved", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([
      { createdAt: "2025-01-01T00:00:00.000Z", items: [{ entryId: "sr-1", status: "declined" }] },
      { createdAt: "2025-06-01T00:00:00.000Z", items: [{ entryId: "sr-1", status: "approved" }] },
    ]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(200);
  });

  it("does not let an approval on a different entry unlock this one's attachment", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1", attachments: [{ blobName: "abc.jpg" }] }]);
    mocks.getCarReceiptRequestsForShareToken.mockResolvedValue([approvedRequestFor("sr-OTHER")]);
    const response = await GET(request(), { params: Promise.resolve({ token: "t", blobName: "abc.jpg" }) });
    expect(response.status).toBe(404);
  });
});
