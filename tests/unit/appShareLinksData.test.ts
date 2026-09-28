import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBike: vi.fn(),
  getCarById: vi.fn(),
  getShareLinksForUser: vi.fn(),
  getCarShareLinksForUser: vi.fn(),
  getPendingReceiptRequestsForOwner: vi.fn(),
  getPendingCarReceiptRequestsForOwner: vi.fn(),
}));

vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike }));
vi.mock("@/lib/tracker/car", () => ({ getCarById: mocks.getCarById }));
vi.mock("@/lib/tracker/shareLink", () => ({ getShareLinksForUser: mocks.getShareLinksForUser }));
vi.mock("@/lib/tracker/carShareLink", () => ({ getCarShareLinksForUser: mocks.getCarShareLinksForUser }));
vi.mock("@/lib/tracker/receiptRequest", () => ({ getPendingReceiptRequestsForOwner: mocks.getPendingReceiptRequestsForOwner }));
vi.mock("@/lib/tracker/carReceiptRequest", () => ({ getPendingCarReceiptRequestsForOwner: mocks.getPendingCarReceiptRequestsForOwner }));

import { getShareLinks } from "@/lib/app/shareLinksData";

const email = "rider@example.com";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-28T12:00:00.000Z"));
  vi.stubEnv("APP_URL", "https://roadverdict.co.uk");
  mocks.getBike.mockResolvedValue({ id: "bike-1" });
  mocks.getCarById.mockResolvedValue({ id: "car-1" });
  mocks.getShareLinksForUser.mockResolvedValue([]);
  mocks.getCarShareLinksForUser.mockResolvedValue([]);
  mocks.getPendingReceiptRequestsForOwner.mockResolvedValue([]);
  mocks.getPendingCarReceiptRequestsForOwner.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("getShareLinks", () => {
  it("returns null for a vehicle that isn't on this account, without reading any links", async () => {
    mocks.getBike.mockResolvedValue(null);
    expect(await getShareLinks(email, "bike", "not-mine")).toBeNull();
    mocks.getCarById.mockResolvedValue(null);
    expect(await getShareLinks(email, "car", "not-mine")).toBeNull();
    expect(mocks.getShareLinksForUser).not.toHaveBeenCalled();
    expect(mocks.getCarShareLinksForUser).not.toHaveBeenCalled();
    expect(mocks.getBike).toHaveBeenCalledWith(email, "not-mine");
    expect(mocks.getCarById).toHaveBeenCalledWith(email, "not-mine");
  });

  it("lists only this bike's links, with their report address and expiry", async () => {
    mocks.getShareLinksForUser.mockResolvedValue([
      { id: "tok-live", bikeId: "bike-1", recipientEmail: "buyer@example.com", askingPrice: 3200, createdAt: "2026-09-20T10:00:00.000Z", expiresAt: "2026-10-20T10:00:00.000Z" },
      { id: "tok-other-bike", bikeId: "bike-2", recipientEmail: "x@example.com", createdAt: "2026-09-19T10:00:00.000Z", expiresAt: "2026-10-19T10:00:00.000Z" },
      { id: "tok-expired", bikeId: "bike-1", recipientEmail: "old@example.com", createdAt: "2026-08-01T10:00:00.000Z", expiresAt: "2026-08-08T10:00:00.000Z" },
      { id: "tok-legacy", bikeId: "bike-1", createdAt: "2025-01-01T10:00:00.000Z" },
    ]);
    const data = await getShareLinks(email, "bike", "bike-1");
    expect(data?.links).toEqual([
      {
        token: "tok-live",
        url: "https://roadverdict.co.uk/report/tok-live",
        recipientEmail: "buyer@example.com",
        askingPrice: 3200,
        createdAt: "2026-09-20T10:00:00.000Z",
        expiresAt: "2026-10-20T10:00:00.000Z",
        expired: false,
      },
      {
        token: "tok-expired",
        url: "https://roadverdict.co.uk/report/tok-expired",
        recipientEmail: "old@example.com",
        askingPrice: null,
        createdAt: "2026-08-01T10:00:00.000Z",
        expiresAt: "2026-08-08T10:00:00.000Z",
        expired: true,
      },
      {
        token: "tok-legacy",
        url: "https://roadverdict.co.uk/report/tok-legacy",
        recipientEmail: null,
        askingPrice: null,
        createdAt: "2025-01-01T10:00:00.000Z",
        expiresAt: null,
        expired: false,
      },
    ]);
  });

  it("uses the car report address for a car's links", async () => {
    mocks.getCarShareLinksForUser.mockResolvedValue([
      { id: "car-tok", carId: "car-1", recipientEmail: "buyer@example.com", createdAt: "2026-09-20T10:00:00.000Z", expiresAt: "2026-10-20T10:00:00.000Z" },
      { id: "car-tok-2", carId: "car-2", recipientEmail: "buyer@example.com", createdAt: "2026-09-20T10:00:00.000Z", expiresAt: "2026-10-20T10:00:00.000Z" },
    ]);
    const data = await getShareLinks(email, "car", "car-1");
    expect(data?.links.map((l) => l.url)).toEqual(["https://roadverdict.co.uk/car-report/car-tok"]);
    expect(mocks.getShareLinksForUser).not.toHaveBeenCalled();
  });

  it("lists this vehicle's waiting receipt requests newest first, without the decision token hash", async () => {
    mocks.getPendingReceiptRequestsForOwner.mockResolvedValue([
      {
        id: "req-old",
        bikeId: "bike-1",
        shareToken: "tok-live",
        decisionTokenHash: "secret-hash",
        buyerEmail: "buyer@example.com",
        createdAt: "2026-09-21T10:00:00.000Z",
        items: [{ entryId: "s1", category: "service", description: "Major service", status: "pending" }],
      },
      {
        id: "req-new",
        bikeId: "bike-1",
        shareToken: "tok-live",
        decisionTokenHash: "secret-hash",
        buyerMessage: "Can I see the chain receipt?",
        createdAt: "2026-09-25T10:00:00.000Z",
        items: [
          {
            entryId: "m1",
            category: "mods",
            description: "Chain and sprockets",
            status: "pending",
            attachment: { blobName: "u/abc 1.jpg", fileName: "chain.jpg", fileType: "image/jpeg", uploadedAt: "2026-05-01T10:00:00.000Z" },
            priorDecline: { decidedAt: "2026-09-10T10:00:00.000Z" },
          },
          { entryId: "s2", category: "service", description: "Tyres", status: "declined", reason: "Paid cash", decidedAt: "2026-09-26T10:00:00.000Z" },
        ],
      },
      { id: "req-other-bike", bikeId: "bike-2", shareToken: "t", decisionTokenHash: "h", createdAt: "2026-09-26T10:00:00.000Z", items: [] },
    ]);
    const data = await getShareLinks(email, "bike", "bike-1");
    expect(data?.requests).toEqual([
      {
        id: "req-new",
        buyerEmail: null,
        buyerMessage: "Can I see the chain receipt?",
        createdAt: "2026-09-25T10:00:00.000Z",
        items: [
          {
            entryId: "m1",
            description: "Chain and sprockets",
            status: "pending",
            reason: null,
            priorDecline: { decidedAt: "2026-09-10T10:00:00.000Z", reason: null },
            attachment: { fileName: "chain.jpg", fileType: "image/jpeg", path: "/api/tracker/attachment/u%2Fabc%201.jpg" },
          },
          { entryId: "s2", description: "Tyres", status: "declined", reason: "Paid cash", priorDecline: null, attachment: null },
        ],
      },
      {
        id: "req-old",
        buyerEmail: "buyer@example.com",
        buyerMessage: null,
        createdAt: "2026-09-21T10:00:00.000Z",
        items: [{ entryId: "s1", description: "Major service", status: "pending", reason: null, priorDecline: null, attachment: null }],
      },
    ]);
    expect(JSON.stringify(data)).not.toContain("secret-hash");
  });

  it("reads a car's receipt requests from the car store", async () => {
    mocks.getPendingCarReceiptRequestsForOwner.mockResolvedValue([
      { id: "creq", carId: "car-1", shareToken: "t", decisionTokenHash: "h", createdAt: "2026-09-25T10:00:00.000Z", items: [] },
      { id: "creq-2", carId: "car-9", shareToken: "t", decisionTokenHash: "h", createdAt: "2026-09-25T10:00:00.000Z", items: [] },
    ]);
    const data = await getShareLinks(email, "car", "car-1");
    expect(data?.requests.map((r) => r.id)).toEqual(["creq"]);
    expect(mocks.getPendingReceiptRequestsForOwner).not.toHaveBeenCalled();
  });
});
