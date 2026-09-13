import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

describe("fetchWithTimeout", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("calls the real fetch with an AbortSignal attached", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as unknown as typeof fetch;

    await fetchWithTimeout("https://example.com/data");

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://example.com/data");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("preserves other init options (method, headers) passed by the caller", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as unknown as typeof fetch;

    await fetchWithTimeout("https://example.com/data", { method: "POST", headers: { Authorization: "Bearer x" } });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer x" });
  });

  it("resolves with whatever the underlying fetch resolves to", async () => {
    const fakeResponse = { ok: true, status: 200 };
    global.fetch = vi.fn().mockResolvedValue(fakeResponse) as unknown as typeof fetch;

    await expect(fetchWithTimeout("https://example.com/data")).resolves.toBe(fakeResponse);
  });
});
