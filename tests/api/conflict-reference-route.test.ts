import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getTrackerDocById: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({ getTrackerDocById: mocks.getTrackerDocById }));

import { GET } from "@/app/api/tracker/conflict-reference/route";

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/tracker/conflict-reference${query}`, { method: "GET" });
}

const email = "owner@example.com";
const id = `${email}::sr::1`;

describe("GET /api/tracker/conflict-reference", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request(`?category=service&id=${id}`));
    expect(response.status).toBe(401);
  });

  it("rejects a missing id", async () => {
    const response = await GET(request("?category=service"));
    expect(response.status).toBe(400);
  });

  it("rejects a category outside the known set", async () => {
    const response = await GET(request(`?category=bills&id=${id}`));
    expect(response.status).toBe(400);
  });

  // Ownership is enforced purely by id prefix here, same pattern used
  // throughout the tracker routes - never trust the category/id alone.
  it("returns 404 (not the record) when the id doesn't belong to the signed-in account", async () => {
    const response = await GET(request(`?category=service&id=stranger@example.com::sr::1`));
    expect(response.status).toBe(404);
    expect(mocks.getTrackerDocById).not.toHaveBeenCalled();
  });

  it("returns 404 when no document exists at that id", async () => {
    mocks.getTrackerDocById.mockResolvedValue(null);
    const response = await GET(request(`?category=service&id=${id}`));
    expect(response.status).toBe(404);
  });

  it("returns a service record's category-specific fields (jobType, notes) alongside the summary ones", async () => {
    mocks.getTrackerDocById.mockResolvedValue({
      id, date: "2025-01-01", mileage: 5000, jobType: "oil-filter", cost: 40, notes: "routine", attachments: [{ blobName: "a.jpg" }],
    });
    const response = await GET(request(`?category=service&id=${id}`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id, category: "service", date: "2025-01-01", mileage: 5000,
      label: "Oil & filter change", cost: 40, attachment: { blobName: "a.jpg" },
      jobType: "oil-filter", notes: "routine",
    });
  });

  it("returns a fuel log's category-specific fields (litres, filledToFull)", async () => {
    mocks.getTrackerDocById.mockResolvedValue({
      id, date: "2025-01-01", mileage: 5000, litres: 12.345, cost: 20, filledToFull: true, attachments: [],
    });
    const response = await GET(request(`?category=fuel&id=${id}`));
    const body = await response.json();
    expect(body).toEqual({
      id, category: "fuel", date: "2025-01-01", mileage: 5000,
      label: "12.3L fill-up", cost: 20, attachment: null,
      litres: 12.345, filledToFull: true,
    });
  });

  it("returns an MOT bill's category-specific fields (billType, notes)", async () => {
    mocks.getTrackerDocById.mockResolvedValue({
      id, date: "2025-01-01", mileage: 5000, billType: "mot-test", cost: 55, notes: "passed", attachments: [],
    });
    const response = await GET(request(`?category=mot&id=${id}`));
    const body = await response.json();
    expect(body).toEqual({
      id, category: "mot", date: "2025-01-01", mileage: 5000,
      label: "MOT test", cost: 55, attachment: null,
      billType: "mot-test", notes: "passed",
    });
  });

  it("returns a mod's category-specific fields (modCategory, name, notes)", async () => {
    mocks.getTrackerDocById.mockResolvedValue({
      id, date: "2025-01-01", mileage: 5000, category: "exhaust", name: "Akrapovic can", notes: "louder", cost: 300, attachments: [],
    });
    const response = await GET(request(`?category=mods&id=${id}`));
    const body = await response.json();
    expect(body).toEqual({
      id, category: "mods", date: "2025-01-01", mileage: 5000,
      label: "Akrapovic can", cost: 300, attachment: null,
      modCategory: "exhaust", name: "Akrapovic can", notes: "louder",
    });
  });
});