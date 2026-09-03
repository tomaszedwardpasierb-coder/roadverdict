import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  upsert: vi.fn(),
  itemDelete: vi.fn(),
  query: vi.fn(),
  getUserDoc: vi.fn(),
  getBikesForUser: vi.fn(),
  deleteBike: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: () => ({ read: mocks.read, delete: mocks.itemDelete }),
    items: {
      upsert: mocks.upsert,
      query: (queryObj: unknown) => ({ fetchAll: () => mocks.query(queryObj) }),
    },
  }),
}));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/tracker/bike", () => ({
  getBikesForUser: mocks.getBikesForUser,
  deleteBike: mocks.deleteBike,
}));

import { getAllUserAccounts, blockAccount, unblockAccount, grantPremium, revokePremium, deleteAccount, MAX_GRANT_YEARS } from "@/lib/tracker/userAccount";

const email = "rider@example.com";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.upsert.mockResolvedValue(undefined);
  mocks.itemDelete.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue({ resources: [] });
  mocks.getBikesForUser.mockResolvedValue([]);
  mocks.deleteBike.mockResolvedValue(undefined);
});

describe("getAllUserAccounts", () => {
  it("queries every type:'user' doc and returns the full documents", async () => {
    mocks.query.mockResolvedValue({ resources: [{ email, blocked: true }] });
    const result = await getAllUserAccounts();
    expect(result).toEqual([{ email, blocked: true }]);
    expect(mocks.query).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining("c.type = 'user'") }));
  });
});

describe("blockAccount / unblockAccount", () => {
  it("throws when no account exists for that email", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    await expect(blockAccount(email)).rejects.toThrow(`No account found for ${email}.`);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sets blocked and blockedAt on the real document", async () => {
    mocks.getUserDoc.mockResolvedValue({ email });
    await blockAccount(email);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ email, blocked: true, blockedAt: expect.any(String) }));
  });

  it("unblockAccount clears both fields", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, blocked: true, blockedAt: "2025-01-01T00:00:00.000Z" });
    await unblockAccount(email);
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved.blocked).toBeUndefined();
    expect(saved.blockedAt).toBeUndefined();
  });

  it("unblockAccount also throws when no account exists", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    await expect(unblockAccount(email)).rejects.toThrow(`No account found for ${email}.`);
  });
});

describe("grantPremium", () => {
  it("throws when no account exists for that email", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    await expect(grantPremium(email, new Date(Date.now() + 86_400_000).toISOString())).rejects.toThrow(`No account found for ${email}.`);
  });

  it("throws on an invalid date string", async () => {
    mocks.getUserDoc.mockResolvedValue({ email });
    await expect(grantPremium(email, "not-a-date")).rejects.toThrow("Invalid expiry date.");
  });

  it("throws when the expiry is already in the past", async () => {
    mocks.getUserDoc.mockResolvedValue({ email });
    await expect(grantPremium(email, new Date(Date.now() - 1000).toISOString())).rejects.toThrow("Expiry date must be in the future.");
  });

  it(`throws when the expiry exceeds ${MAX_GRANT_YEARS} years from now`, async () => {
    mocks.getUserDoc.mockResolvedValue({ email });
    const tooFar = new Date();
    tooFar.setFullYear(tooFar.getFullYear() + MAX_GRANT_YEARS + 1);
    await expect(grantPremium(email, tooFar.toISOString())).rejects.toThrow(`Grants can't exceed ${MAX_GRANT_YEARS} years.`);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it(`allows exactly ${MAX_GRANT_YEARS} years from now`, async () => {
    mocks.getUserDoc.mockResolvedValue({ email });
    const maxAllowed = new Date();
    maxAllowed.setFullYear(maxAllowed.getFullYear() + MAX_GRANT_YEARS);
    // A hair under the exact boundary to absorb the few ms that elapse
    // between this line and the function's own `new Date()` call.
    maxAllowed.setSeconds(maxAllowed.getSeconds() - 5);
    await grantPremium(email, maxAllowed.toISOString());
    expect(mocks.upsert).toHaveBeenCalled();
  });

  it("sets plan with the given expiry and a fresh grantedAt", async () => {
    mocks.getUserDoc.mockResolvedValue({ email });
    const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await grantPremium(email, expiresAt);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ email, plan: { grantedAt: expect.any(String), expiresAt } })
    );
  });
});

describe("revokePremium", () => {
  it("throws when no account exists", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    await expect(revokePremium(email)).rejects.toThrow(`No account found for ${email}.`);
  });

  it("clears the plan field", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, plan: { grantedAt: "x", expiresAt: "y" } });
    await revokePremium(email);
    expect(mocks.upsert.mock.calls[0][0].plan).toBeUndefined();
  });
});

describe("deleteAccount", () => {
  it("deletes every bike via the real deleteBike cascade", async () => {
    mocks.getBikesForUser.mockResolvedValue([{ id: "bike-1" }, { id: "bike-2" }]);
    await deleteAccount(email);
    expect(mocks.deleteBike).toHaveBeenCalledWith(email, "bike-1");
    expect(mocks.deleteBike).toHaveBeenCalledWith(email, "bike-2");
  });

  it("point-deletes every other email-partitioned doc type", async () => {
    mocks.query.mockImplementation((q: { query: string; parameters?: { name: string; value: string }[] }) => {
      if (q.query.includes("c.type = @type")) {
        return Promise.resolve({ resources: [{ id: "doc-1" }] });
      }
      return Promise.resolve({ resources: [] });
    });

    await deleteAccount(email);

    // user, session, magicLink, notification, pendingScanBatch,
    // bikeTransferRequest, receiptRequest - one query + one delete each.
    expect(mocks.itemDelete).toHaveBeenCalledTimes(7);
  });

  it("best-effort cleans up assistantQuestion entries via the cross-partition email query, without failing the whole deletion if that lookup throws", async () => {
    mocks.query.mockImplementation((q: { query: string }) => {
      if (q.query.includes("assistantQuestion")) return Promise.reject(new Error("boom"));
      return Promise.resolve({ resources: [] });
    });

    await expect(deleteAccount(email)).resolves.toBeUndefined();
  });
});
