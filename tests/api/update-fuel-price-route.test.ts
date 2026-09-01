import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  saveCurrentPetrolPrice: vi.fn(),
}));

vi.mock("@/lib/fuelPrice", () => ({ saveCurrentPetrolPrice: mocks.saveCurrentPetrolPrice }));
vi.stubGlobal("fetch", mocks.fetch);

import { POST } from "@/app/api/cron/update-fuel-price/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/update-fuel-price", { method: "POST", headers });
}

const CSV_URL = "https://assets.publishing.service.gov.uk/media/abc123/weekly_road_fuel_prices.csv";

function pageHtml(csvUrl: string | null): string {
  const link = csvUrl ? `<a href="${csvUrl}">CSV</a>` : "<p>no csv here</p>";
  return `<html><body>${link}</body></html>`;
}

// DD/MM/YYYY, as DESNZ publishes it - `daysAgo` computed relative to the
// real clock at test-run time so this stays valid regardless of when the
// suite actually runs.
function ukDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function csvText(dateStr: string, price = 150.5): string {
  return `Date,ULSP,ULSD\n01/01/2020,140.0,145.0\n${dateStr},${price},155.0`;
}

function okResponse(text: string) {
  return { ok: true, text: () => Promise.resolve(text) };
}

describe("POST /api/cron/update-fuel-price", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.saveCurrentPetrolPrice.mockReset();
    mocks.saveCurrentPetrolPrice.mockResolvedValue(undefined);
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

  it("returns 502 when the statistics page itself can't be loaded", async () => {
    mocks.fetch.mockResolvedValue({ ok: false });
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Could not load statistics page" });
  });

  it("returns 502 when no matching CSV link can be found on the page", async () => {
    mocks.fetch.mockResolvedValue(okResponse(pageHtml(null)));
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Could not find CSV link on page" });
  });

  it("returns 502 when the CSV itself can't be downloaded", async () => {
    mocks.fetch
      .mockResolvedValueOnce(okResponse(pageHtml(CSV_URL)))
      .mockResolvedValueOnce({ ok: false });
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Could not download CSV" });
  });

  it("returns 502 when the CSV has no data rows to parse", async () => {
    mocks.fetch
      .mockResolvedValueOnce(okResponse(pageHtml(CSV_URL)))
      .mockResolvedValueOnce(okResponse("Date,ULSP,ULSD"));
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Could not parse latest price from CSV" });
  });

  it("rejects a 'latest' row that's actually years stale (guards the file-identity mistake noted in the source)", async () => {
    mocks.fetch
      .mockResolvedValueOnce(okResponse(pageHtml(CSV_URL)))
      .mockResolvedValueOnce(okResponse(csvText(ukDate(365 * 3))));
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Could not parse latest price from CSV" });
    expect(mocks.saveCurrentPetrolPrice).not.toHaveBeenCalled();
  });

  it("parses a genuinely current row and saves it", async () => {
    const currentDate = ukDate(3);
    mocks.fetch
      .mockResolvedValueOnce(okResponse(pageHtml(CSV_URL)))
      .mockResolvedValueOnce(okResponse(csvText(currentDate, 149.9)));

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, pricePenceLitre: 149.9, weekCommencing: currentDate });
    expect(mocks.saveCurrentPetrolPrice).toHaveBeenCalledWith(149.9, currentDate);
  });

  it("fetches the CSV URL discovered on the statistics page, not a hardcoded one", async () => {
    mocks.fetch
      .mockResolvedValueOnce(okResponse(pageHtml(CSV_URL)))
      .mockResolvedValueOnce(okResponse(csvText(ukDate(1))));
    await POST(request({ authorization: "Bearer top-secret" }));
    expect(mocks.fetch).toHaveBeenNthCalledWith(2, CSV_URL);
  });

  it("returns a 500 when saving the parsed price throws", async () => {
    mocks.fetch
      .mockResolvedValueOnce(okResponse(pageHtml(CSV_URL)))
      .mockResolvedValueOnce(okResponse(csvText(ukDate(1))));
    mocks.saveCurrentPetrolPrice.mockRejectedValue(new Error("Cosmos unavailable"));

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Unexpected error updating fuel price" });
  });
});
