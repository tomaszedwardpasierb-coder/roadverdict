// Place at: tests/unit/vaultAudit.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ item: () => ({ read: mocks.read }), items: { upsert: mocks.upsert } }),
}));

import { detectBrowser, lookupCountry, recordVaultAccess } from "@/lib/tracker/vaultAudit";

describe("detectBrowser", () => {
  it("detects Chrome", () => {
    expect(detectBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36")).toBe("Chrome");
  });

  it("detects Edge, not Chrome, even though Edge's UA also contains Chrome/Safari tokens", () => {
    expect(detectBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Edg/128.0")).toBe("Edge");
  });

  it("detects Firefox", () => {
    expect(detectBrowser("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0")).toBe("Firefox");
  });

  it("detects Safari, not Chrome, on a real Safari UA with no Chrome token", () => {
    expect(detectBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15")).toBe("Safari");
  });

  it("falls back to a generic label for an unrecognised user agent", () => {
    expect(detectBrowser("SomeUnknownBot/1.0")).toBe("Unknown browser");
  });
});

describe("lookupCountry", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns null without making a network call for a non-routable/unknown ip", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    expect(await lookupCountry("unknown")).toBeNull();
    expect(await lookupCountry("127.0.0.1")).toBeNull();
    expect(await lookupCountry("::1")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the resolved country name on a successful lookup", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "United Kingdom\n" }) as unknown as typeof fetch;
    expect(await lookupCountry("203.0.113.5")).toBe("United Kingdom");
  });

  it("returns null when the lookup responds not-ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, text: async () => "" }) as unknown as typeof fetch;
    expect(await lookupCountry("203.0.113.5")).toBeNull();
  });

  it("returns null when the lookup service itself reports an error string", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: async () => "Invalid IP address (error)" }) as unknown as typeof fetch;
    expect(await lookupCountry("not-an-ip")).toBeNull();
  });

  it("fails soft to null when the fetch throws (timeout/network failure)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    expect(await lookupCountry("203.0.113.5")).toBeNull();
  });
});

describe("recordVaultAccess", () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.read.mockReset();
  });

  it("returns null and writes nothing when the account has no user doc", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await recordVaultAccess("nouser@example.com", { browser: "Chrome", country: "UK" })).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns null (not the just-now access) on a first-ever vault open", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "e", pk: "e", type: "user", email: "e" } });
    const previous = await recordVaultAccess("e", { browser: "Chrome", country: "UK" });
    expect(previous).toBeNull();
    const updated = mocks.upsert.mock.calls[0][0];
    expect(updated.vaultAccessLog).toHaveLength(1);
    expect(updated.vaultAccessLog[0]).toMatchObject({ browser: "Chrome", country: "UK" });
  });

  it("returns the previous top entry, then prepends the new one", async () => {
    const existing = [{ at: "2026-01-01T00:00:00.000Z", browser: "Firefox", country: "France" }];
    mocks.read.mockResolvedValue({ resource: { id: "e", pk: "e", type: "user", email: "e", vaultAccessLog: existing } });

    const previous = await recordVaultAccess("e", { browser: "Chrome", country: "UK" });

    expect(previous).toEqual(existing[0]);
    const updated = mocks.upsert.mock.calls[0][0];
    expect(updated.vaultAccessLog[0]).toMatchObject({ browser: "Chrome", country: "UK" });
    expect(updated.vaultAccessLog[1]).toEqual(existing[0]);
  });

  it("keeps only the 5 most recent entries", async () => {
    const existing = Array.from({ length: 5 }, (_, i) => ({ at: `2026-01-0${i + 1}T00:00:00.000Z`, browser: "Firefox", country: "France" }));
    mocks.read.mockResolvedValue({ resource: { id: "e", pk: "e", type: "user", email: "e", vaultAccessLog: existing } });

    await recordVaultAccess("e", { browser: "Chrome", country: "UK" });

    const updated = mocks.upsert.mock.calls[0][0];
    expect(updated.vaultAccessLog).toHaveLength(5);
    expect(updated.vaultAccessLog[0]).toMatchObject({ browser: "Chrome", country: "UK" });
  });
});
