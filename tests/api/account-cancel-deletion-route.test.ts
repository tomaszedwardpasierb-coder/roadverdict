import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  cancelAccountDeletion: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/userAccount", () => ({ cancelAccountDeletion: mocks.cancelAccountDeletion }));

import { POST } from "@/app/api/account/cancel-deletion/route";

describe("POST /api/account/cancel-deletion", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.cancelAccountDeletion.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(401);
    expect(mocks.cancelAccountDeletion).not.toHaveBeenCalled();
  });

  it("cancels the signed-in user's own pending deletion", async () => {
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    const response = await POST();
    expect(response.status).toBe(200);
    expect(mocks.cancelAccountDeletion).toHaveBeenCalledWith("rider@example.com");
  });
});
