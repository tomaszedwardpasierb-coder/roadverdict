import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  getServiceRecords: vi.fn(),
  getFuelLogs: vi.fn(),
  getMods: vi.fn(),
  getBills: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({ getPrimaryBike: mocks.getPrimaryBike }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.getBills }));

import { GET } from "@/app/api/tracker/export/csv/route";

const bike = { id: "bike-1", make: "Yamaha", nickname: null };

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.getPrimaryBike.mockResolvedValue(bike);
  mocks.getServiceRecords.mockResolvedValue([]);
  mocks.getFuelLogs.mockResolvedValue([]);
  mocks.getMods.mockResolvedValue([]);
  mocks.getBills.mockResolvedValue([]);
});

describe("GET /api/tracker/export/csv", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 404 when the account has no bike yet", async () => {
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("returns a CSV response with the correct headers", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toContain("attachment;");
    expect(response.headers.get("Content-Disposition")).toContain(".csv");
  });

  it("includes the correct column header row", async () => {
    const response = await GET();
    const csv = await response.text();
    const firstLine = csv.split("\n")[0];
    expect(firstLine).toBe("Date,Type,Description,Cost,Mileage,Notes");
  });

  it("returns only the header row when there are no records at all", async () => {
    const response = await GET();
    const csv = await response.text();
    expect(csv.trim()).toBe("Date,Type,Description,Cost,Mileage,Notes");
  });

  it("outputs a service record row correctly", async () => {
    mocks.getServiceRecords.mockResolvedValue([
      { date: "2025-01-15", jobType: "oil-filter", cost: 45.5, mileage: 8000, notes: "routine" },
    ]);
    const response = await GET();
    const lines = (await response.text()).split("\n");
    // Expect exactly header + 1 data row
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("2025-01-15,Service,Oil & filter change,45.50,8000,routine");
  });

  it("outputs a fuel log row correctly", async () => {
    mocks.getFuelLogs.mockResolvedValue([
      { date: "2025-02-01", litres: 14.7, cost: 24.0, mileage: 8300, filledToFull: true },
    ]);
    const response = await GET();
    const lines = (await response.text()).split("\n");
    expect(lines[1]).toBe("2025-02-01,Fuel,14.7L (full),24.00,8300,");
  });

  it("uses the non-full description when filledToFull is false", async () => {
    mocks.getFuelLogs.mockResolvedValue([
      { date: "2025-02-01", litres: 8.0, cost: 13.0, mileage: 8200, filledToFull: false },
    ]);
    const response = await GET();
    const csv = await response.text();
    expect(csv).toContain("8.0L,");
    expect(csv).not.toContain("(full)");
  });

  it("outputs a mod row correctly", async () => {
    mocks.getMods.mockResolvedValue([
      { date: "2025-03-01", category: "exhaust", name: "Akrapovic can", cost: 320, mileage: 9000, notes: "" },
    ]);
    const response = await GET();
    const lines = (await response.text()).split("\n");
    expect(lines[1]).toContain("2025-03-01,Modification");
    expect(lines[1]).toContain("Akrapovic can");
    expect(lines[1]).toContain("320.00");
  });

  it("outputs a bill row with an empty mileage column", async () => {
    mocks.getBills.mockResolvedValue([
      { date: "2025-04-01", billType: "insurance", cost: 285, notes: "annual renewal" },
    ]);
    const response = await GET();
    const lines = (await response.text()).split("\n");
    // mileage column is empty for bills
    expect(lines[1]).toBe("2025-04-01,Bill,Insurance,285.00,,annual renewal");
  });

  it("sorts rows by date ascending across all categories", async () => {
    mocks.getServiceRecords.mockResolvedValue([
      { date: "2025-03-01", jobType: "oil-filter", cost: 40, mileage: 9000, notes: "" },
    ]);
    mocks.getFuelLogs.mockResolvedValue([
      { date: "2025-01-01", litres: 14, cost: 22, mileage: 8000, filledToFull: true },
    ]);
    mocks.getBills.mockResolvedValue([
      { date: "2025-02-01", billType: "road-tax", cost: 85, notes: "" },
    ]);
    const response = await GET();
    const lines = (await response.text()).split("\n").slice(1); // drop header
    expect(lines[0]).toContain("2025-01-01");
    expect(lines[1]).toContain("2025-02-01");
    expect(lines[2]).toContain("2025-03-01");
  });

  // A description containing a comma must be wrapped in quotes so parsers
  // don't split it into extra columns.
  it("wraps a description containing a comma in double-quotes", async () => {
    mocks.getMods.mockResolvedValue([
      { date: "2025-01-01", category: "bodywork", name: "screen, tinted", cost: 55, mileage: 1000, notes: "" },
    ]);
    const response = await GET();
    const csv = await response.text();
    expect(csv).toContain('"bodywork: screen, tinted"');
  });

  // A description containing a double-quote must have the quote escaped
  // as two double-quotes per RFC 4180 / standard CSV.
  it("escapes double-quotes inside a field as two double-quotes", async () => {
    mocks.getServiceRecords.mockResolvedValue([
      { date: "2025-01-01", jobType: "oil-filter", cost: 40, mileage: 5000, notes: 'He said "done"' },
    ]);
    const response = await GET();
    const csv = await response.text();
    expect(csv).toContain('"He said ""done"""');
  });

  it("derives the filename from the bike's nickname when present", async () => {
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", make: "Yamaha", nickname: "The Beast" });
    const response = await GET();
    expect(response.headers.get("Content-Disposition")).toContain("The-Beast-history.csv");
  });

  it("falls back to the make for the filename when there is no nickname", async () => {
    // bike already has no nickname set in default beforeEach
    const response = await GET();
    expect(response.headers.get("Content-Disposition")).toContain("Yamaha-history.csv");
  });

  it("uses 'roadverdict' as the filename stem when make and nickname are both absent", async () => {
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", make: null, nickname: null });
    const response = await GET();
    expect(response.headers.get("Content-Disposition")).toContain("roadverdict-history.csv");
  });
});
