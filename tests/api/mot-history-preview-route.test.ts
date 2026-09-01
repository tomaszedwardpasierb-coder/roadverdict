import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  parseMotHistory: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
// parseMotHistory is pure logic already covered by its own unit tests —
// mock it here so route tests stay focused on routing/wiring behaviour.
vi.mock("@/lib/tracker/motHistory", () => ({ parseMotHistory: mocks.parseMotHistory }));
vi.stubGlobal("fetch", mocks.fetch);

import { GET } from "@/app/api/tracker/mot-history-preview/route";

function request(vrm?: string): NextRequest {
  const url = vrm
    ? `http://localhost/api/tracker/mot-history-preview?vrm=${encodeURIComponent(vrm)}`
    : "http://localhost/api/tracker/mot-history-preview";
  return new NextRequest(url, { method: "GET" });
}

function vdgSuccess(tests: object[] = []) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { IsSuccessStatusCode: true },
        Results: {
          MotHistoryDetails: {
            MotDueDate: "2026-05-01",
            MotTestDetailsList: tests,
          },
        },
      }),
  };
}

function vdgNoHistory() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { IsSuccessStatusCode: false },
        Results: {},
      }),
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  process.env.VDG_API_KEY = "test-key";
  mocks.parseMotHistory.mockReturnValue({ motDueDate: "2026-05-01", tests: [] });
});

describe("GET /api/tracker/mot-history-preview", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("AB12CDE"));
    expect(response.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when no vrm query param is provided", async () => {
    const response = await GET(request());
    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 503 when VDG_API_KEY is not configured", async () => {
    delete process.env.VDG_API_KEY;
    const response = await GET(request("AB12CDE"));
    expect(response.status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 502 when the fetch to VDG throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network error"));
    const response = await GET(request("AB12CDE"));
    expect(response.status).toBe(502);
  });

  // A 200 from VDG with IsSuccessStatusCode false means the plate exists
  // but has no MOT history yet (new bike, under 3 years old).
  it("returns null latestTrustedMileage and latestTestDate when VDG finds no MOT history", async () => {
    mocks.fetch.mockResolvedValue(vdgNoHistory());
    const response = await GET(request("AB12CDE"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      latestTrustedMileage: null,
      latestTestDate: null,
    });
  });

  it("returns null when parseMotHistory returns tests with no mileage", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess([{}]));
    mocks.parseMotHistory.mockReturnValue({
      motDueDate: "2026-05-01",
      tests: [{ testDate: "2025-01-01", mileage: null, mileageTrusted: false, passed: true, notes: "" }],
    });
    const response = await GET(request("AB12CDE"));
    await expect(response.json()).resolves.toEqual({
      latestTrustedMileage: null,
      latestTestDate: null,
    });
  });

  it("returns the mileage and date from the most recent test that has a mileage", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess([{}]));
    // parseMotHistory returns oldest-to-newest; latest trusted is the last one
    mocks.parseMotHistory.mockReturnValue({
      motDueDate: "2026-05-01",
      tests: [
        { testDate: "2023-01-01", mileage: 10000, mileageTrusted: true, passed: true, notes: "" },
        { testDate: "2024-01-01", mileage: 14000, mileageTrusted: true, passed: true, notes: "" },
      ],
    });
    const response = await GET(request("AB12CDE"));
    await expect(response.json()).resolves.toEqual({
      latestTrustedMileage: 14000,
      latestTestDate: "2024-01-01",
    });
  });

  // The route filters trustedTests by mileage != null — even if mileageTrusted
  // is false, a non-null mileage still qualifies as "trusted" for the
  // purpose of picking the latest anchor. The mileageTrusted flag is for
  // display in the UI, not for this filter.
  it("picks the last test with a non-null mileage, regardless of mileageTrusted flag", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess([{}]));
    mocks.parseMotHistory.mockReturnValue({
      motDueDate: "2026-05-01",
      tests: [
        { testDate: "2023-01-01", mileage: 10000, mileageTrusted: false, passed: true, notes: "" },
        { testDate: "2024-01-01", mileage: null, mileageTrusted: false, passed: false, notes: "" },
      ],
    });
    const response = await GET(request("AB12CDE"));
    await expect(response.json()).resolves.toEqual({
      latestTrustedMileage: 10000,
      latestTestDate: "2023-01-01",
    });
  });

  it("normalises the VRM to uppercase with spaces stripped before sending to VDG", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    mocks.parseMotHistory.mockReturnValue({ motDueDate: null, tests: [] });
    await GET(request("ab12 cde"));
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.stringContaining("AB12CDE")
    );
  });
});
