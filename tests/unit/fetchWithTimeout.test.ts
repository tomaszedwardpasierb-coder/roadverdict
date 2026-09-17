import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, FetchTimeoutError, UPLOAD_TIMEOUT_MS } from "@/lib/fetchWithTimeout";

describe("fetchWithTimeout", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
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

  it("throws FetchTimeoutError once the deadline elapses on a request that stalls instead of rejecting", async () => {
    vi.useFakeTimers();
    // A real fetch given an aborted signal rejects - this mock mirrors that
    // by staying pending until the signal it was handed fires.
    global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    }) as unknown as typeof fetch;

    const promise = fetchWithTimeout("https://example.com/data", undefined, 5_000);
    const assertion = expect(promise).rejects.toBeInstanceOf(FetchTimeoutError);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it("re-throws a genuine fetch failure unchanged, not as FetchTimeoutError", async () => {
    const realError = new Error("DNS lookup failed");
    global.fetch = vi.fn().mockRejectedValue(realError) as unknown as typeof fetch;

    await expect(fetchWithTimeout("https://example.com/data")).rejects.toBe(realError);
  });

  it("exposes UPLOAD_TIMEOUT_MS as the 45s deadline upload call sites pass in", () => {
    expect(UPLOAD_TIMEOUT_MS).toBe(45_000);
  });
});
