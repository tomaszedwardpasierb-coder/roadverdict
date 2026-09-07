import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  getCarKnowledgeBaseVersions: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/assistantConfig", () => ({ getCarKnowledgeBaseVersions: mocks.getCarKnowledgeBaseVersions }));

import { GET } from "@/app/api/tomasz/assistant-config/car-knowledge-base/versions/route";

describe("GET /api/tomasz/assistant-config/car-knowledge-base/versions", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it("rejects a request with no admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.getCarKnowledgeBaseVersions).not.toHaveBeenCalled();
  });

  it("returns the version list for an admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const versions = [{ id: "kbVersionCar::1", pk: "system", type: "knowledgeBaseVersionCar", content: "old", savedAt: "2025-01-01" }];
    mocks.getCarKnowledgeBaseVersions.mockResolvedValue(versions);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ versions });
  });

  it("returns 500 without leaking internals when the underlying read throws", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.getCarKnowledgeBaseVersions.mockRejectedValue(new Error("cosmos unavailable"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to load versions." });
  });
});
