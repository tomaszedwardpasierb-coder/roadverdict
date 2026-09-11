import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
const mockContainer = {
  item: vi.fn(() => ({ read: mocks.read })),
  items: { upsert: mocks.upsert },
};
vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import { canSendAssistantMessage, recordAssistantMessage, ASSISTANT_SIGNED_IN_MESSAGE_LIMIT } from "@/lib/tracker/assistantSignedInUsage";
import type { UserDoc } from "@/lib/tracker/userDoc";

function makeUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return { id: "a@example.com", pk: "a@example.com", type: "user", email: "a@example.com", createdAt: "2025-01-01T00:00:00.000Z", ...overrides };
}

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
});

describe("canSendAssistantMessage", () => {
  it("allows it when null (no user doc at all)", () => {
    expect(canSendAssistantMessage(null)).toBe(true);
  });

  it("allows it when the user has never sent a message before", () => {
    expect(canSendAssistantMessage(makeUser())).toBe(true);
  });

  it("allows it when the stored count is from a previous day", () => {
    const user = makeUser({ assistantMessageUsage: { date: "2020-01-01", count: 9999 } });
    expect(canSendAssistantMessage(user)).toBe(true);
  });

  it("allows it while still under today's limit", () => {
    const today = new Date().toISOString().slice(0, 10);
    const user = makeUser({ assistantMessageUsage: { date: today, count: ASSISTANT_SIGNED_IN_MESSAGE_LIMIT - 1 } });
    expect(canSendAssistantMessage(user)).toBe(true);
  });

  it("blocks once today's count is already at the limit", () => {
    const today = new Date().toISOString().slice(0, 10);
    const user = makeUser({ assistantMessageUsage: { date: today, count: ASSISTANT_SIGNED_IN_MESSAGE_LIMIT } });
    expect(canSendAssistantMessage(user)).toBe(false);
  });
});

describe("recordAssistantMessage", () => {
  it("does nothing when the user doc doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await recordAssistantMessage("missing@example.com");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("starts a fresh count-of-1 for a user with no prior usage today", async () => {
    mocks.read.mockResolvedValue({ resource: makeUser() });
    await recordAssistantMessage("a@example.com");
    const saved = mocks.upsert.mock.calls[0][0] as UserDoc;
    expect(saved.assistantMessageUsage!.count).toBe(1);
    expect(saved.assistantMessageUsage!.date).toBe(new Date().toISOString().slice(0, 10));
  });

  it("increments an existing same-day count", async () => {
    const today = new Date().toISOString().slice(0, 10);
    mocks.read.mockResolvedValue({ resource: makeUser({ assistantMessageUsage: { date: today, count: 5 } }) });
    await recordAssistantMessage("a@example.com");
    const saved = mocks.upsert.mock.calls[0][0] as UserDoc;
    expect(saved.assistantMessageUsage!.count).toBe(6);
  });

  it("resets the count when the stored date is a previous day", async () => {
    mocks.read.mockResolvedValue({ resource: makeUser({ assistantMessageUsage: { date: "2020-01-01", count: 9999 } }) });
    await recordAssistantMessage("a@example.com");
    const saved = mocks.upsert.mock.calls[0][0] as UserDoc;
    expect(saved.assistantMessageUsage!.count).toBe(1);
  });
});
