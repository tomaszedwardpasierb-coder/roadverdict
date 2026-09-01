import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.stubGlobal("fetch", mocks.fetch);

// parseMotHistory itself is pure and already has its own dedicated test
// file (motHistory.test.ts) - deliberately NOT mocked here, so these
// tests confirm the real end-to-end wiring (VDG's raw shape actually
// reaches it and comes back out), not a second copy of its own logic.
import { fetchMotHistoryFromVdg } from "@/lib/tracker/motHistoryFetch";

function vdgSuccess(overrides: { motDueDate?: string | null; tests?: any[] } = {}) {
  return {
    ok: true,
    json: () => Promise.resolve({
      ResponseInformation: { IsSuccessStatusCode: true },
      Results: {
        MotHistoryDetails: {
          MotDueDate: "motDueDate" in overrides ? overrides.motDueDate ?? null : "2026-01-15",
          MotTestDetailsList: overrides.tests ?? [
            {
              TestDate: "2025-01-15T00:00:00.000Z",
              TestPassed: true,
              ExpiryDate: "2026-01-15",
              OdometerReading: "12000",
              OdometerUnit: "MI",
              OdometerResultType: "READ",
              DaysOutOfMot: 0,
              IsRetest: false,
              AnnotationList: [],
            },
          ],
        },
      },
    }),
  };
}

beforeEach(() => {
  mocks.fetch.mockReset();
  process.env.VDG_API_KEY = "test-key";
});

describe("fetchMotHistoryFromVdg", () => {
  it("returns null and never calls fetch when VDG_API_KEY is not set", async () => {
    delete process.env.VDG_API_KEY;
    const result = await fetchMotHistoryFromVdg("AB12CDE");
    expect(result).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("fails soft to null when the fetch itself throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network error"));
    const result = await fetchMotHistoryFromVdg("AB12CDE");
    expect(result).toBeNull();
  });

  it("fails soft to null when res.json() throws (malformed response body)", async () => {
    mocks.fetch.mockResolvedValue({ ok: true, json: () => Promise.reject(new Error("bad json")) });
    const result = await fetchMotHistoryFromVdg("AB12CDE");
    expect(result).toBeNull();
  });

  it("returns null (not an error) when VDG reports no success status - e.g. a bike too new to have any MOT history", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ResponseInformation: { IsSuccessStatusCode: false }, Results: {} }),
    });
    const result = await fetchMotHistoryFromVdg("AB12CDE");
    expect(result).toBeNull();
  });

  it("returns null when the success flag is true but MotHistoryDetails itself is missing", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ResponseInformation: { IsSuccessStatusCode: true }, Results: {} }),
    });
    const result = await fetchMotHistoryFromVdg("AB12CDE");
    expect(result).toBeNull();
  });

  it("returns the real parsed history on success, with each test's DVSA reading correctly turned into a trusted mileage anchor", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    const result = await fetchMotHistoryFromVdg("AB12CDE");
    expect(result).toEqual({
      motDueDate: "2026-01-15",
      tests: [{ testDate: "2025-01-15T00:00:00.000Z", passed: true, mileage: 12000, mileageTrusted: true, notes: "Passed" }],
    });
  });

  it("passes null through as motDueDate when VDG has none (e.g. exempt vehicle)", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({ motDueDate: null }));
    const result = await fetchMotHistoryFromVdg("AB12CDE");
    expect(result?.motDueDate).toBeNull();
  });

  it("defaults to an empty test list when MotTestDetailsList is absent", async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ResponseInformation: { IsSuccessStatusCode: true },
        Results: { MotHistoryDetails: { MotDueDate: "2026-01-15" } },
      }),
    });
    const result = await fetchMotHistoryFromVdg("AB12CDE");
    expect(result).toEqual({ motDueDate: "2026-01-15", tests: [] });
  });

  it("real-wires an UN-READABLE odometer result to a null, untrusted mileage rather than a fabricated number", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess({
      tests: [{
        TestDate: "2025-01-15T00:00:00.000Z", TestPassed: true, ExpiryDate: null,
        OdometerReading: "12000", OdometerUnit: "MI", OdometerResultType: "UN-READABLE",
        DaysOutOfMot: 0, IsRetest: false, AnnotationList: [],
      }],
    }));
    const result = await fetchMotHistoryFromVdg("AB12CDE");
    expect(result?.tests[0]).toMatchObject({ mileage: null, mileageTrusted: false });
  });

  it("includes the VRM, URL-encoded, in the VDG request", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    await fetchMotHistoryFromVdg("AB 12 CDE");
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent("AB 12 CDE")));
  });

  it("hits the VDG MOT history endpoint with the MotHistoryDetails package and the configured API key", async () => {
    mocks.fetch.mockResolvedValue(vdgSuccess());
    await fetchMotHistoryFromVdg("AB12CDE");
    const url = mocks.fetch.mock.calls[0][0] as string;
    expect(url).toContain("https://uk.api.vehicledataglobal.com/r2/lookup");
    expect(url).toContain("packageName=MotHistoryDetails");
    expect(url).toContain("apiKey=test-key");
  });
});
