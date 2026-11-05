// The no-account MOT reminder (lib/mot/motReminders.ts): asking for one
// sends only a confirmation, confirming switches it on, the unsubscribe
// link needs its own secret, and the daily run sends one email 4 weeks
// before each MOT - re-checking the record first - then follows the
// vehicle to its next MOT, or drops it.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/auth/crypto";
import type { MotRecord } from "@/lib/mot/motRecord";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  read: vi.fn(),
  replace: vi.fn(),
  remove: vi.fn(),
  fetchAll: vi.fn(),
  sendConfirm: vi.fn(),
  sendReminder: vi.fn(),
  cached: vi.fn(),
  fresh: vi.fn(),
  bump: vi.fn(),
  takeNewLookup: vi.fn(),
  funnel: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { upsert: mocks.upsert, query: () => ({ fetchAll: mocks.fetchAll }) },
    item: () => ({ read: mocks.read, replace: mocks.replace, delete: mocks.remove }),
  }),
}));
vi.mock("@/lib/resend", () => ({ sendMotReminderConfirmEmail: mocks.sendConfirm, sendMotReminderEmail: mocks.sendReminder }));
vi.mock("@/lib/mot/motCheckLookup", () => ({ cachedMotLookup: mocks.cached, freshMotLookup: mocks.fresh }));
vi.mock("@/lib/mot/motCheckUsage", () => ({ bumpDailyCounter: mocks.bump, takeNewLookup: mocks.takeNewLookup }));
vi.mock("@/lib/analytics/funnel", () => ({ recordFunnelStep: mocks.funnel }));

import {
  confirmMotReminder,
  findMotReminderForUnsubscribe,
  itemsFromLastTest,
  processMotReminders,
  processOneMotReminder,
  requestMotReminder,
  unsubscribeMotReminder,
  type MotReminderDoc,
} from "@/lib/mot/motReminders";

const NOW = new Date("2026-11-05T12:00:00Z");
const APP = "https://roadverdict.co.uk";

const record: MotRecord = {
  registration: "YA16MTO",
  make: "YAMAHA",
  model: "MT-07",
  fuelType: "PETROL",
  colour: "BLUE",
  motDueDate: "2027-03-12",
  kind: "bike",
  source: "dvsa",
  tests: [
    {
      date: "2026-03-13T10:00:00",
      passed: true,
      mileage: 33882,
      expiryDate: "2027-03-12",
      defects: [
        { type: "ADVISORY", text: "Rear tyre worn close to legal limit", dangerous: false },
        { type: "ADVISORY", text: "Horn bracket slightly corroded", dangerous: false },
      ],
    },
  ],
};

const found = (r: MotRecord = record) => ({ status: "found" as const, record: r, cached: true });

function confirmedDoc(overrides: Partial<MotReminderDoc> = {}): MotReminderDoc {
  return {
    id: `motReminder::${"a".repeat(40)}`,
    pk: "motReminder",
    type: "motReminder",
    email: "rider@example.com",
    registration: "YA16MTO",
    kind: "bike",
    vehicleName: "Yamaha MT-07",
    motDueDate: "2027-03-12",
    status: "confirmed",
    confirmHash: null,
    unsubscribeToken: "unsub-secret",
    createdAt: "2026-11-01T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.bump.mockResolvedValue(1);
  mocks.takeNewLookup.mockResolvedValue("ok");
  mocks.cached.mockResolvedValue(found());
  mocks.read.mockResolvedValue({ resource: undefined });
});

describe("requestMotReminder", () => {
  const ask = (overrides: Record<string, unknown> = {}) =>
    requestMotReminder({ email: " Rider@Example.com ", registration: "ya16 mto", ip: "1.2.3.4", appUrl: APP, now: NOW, ...overrides });

  it("stores an unconfirmed request that deletes itself, and only emails a confirmation link", async () => {
    expect(await ask()).toEqual({ status: "sent", motDueDate: "2027-03-12" });

    const doc = mocks.upsert.mock.calls[0][0] as MotReminderDoc;
    expect(doc).toMatchObject({ email: "rider@example.com", registration: "YA16MTO", vehicleName: "Yamaha MT-07", status: "pending", ttl: 7 * 24 * 60 * 60 });
    const email = mocks.sendConfirm.mock.calls[0][0];
    expect(email).toMatchObject({ email: "rider@example.com", registration: "YA16MTO", motDueDate: "2027-03-12" });
    // 4 weeks before the due date.
    expect(email.remindOn.slice(0, 10)).toBe("2027-02-12");
    // The link carries the secret; only its hash is stored.
    const link = new URL(email.confirmUrl);
    expect(link.pathname).toBe("/api/mot-reminder/confirm");
    expect(doc.id).toBe(`motReminder::${link.searchParams.get("r")}`);
    expect(doc.confirmHash).toBe(hashToken(link.searchParams.get("t")!));
    expect(JSON.stringify(doc)).not.toContain(link.searchParams.get("t")!);
    expect(mocks.sendReminder).not.toHaveBeenCalled();
    expect(mocks.funnel).toHaveBeenCalledWith("mot_reminder_requested");
  });

  it("says the reminder comes within a day, not on a date already past, for an MOT due in under 4 weeks", async () => {
    mocks.cached.mockResolvedValue(found({ ...record, motDueDate: "2026-11-11T00:00:00Z" }));
    expect((await ask()).status).toBe("sent");
    expect(mocks.sendConfirm.mock.calls[0][0].remindOn).toBeNull();
  });

  it("turns away a bad address or registration before counting or looking anything up", async () => {
    expect(await ask({ email: "not-an-email" })).toEqual({ status: "invalid_email" });
    expect(await ask({ registration: "!!" })).toEqual({ status: "invalid_registration" });
    expect(mocks.bump).not.toHaveBeenCalled();
    expect(mocks.cached).not.toHaveBeenCalled();
  });

  it("stops at each daily ceiling: per visitor, per address and site-wide", async () => {
    mocks.bump.mockResolvedValueOnce(11);
    expect(await ask()).toEqual({ status: "limit" });
    mocks.bump.mockResolvedValueOnce(1).mockResolvedValueOnce(4);
    expect(await ask()).toEqual({ status: "limit" });
    expect(mocks.sendConfirm).not.toHaveBeenCalled();
  });

  it("only sets a reminder for an MOT that hasn't run out", async () => {
    mocks.cached.mockResolvedValue(found({ ...record, motDueDate: "2026-10-01" }));
    expect(await ask()).toEqual({ status: "no_due_date" });
    mocks.cached.mockResolvedValue({ status: "not_found" });
    expect(await ask()).toEqual({ status: "no_due_date" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("looks the plate up afresh only when today's cache has gone, within the site's lookup limit", async () => {
    mocks.cached.mockResolvedValue(null);
    mocks.fresh.mockResolvedValue(found());
    expect((await ask()).status).toBe("sent");
    mocks.takeNewLookup.mockResolvedValue("site_limit");
    expect(await ask()).toEqual({ status: "unavailable" });
  });

  it("doesn't email again for a reminder that's already on", async () => {
    mocks.read.mockResolvedValue({ resource: confirmedDoc() });
    expect(await ask()).toEqual({ status: "already", motDueDate: "2027-03-12" });
    expect(mocks.sendConfirm).not.toHaveBeenCalled();
  });
});

describe("confirming and stopping", () => {
  const key = "a".repeat(40);

  it("switches a request on with the right secret, keeping it for good", async () => {
    mocks.read.mockResolvedValue({ resource: confirmedDoc({ status: "pending", confirmHash: hashToken("right"), ttl: 604800 }) });
    expect(await confirmMotReminder(key, "wrong", NOW)).toEqual({ ok: false });
    expect(mocks.replace).not.toHaveBeenCalled();

    expect(await confirmMotReminder(key, "right", NOW)).toEqual({ ok: true, registration: "YA16MTO", motDueDate: "2027-03-12" });
    const saved = mocks.replace.mock.calls[0][0];
    expect(saved).toMatchObject({ status: "confirmed", confirmHash: null, confirmedAt: NOW.toISOString() });
    expect(saved).not.toHaveProperty("ttl");
    expect(mocks.funnel).toHaveBeenCalledWith("mot_reminder_confirmed");
  });

  it("ignores a link that isn't a real key", async () => {
    expect(await confirmMotReminder("../../etc", "x")).toEqual({ ok: false });
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("stops reminders only with the unsubscribe secret, and treats a gone reminder as stopped", async () => {
    mocks.read.mockResolvedValue({ resource: confirmedDoc() });
    expect(await findMotReminderForUnsubscribe(key, "unsub-secret")).toEqual({ ok: true, registration: "YA16MTO", motDueDate: "2027-03-12" });
    expect(await unsubscribeMotReminder(key, "guess")).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(await unsubscribeMotReminder(key, "unsub-secret")).toBe(true);
    expect(mocks.remove).toHaveBeenCalled();

    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await unsubscribeMotReminder(key, "unsub-secret")).toBe(true);
  });
});

describe("the daily run", () => {
  const at = (iso: string) => new Date(iso);

  it("sends one reminder 4 weeks before, with the last test's items, and marks it", async () => {
    expect(await processOneMotReminder(confirmedDoc(), at("2027-02-11T09:00:00Z"), APP)).toBe("waiting");
    expect(mocks.cached).not.toHaveBeenCalled();

    expect(await processOneMotReminder(confirmedDoc(), at("2027-02-12T09:00:00Z"), APP)).toBe("sent");
    const email = mocks.sendReminder.mock.calls[0][0];
    expect(email).toMatchObject({ email: "rider@example.com", registration: "YA16MTO", motDueDate: "2027-03-12", lastTestDate: "2026-03-13T10:00:00" });
    expect(email.items).toHaveLength(2);
    expect(email.items[0]).toMatchObject({ label: "Advisory", text: "Rear tyre worn close to legal limit" });
    expect(email.items[0].costLine).toMatch(/^Typical cost: /);
    expect(email.unsubscribeUrl).toBe(`${APP}/mot-check/reminder?unsubscribe=${"a".repeat(40)}&t=unsub-secret`);
    expect(email.oneClickUnsubscribeUrl).toBe(`${APP}/api/mot-reminder/unsubscribe?r=${"a".repeat(40)}&t=unsub-secret`);
    expect(mocks.replace).toHaveBeenCalledWith(expect.objectContaining({ remindedFor: "2027-03-12" }));

    mocks.sendReminder.mockReset();
    expect(await processOneMotReminder(confirmedDoc({ remindedFor: "2027-03-12" }), at("2027-02-20T09:00:00Z"), APP)).toBe("waiting");
    expect(mocks.sendReminder).not.toHaveBeenCalled();
  });

  it("moves to the new date instead of emailing when the vehicle was tested early", async () => {
    mocks.cached.mockResolvedValue(found({ ...record, motDueDate: "2028-03-12" }));
    expect(await processOneMotReminder(confirmedDoc(), at("2027-02-20T09:00:00Z"), APP)).toBe("rolled");
    expect(mocks.sendReminder).not.toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith(expect.objectContaining({ motDueDate: "2028-03-12" }));
  });

  it("leaves a reminder to retry tomorrow when the MOT record can't be reached", async () => {
    mocks.cached.mockResolvedValue({ status: "unavailable" });
    expect(await processOneMotReminder(confirmedDoc(), at("2027-02-20T09:00:00Z"), APP)).toBe("failed");
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.sendReminder).not.toHaveBeenCalled();
  });

  it("after the due date, looks weekly for the renewed MOT and sets up next year's reminder", async () => {
    const reminded = confirmedDoc({ remindedFor: "2027-03-12" });
    expect(await processOneMotReminder(reminded, at("2027-03-15T09:00:00Z"), APP)).toBe("waiting");
    expect(mocks.cached).not.toHaveBeenCalled();

    expect(await processOneMotReminder(reminded, at("2027-03-20T09:00:00Z"), APP)).toBe("waiting");
    expect(mocks.replace).toHaveBeenLastCalledWith(expect.objectContaining({ lastCheckedAt: "2027-03-20T09:00:00.000Z" }));

    mocks.cached.mockReset();
    expect(await processOneMotReminder({ ...reminded, lastCheckedAt: "2027-03-20T09:00:00.000Z" }, at("2027-03-24T09:00:00Z"), APP)).toBe("waiting");
    expect(mocks.cached).not.toHaveBeenCalled();

    mocks.cached.mockResolvedValue(found({ ...record, motDueDate: "2028-03-11" }));
    expect(await processOneMotReminder({ ...reminded, lastCheckedAt: "2027-03-20T09:00:00.000Z" }, at("2027-03-28T09:00:00Z"), APP)).toBe("rolled");
    const next = mocks.replace.mock.lastCall![0] as MotReminderDoc;
    expect(next).toMatchObject({ motDueDate: "2028-03-11", remindedFor: "2027-03-12" });
    expect(next.lastCheckedAt).toBeUndefined();
  });

  it("drops a vehicle whose MOT hasn't been renewed 4 months on, or that has no record any more", async () => {
    expect(await processOneMotReminder(confirmedDoc({ remindedFor: "2027-03-12" }), at("2027-07-12T09:00:00Z"), APP)).toBe("dropped");
    expect(mocks.remove).toHaveBeenCalledTimes(1);

    mocks.cached.mockResolvedValue({ status: "not_found" });
    expect(await processOneMotReminder(confirmedDoc(), at("2027-02-20T09:00:00Z"), APP)).toBe("dropped");
    expect(mocks.remove).toHaveBeenCalledTimes(2);
  });

  it("totals a run over every confirmed reminder", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [confirmedDoc(), confirmedDoc({ motDueDate: "2027-09-01" })] });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-20T09:00:00Z"));
    try {
      expect(await processMotReminders()).toEqual({ sent: 1, rolled: 0, dropped: 0, failed: 0 });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("itemsFromLastTest", () => {
  it("is empty for a vehicle with no MOT yet", () => {
    expect(itemsFromLastTest({ ...record, tests: [] }, APP)).toEqual({ testDate: null, items: [] });
  });

  it("gives a quote-checker link only where the price tables cover the job", () => {
    const { items } = itemsFromLastTest(record, APP);
    expect(items[0].quoteUrl).toMatch(/^https:\/\/roadverdict\.co\.uk\//);
    expect(items[1]).toMatchObject({ costLine: null, quoteUrl: null });
  });
});
