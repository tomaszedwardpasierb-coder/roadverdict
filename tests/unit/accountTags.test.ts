// Place at: tests/unit/accountTags.test.ts
// The bulk "give Pro" must never touch a paying subscriber or shorten a
// longer grant; tags are written as a patch.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUserDoc: vi.fn(), patch: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/cosmos", () => ({ getContainer: () => ({ item: () => ({ patch: mocks.patch }), items: { upsert: mocks.upsert } }) }));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: vi.fn() }));
vi.mock("@/lib/tracker/bike", () => ({ getBikesForUser: vi.fn(), deleteBike: vi.fn() }));
vi.mock("@/lib/tracker/car", () => ({ getCarsForUser: vi.fn(), deleteCar: vi.fn() }));

import { grantPremiumUnlessPaying, setAccountTag } from "@/lib/tracker/userAccount";

const LATER = new Date(Date.now() + 60 * 86400000).toISOString();

beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

describe("grantPremiumUnlessPaying", () => {
  it("skips a real Stripe subscriber", async () => {
    mocks.getUserDoc.mockResolvedValue({ email: "a@example.com", stripeSubscriptionId: "sub_1", plan: { expiresAt: "2026-11-01T00:00:00Z" } });
    expect(await grantPremiumUnlessPaying("a@example.com", LATER)).toBe("paying");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("doesn't shorten a longer grant", async () => {
    mocks.getUserDoc.mockResolvedValue({ email: "a@example.com", plan: { expiresAt: "2099-01-01T00:00:00Z" } });
    expect(await grantPremiumUnlessPaying("a@example.com", LATER)).toBe("already-longer");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("grants everyone else", async () => {
    mocks.getUserDoc.mockResolvedValue({ email: "a@example.com" });
    expect(await grantPremiumUnlessPaying("a@example.com", LATER)).toBe("granted");
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ plan: expect.objectContaining({ expiresAt: LATER }) }));
  });
});

describe("setAccountTag", () => {
  it("adds and removes a tag with a patch", async () => {
    mocks.getUserDoc.mockResolvedValue({ email: "a@example.com", tags: ["friend"] });
    await setAccountTag("a@example.com", "tester", true);
    expect(mocks.patch).toHaveBeenLastCalledWith([{ op: "set", path: "/tags", value: ["friend", "tester"] }]);
    await setAccountTag("a@example.com", "friend", false);
    expect(mocks.patch).toHaveBeenLastCalledWith([{ op: "set", path: "/tags", value: [] }]);
  });
});
