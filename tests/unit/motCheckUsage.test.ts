// The free MOT check's switch, daily limits, and its cache-first lookup.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ counts: new Map<string, number>(), docs: new Map<string, unknown>() }));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: (id: string) => ({
      patch: async () => {
        if (!store.counts.has(id)) throw Object.assign(new Error("missing"), { code: 404 });
        store.counts.set(id, (store.counts.get(id) as number) + 1);
        return { resource: { count: store.counts.get(id) } };
      },
      read: async () => ({ resource: store.docs.get(id) }),
    }),
    items: {
      create: async (doc: { id: string; count: number }) => {
        store.counts.set(doc.id, doc.count);
      },
      upsert: async (doc: { id: string }) => {
        store.docs.set(doc.id, doc);
      },
    },
  }),
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/fetchWithTimeout", () => ({ fetchWithTimeout: fetchMock }));

import { motCheckMode, takeNewLookup, takeVisitorCheck, visitorAddress } from "@/lib/mot/motCheckUsage";
import { cachedMotLookup, freshMotLookup, motSource } from "@/lib/mot/motCheckLookup";

beforeEach(() => {
  store.counts.clear();
  store.docs.clear();
  fetchMock.mockReset();
  process.env.VDG_API_KEY = "test-key";
});
afterEach(() => {
  delete process.env.MOT_CHECK_MODE;
  delete process.env.MOT_SOURCE;
  delete process.env.VDG_API_KEY;
});

describe("motCheckMode", () => {
  it("is public unless pulled back to admin-only or off", () => {
    expect(motCheckMode()).toBe("public");
    process.env.MOT_CHECK_MODE = "admin";
    expect(motCheckMode()).toBe("admin");
    process.env.MOT_CHECK_MODE = "off";
    expect(motCheckMode()).toBe("off");
    process.env.MOT_CHECK_MODE = "nonsense";
    expect(motCheckMode()).toBe("public");
  });
});

describe("visitorAddress", () => {
  it("drops the port Azure adds, so one visitor stays one visitor", () => {
    expect(visitorAddress("203.0.113.5:51234")).toBe("203.0.113.5");
    expect(visitorAddress("203.0.113.5:51234, 10.0.0.1")).toBe("203.0.113.5");
    expect(visitorAddress("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(visitorAddress("2001:db8::1")).toBe("2001:db8::1");
    expect(visitorAddress(null)).toBe("unknown");
  });
});

describe("daily limits", () => {
  it("lets a visitor use their share, then refuses, keeping only a scrambled address", async () => {
    for (let i = 0; i < 3; i++) expect(await takeVisitorCheck("5.6.7.8", 3)).toBe("ok");
    expect(await takeVisitorCheck("5.6.7.8", 3)).toBe("visitor_limit");
    expect(await takeVisitorCheck("1.1.1.1", 3)).toBe("ok");
    expect([...store.counts.keys()].some((k) => k.includes("5.6.7.8"))).toBe(false);
  });

  it("caps new lookups across the whole site", async () => {
    expect(await takeNewLookup(2)).toBe("ok");
    expect(await takeNewLookup(2)).toBe("ok");
    expect(await takeNewLookup(2)).toBe("site_limit");
  });
});

describe("lookup", () => {
  const vdgFound = {
    ResponseInformation: { IsSuccessStatusCode: true, StatusCode: 0 },
    Results: { MotHistoryDetails: { Make: "YAMAHA", Model: "MT-07", MotDueDate: "2027-03-01", MotTestDetailsList: [] } },
  };

  it("fetches a new plate from VDG once, then serves it from the cache", async () => {
    fetchMock.mockResolvedValue({ json: async () => vdgFound });
    expect(await cachedMotLookup("YA16MTO")).toBeNull();
    const fresh = await freshMotLookup("YA16MTO");
    expect(fresh).toMatchObject({ status: "found", cached: false, record: { make: "YAMAHA", kind: "bike", source: "vdg" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("packageName=MotHistoryDetails&vrm=YA16MTO");
    expect(await cachedMotLookup("YA16MTO")).toMatchObject({ status: "found", cached: true });
  });

  it("remembers a plate with no record, so retrying it costs nothing", async () => {
    fetchMock.mockResolvedValue({ json: async () => ({ ResponseInformation: { IsSuccessStatusCode: false } }) });
    expect(await freshMotLookup("ZZ99ZZZ")).toEqual({ status: "not_found" });
    expect(await cachedMotLookup("ZZ99ZZZ")).toEqual({ status: "not_found" });
  });

  it("says unavailable, and caches nothing, when VDG can't be reached or isn't set up", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    expect(await freshMotLookup("AB12CDE")).toEqual({ status: "unavailable" });
    expect(await cachedMotLookup("AB12CDE")).toBeNull();
    delete process.env.VDG_API_KEY;
    expect(await freshMotLookup("AB12CDE")).toEqual({ status: "unavailable" });
  });

  it("still uses VDG when MOT_SOURCE asks for DVSA, until that's connected", async () => {
    process.env.MOT_SOURCE = "dvsa";
    expect(motSource()).toBe("dvsa");
    fetchMock.mockResolvedValue({ json: async () => vdgFound });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await freshMotLookup("YA16MTO")).toMatchObject({ status: "found" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
