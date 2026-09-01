import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  getKnowledgeBaseVersions: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
// getKnowledgeBaseVersions is already covered by its own unit tests
// (tests/unit/assistantConfig.test.ts) - mocked here so this stays
// focused on the route's own auth-gating and response shaping.
vi.mock("@/lib/tracker/assistantConfig", () => ({ getKnowledgeBaseVersions: mocks.getKnowledgeBaseVersions }));

import { GET } from "@/app/api/tomasz/assistant-config/knowledge-base/versions/route";

describe("GET /api/tomasz/assistant-config/knowledge-base/versions", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it("rejects a request with no admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.getKnowledgeBaseVersions).not.toHaveBeenCalled();
  });

  it("returns the version list for an admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const versions = [{ id: "kbVersion::1", pk: "system", type: "knowledgeBaseVersion", content: "old", savedAt: "2025-01-01" }];
    mocks.getKnowledgeBaseVersions.mockResolvedValue(versions);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ versions });
  });

  it("returns 500 without leaking internals when the underlying read throws", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.getKnowledgeBaseVersions.mockRejectedValue(new Error("cosmos unavailable"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to load versions." });
  });
});
