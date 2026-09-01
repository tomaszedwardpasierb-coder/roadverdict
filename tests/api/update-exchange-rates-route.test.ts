import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ items: { upsert: mocks.upsert } }),
}));
vi.stubGlobal("fetch", mocks.fetch);

import { POST } from "@/app/api/cron/update-exchange-rates/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/update-exchange-rates", { method: "POST", headers });
}

function frankfurterOk(rows: { quote: string; rate: number }[]) {
  return { ok: true, json: () => Promise.resolve(rows) };
}

describe("POST /api/cron/update-exchange-rates", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.upsert.mockReset();
    mocks.upsert.mockResolvedValue(undefined);
    process.env.CRON_SECRET = "top-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(request({ authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
  });

  it("rejects every request when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(401);
  });

  it("queries Frankfurter for every non-GBP currency, based off GBP", async () => {
    mocks.fetch.mockResolvedValue(frankfurterOk([{ quote: "EUR", rate: 1.15 }]));
    await POST(request({ authorization: "Bearer top-secret" }));
    const calledUrl = mocks.fetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("base=GBP");
    expect(calledUrl).toContain("EUR");
    expect(calledUrl).not.toContain("quotes=GBP");
  });

  it("stores the flattened rates and returns them on success", async () => {
    mocks.fetch.mockResolvedValue(frankfurterOk([
      { quote: "EUR", rate: 1.15 },
      { quote: "PLN", rate: 5.1 },
    ]));

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, rates: { EUR: 1.15, PLN: 5.1 } });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "exchangeRates", pk: "system", type: "exchangeRates", base: "GBP",
      rates: { EUR: 1.15, PLN: 5.1 },
    }));
  });

  it("returns a 500 when Frankfurter responds with a non-OK status", async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 502, json: () => Promise.resolve([]) });
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to fetch exchange rates");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns a 500 when the fetch itself throws", async () => {
    mocks.fetch.mockRejectedValue(new Error("network timeout"));
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(500);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
