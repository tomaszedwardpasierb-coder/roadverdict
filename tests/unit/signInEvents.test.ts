// Place at: tests/unit/signInEvents.test.ts
//
// The app sign-in record behind /tomasz's "Sign-in health": events are written
// on Azure only, never throw, and the 24-hour summary spots who asked for a
// code and never got in - the sign that an email didn't arrive.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: {
      create: mocks.create,
      query: (spec: unknown, options: unknown) => ({ fetchAll: async () => ({ resources: await mocks.query(spec, options) }) }),
    },
  }),
}));

import { getSignInHealth, logSignInEvent, signInEventPk, summariseSignInHealth, type SignInEvent } from "@/lib/admin/signInEvents";

const NOW = new Date("2026-10-08T12:00:00Z");
const at = (hhmm: string) => `2026-10-08T${hhmm}:00.000Z`;

beforeEach(() => {
  mocks.create.mockReset();
  mocks.query.mockReset();
  mocks.create.mockResolvedValue(undefined);
  process.env.WEBSITE_SITE_NAME = "roadverdict";
});
afterEach(() => {
  delete process.env.WEBSITE_SITE_NAME;
});

describe("logSignInEvent", () => {
  it("writes one small document in the UK day's partition, kept for 30 days", async () => {
    await logSignInEvent("requested", "rider@example.com", { sentOk: false }, NOW);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      pk: "signInEvent::2026-10-08",
      type: "signInEvent",
      kind: "requested",
      email: "rider@example.com",
      sentOk: false,
      createdAt: NOW.toISOString(),
      ttl: 30 * 24 * 60 * 60,
    });
    expect(mocks.create.mock.calls[0][0].id).toMatch(/^signInEvent::/);
  });

  it("leaves sentOk off events that aren't requests", async () => {
    await logSignInEvent("entered", "rider@example.com", {}, NOW);
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("sentOk");
  });

  it("writes nothing off Azure, so a local test sign-in can't reach the live numbers", async () => {
    delete process.env.WEBSITE_SITE_NAME;
    await logSignInEvent("requested", "rider@example.com", {}, NOW);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("never throws when the database fails", async () => {
    mocks.create.mockRejectedValue(new Error("cosmos down"));
    await expect(logSignInEvent("wrong", "rider@example.com", {}, NOW)).resolves.toBeUndefined();
  });
});

describe("summariseSignInHealth", () => {
  const events: SignInEvent[] = [
    { kind: "requested", email: "a@example.com", createdAt: at("11:00"), sentOk: true },
    { kind: "entered", email: "a@example.com", createdAt: at("11:02") },
    { kind: "requested", email: "b@example.com", createdAt: at("09:00"), sentOk: true },
    { kind: "requested", email: "c@example.com", createdAt: at("11:55"), sentOk: true },
    { kind: "requested", email: "d@example.com", createdAt: at("10:00"), sentOk: false },
    { kind: "requested", email: "e@example.com", createdAt: at("08:00"), sentOk: true },
    { kind: "wrong", email: "e@example.com", createdAt: at("08:03") },
    { kind: "expired", email: "e@example.com", createdAt: at("08:04") },
    { kind: "entered", email: "e@example.com", createdAt: at("08:06") },
    { kind: "requested", email: "f@example.com", createdAt: at("07:00"), sentOk: true },
    { kind: "entered", email: "f@example.com", createdAt: at("07:02") },
    { kind: "requested", email: "f@example.com", createdAt: at("11:30"), sentOk: true },
    { kind: "wrong", email: "f@example.com", createdAt: at("11:40") },
  ];
  const health = summariseSignInHealth(events, NOW);

  it("counts codes requested and entered, wrong and expired tries, and refused emails", () => {
    expect(health).toMatchObject({ windowHours: 24, requested: 7, entered: 3, wrong: 2, expired: 1, sendFailed: 1, people: 6, signedIn: 3 });
  });

  it("lists everyone whose latest request has no sign-in after it, newest first", () => {
    expect(health.stuck.map((s) => s.email)).toEqual(["c@example.com", "f@example.com", "d@example.com", "b@example.com"]);
  });

  it("marks a request under ten minutes old as still valid, not yet a problem", () => {
    const c = health.stuck.find((s) => s.email === "c@example.com")!;
    expect(c).toMatchObject({ minutesAgo: 5, stillValid: true, sendFailed: false });
    expect(health.stuck.find((s) => s.email === "b@example.com")).toMatchObject({ minutesAgo: 180, stillValid: false });
  });

  it("flags a refused email and counts wrong tries since the request", () => {
    expect(health.stuck.find((s) => s.email === "d@example.com")?.sendFailed).toBe(true);
    expect(health.stuck.find((s) => s.email === "f@example.com")?.failedTries).toBe(1);
  });

  it("is a problem when an email was refused, watch when someone never got in, ok otherwise", () => {
    expect(health.status).toBe("problem");
    expect(summariseSignInHealth(events.filter((e) => e.email === "b@example.com"), NOW).status).toBe("watch");
    expect(summariseSignInHealth(events.filter((e) => e.email === "c@example.com"), NOW).status).toBe("ok");
    expect(summariseSignInHealth(events.filter((e) => e.email === "a@example.com"), NOW).status).toBe("ok");
    expect(summariseSignInHealth([], NOW)).toMatchObject({ requested: 0, entered: 0, stuck: [], status: "ok" });
  });
});

describe("getSignInHealth", () => {
  it("reads today's and yesterday's partitions for the last 24 hours", async () => {
    mocks.query.mockImplementation(async (_spec: unknown, options: { partitionKey: string }) =>
      options.partitionKey === signInEventPk("2026-10-07") ? [{ kind: "requested", email: "a@example.com", createdAt: "2026-10-07T13:00:00.000Z", sentOk: true }] : [{ kind: "entered", email: "a@example.com", createdAt: at("08:00") }]
    );
    const health = await getSignInHealth(NOW);
    expect(mocks.query.mock.calls.map((c) => (c[1] as { partitionKey: string }).partitionKey).sort()).toEqual(["signInEvent::2026-10-07", "signInEvent::2026-10-08"]);
    expect(health).toMatchObject({ requested: 1, entered: 1, stuck: [], status: "ok" });
  });

  it("reads a single partition when the window stays inside one UK day", async () => {
    mocks.query.mockResolvedValue([]);
    await getSignInHealth(NOW, 3);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });

  it("returns null, not a reassuring zero, when a read fails", async () => {
    mocks.query.mockRejectedValue(new Error("cosmos down"));
    expect(await getSignInHealth(NOW)).toBeNull();
  });
});
