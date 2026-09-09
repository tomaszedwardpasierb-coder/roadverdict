import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  upsert: vi.fn(),
  itemDelete: vi.fn(),
  query: vi.fn(),
  getUserDoc: vi.fn(),
  getBikesForUser: vi.fn(),
  deleteBike: vi.fn(),
  getCarsForUser: vi.fn(),
  deleteCar: vi.fn(),
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
vi.mock("@/lib/tracker/car", () => ({
  getCarsForUser: mocks.getCarsForUser,
  deleteCar: mocks.deleteCar,
}));

import {
  getAllUserAccounts,
  blockAccount,
  unblockAccount,
  grantPremium,
  revokePremium,
  deleteAccount,
  revokeAllSessions,
  MAX_GRANT_YEARS,
  updateProfile,
  requestAccountDeletion,
  cancelAccountDeletion,
  getPendingDeletionInfo,
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS,
} from "@/lib/tracker/userAccount";

const email = "rider@example.com";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.upsert.mockResolvedValue(undefined);
  mocks.itemDelete.mockResolvedValue(undefined);
  mocks.query.mockResolvedValue({ resources: [] });
  mocks.getBikesForUser.mockResolvedValue([]);
  mocks.deleteBike.mockResolvedValue(undefined);
  mocks.getCarsForUser.mockResolvedValue([]);
  mocks.deleteCar.mockResolvedValue(undefined);
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

  // Regression test: deleteAccount originally only cascaded bikes -
  // cars were added to the app later and never wired into this
  // function, meaning a self-serve "delete my account" would have
  // silently left every car (and its service/fuel/mod/bill/labour/
  // reminder records) orphaned in the database forever.
  it("deletes every car via the real deleteCar cascade", async () => {
    mocks.getCarsForUser.mockResolvedValue([{ id: "car-1" }, { id: "car-2" }]);
    await deleteAccount(email);
    expect(mocks.deleteCar).toHaveBeenCalledWith(email, "car-1");
    expect(mocks.deleteCar).toHaveBeenCalledWith(email, "car-2");
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

describe("revokeAllSessions", () => {
  it("queries every session doc in this email's partition and deletes each one", async () => {
    mocks.query.mockResolvedValue({ resources: [{ id: "session-1" }, { id: "session-2" }] });
    const count = await revokeAllSessions(email);
    expect(mocks.query).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining("c.type = 'session'") }));
    expect(mocks.itemDelete).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
  });

  it("returns 0 and deletes nothing when there are no sessions to revoke", async () => {
    mocks.query.mockResolvedValue({ resources: [] });
    const count = await revokeAllSessions(email);
    expect(count).toBe(0);
    expect(mocks.itemDelete).not.toHaveBeenCalled();
  });
});

describe("updateProfile", () => {
  it("throws when no account exists", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    await expect(updateProfile(email, { displayName: "Alex" })).rejects.toThrow(`No account found for ${email}.`);
  });

  it("sets displayName when provided", async () => {
    mocks.getUserDoc.mockResolvedValue({ email });
    await updateProfile(email, { displayName: "Alex" });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Alex" }));
  });

  it("clears displayName when explicitly set to null", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, displayName: "Alex" });
    await updateProfile(email, { displayName: null });
    expect(mocks.upsert.mock.calls[0][0].displayName).toBeUndefined();
  });

  it("leaves displayName untouched when the field isn't passed at all, while still updating avatarBlobName", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, displayName: "Alex" });
    await updateProfile(email, { avatarBlobName: "blob-1.jpg" });
    expect(mocks.upsert.mock.calls[0][0]).toEqual(expect.objectContaining({ displayName: "Alex", avatarBlobName: "blob-1.jpg" }));
  });

  it("clears avatarBlobName when explicitly set to null", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, avatarBlobName: "blob-1.jpg" });
    await updateProfile(email, { avatarBlobName: null });
    expect(mocks.upsert.mock.calls[0][0].avatarBlobName).toBeUndefined();
  });
});

describe("requestAccountDeletion / cancelAccountDeletion", () => {
  it("throws when no account exists", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    await expect(requestAccountDeletion(email)).rejects.toThrow(`No account found for ${email}.`);
  });

  it(`sets deletionRequestedAt to now and pendingDeletionAt to ${ACCOUNT_DELETION_GRACE_PERIOD_DAYS} days out`, async () => {
    mocks.getUserDoc.mockResolvedValue({ email });
    const before = Date.now();
    const { deleteAfter } = await requestAccountDeletion(email);
    const saved = mocks.upsert.mock.calls[0][0];

    expect(saved.deletionRequestedAt).toEqual(expect.any(String));
    expect(saved.pendingDeletionAt).toBe(deleteAfter);
    const daysOut = (new Date(deleteAfter).getTime() - before) / 86_400_000;
    expect(daysOut).toBeGreaterThan(ACCOUNT_DELETION_GRACE_PERIOD_DAYS - 1);
    expect(daysOut).toBeLessThan(ACCOUNT_DELETION_GRACE_PERIOD_DAYS + 1);
  });

  it("cancelAccountDeletion clears both fields", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, deletionRequestedAt: "2025-01-01T00:00:00.000Z", pendingDeletionAt: "2025-01-31T00:00:00.000Z" });
    await cancelAccountDeletion(email);
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved.deletionRequestedAt).toBeUndefined();
    expect(saved.pendingDeletionAt).toBeUndefined();
  });

  it("cancelAccountDeletion also throws when no account exists", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    await expect(cancelAccountDeletion(email)).rejects.toThrow(`No account found for ${email}.`);
  });
});

describe("getPendingDeletionInfo", () => {
  it("returns null when there's no pending deletion", () => {
    expect(getPendingDeletionInfo({ email } as never)).toBeNull();
    expect(getPendingDeletionInfo(null)).toBeNull();
  });

  it("computes days remaining and a human date label from pendingDeletionAt", () => {
    const deleteAfter = new Date(Date.now() + 5 * 86_400_000);
    const result = getPendingDeletionInfo({ email, pendingDeletionAt: deleteAfter.toISOString() } as never);
    expect(result).not.toBeNull();
    expect(result!.daysRemaining).toBeGreaterThanOrEqual(4);
    expect(result!.daysRemaining).toBeLessThanOrEqual(5);
    expect(result!.deleteAfterLabel).toBe(deleteAfter.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }));
  });

  it("never returns a negative day count for a deadline that's already passed", () => {
    const result = getPendingDeletionInfo({ email, pendingDeletionAt: new Date(Date.now() - 86_400_000).toISOString() } as never);
    expect(result!.daysRemaining).toBe(0);
  });
});
