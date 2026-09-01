import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  runDemoSeed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/demoSeedRunner", () => ({ runDemoSeed: mocks.runDemoSeed }));
// DEMO_EMAIL is real static data (not a repository/AI/external-service
// boundary), same as buyerChecklist/jobTypes elsewhere in this suite -
// left unmocked so the route's own hardcoded-email comparison is
// exercised against the real constant, not a stand-in value.

import { POST } from "@/app/api/demo/reset/route";

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.runDemoSeed.mockReset();
  mocks.runDemoSeed.mockResolvedValue({ fuel: 1, service: 1, mods: 1, bills: 2 });
});

describe("POST /api/demo/reset", () => {
  it("rejects an unauthenticated request without touching the seed runner", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Not the demo account." });
    expect(mocks.runDemoSeed).not.toHaveBeenCalled();
  });

  // The core security property of this route: it must be impossible to
  // trigger a reset/reseed against ANY real, non-demo account, no matter
  // whose session is presented.
  it("rejects a real, signed-in account that is NOT the hardcoded demo account - no reseed, no data touched", async () => {
    mocks.getSession.mockResolvedValue({ email: "real.customer@example.com" });

    const response = await POST();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Not the demo account." });
    expect(mocks.runDemoSeed).not.toHaveBeenCalled();
  });

  it("rejects an email that merely looks similar to the demo account (case or lookalike)", async () => {
    mocks.getSession.mockResolvedValue({ email: "DEMO@roadverdict.co.uk" });

    const response = await POST();

    expect(response.status).toBe(403);
    expect(mocks.runDemoSeed).not.toHaveBeenCalled();
  });

  it("allows the reset when signed in as exactly the demo account", async () => {
    mocks.getSession.mockResolvedValue({ email: "demo@roadverdict.co.uk" });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, counts: { fuel: 1, service: 1, mods: 1, bills: 2 } });
    expect(mocks.runDemoSeed).toHaveBeenCalledOnce();
  });

  it("returns a 500 with a generic message, not a stack trace, when the seed run itself fails", async () => {
    mocks.getSession.mockResolvedValue({ email: "demo@roadverdict.co.uk" });
    mocks.runDemoSeed.mockRejectedValue(new Error("Cosmos write failed"));

    const response = await POST();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Could not reset the demo account." });
  });
});
