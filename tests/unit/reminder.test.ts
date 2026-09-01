import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTrackerDoc: vi.fn(),
  queryTrackerDocs: vi.fn(),
  updateTrackerDoc: vi.fn(),
  deleteTrackerDoc: vi.fn(),
  getContainer: vi.fn(),
  item: vi.fn(),
  delete: vi.fn(),
  read: vi.fn(),
  upsert: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({ getContainer: mocks.getContainer }));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({
  createTrackerDoc: mocks.createTrackerDoc,
  queryTrackerDocs: mocks.queryTrackerDocs,
  updateTrackerDoc: mocks.updateTrackerDoc,
  deleteTrackerDoc: mocks.deleteTrackerDoc,
}));

import {
  createReminder,
  getReminders,
  updateReminder,
  deleteReminder,
  deleteRemindersBySourceKey,
  getAllReminders,
  markReminderNotified,
} from "@/lib/tracker/reminder";

const email = "rider@example.com";
const bikeId = "bike-1";

const baseReminder = {
  id: `${email}::rm::1`,
  pk: email,
  type: "reminder" as const,
  bikeId,
  name: "Oil change",
  intervalType: "mileage" as const,
  intervalValue: 4000,
  date: "2025-01-01",
  notifiedAt: null,
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseReminder);
  mocks.queryTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseReminder);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
  mocks.delete.mockResolvedValue(undefined);
  mocks.read.mockResolvedValue({ resource: null });
  mocks.upsert.mockResolvedValue(undefined);
  mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [] }) });
  mocks.item.mockReturnValue({ delete: mocks.delete, read: mocks.read });
  mocks.getContainer.mockReturnValue({
    item: mocks.item,
    items: { upsert: mocks.upsert, query: mocks.query },
  });
});

describe("createReminder", () => {
  it("delegates to createTrackerDoc with type 'reminder'", async () => {
    await createReminder(email, { bikeId, name: "Oil change", intervalType: "mileage", intervalValue: 4000, date: "2025-01-01" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email, "reminder", "reminder",
      expect.objectContaining({ name: "Oil change", intervalType: "mileage" })
    );
  });

  it("always sets notifiedAt to null on creation", async () => {
    await createReminder(email, { bikeId, name: "Oil change", intervalType: "mileage", date: "2025-01-01" });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.notifiedAt).toBeNull();
  });

  it("returns the created reminder document", async () => {
    const result = await createReminder(email, { bikeId, name: "Oil change", intervalType: "mileage", date: "2025-01-01" });
    expect(result).toEqual(baseReminder);
  });

  it("passes optional fields through when provided", async () => {
    await createReminder(email, {
      bikeId, name: "MOT renewal", intervalType: "date",
      exactDate: "2026-01-01", sourceKey: "bill:mot-test", date: "2025-01-01",
    });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.exactDate).toBe("2026-01-01");
    expect(payload.sourceKey).toBe("bill:mot-test");
  });
});

describe("getReminders", () => {
  it("queries reminders for the given email and bikeId", async () => {
    await getReminders(email, bikeId);
    expect(mocks.queryTrackerDocs).toHaveBeenCalledWith(email, "reminder", bikeId);
  });

  it("returns the query results", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([baseReminder]);
    const result = await getReminders(email, bikeId);
    expect(result).toEqual([baseReminder]);
  });
});

describe("updateReminder", () => {
  it("delegates to updateTrackerDoc", async () => {
    await updateReminder(email, baseReminder.id, { name: "Updated name" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email, baseReminder.id,
      expect.objectContaining({ name: "Updated name" })
    );
  });

  it("always resets notifiedAt to null on update", async () => {
    await updateReminder(email, baseReminder.id, { intervalValue: 5000 });
    const payload = mocks.updateTrackerDoc.mock.calls[0][2];
    expect(payload.notifiedAt).toBeNull();
  });
});

describe("deleteReminder", () => {
  it("delegates to deleteTrackerDoc", async () => {
    await deleteReminder(email, baseReminder.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseReminder.id);
  });
});

describe("deleteRemindersBySourceKey", () => {
  it("deletes only reminders matching the given sourceKey", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "rm-1", sourceKey: "job:oil-filter" },
      { ...baseReminder, id: "rm-2", sourceKey: "job:tyres" },
      { ...baseReminder, id: "rm-3", sourceKey: "job:oil-filter" },
    ]);
    await deleteRemindersBySourceKey(email, bikeId, "job:oil-filter");
    expect(mocks.delete).toHaveBeenCalledTimes(2);
  });

  it("does nothing when no reminders match the sourceKey", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "rm-1", sourceKey: "job:tyres" },
    ]);
    await deleteRemindersBySourceKey(email, bikeId, "job:oil-filter");
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("does nothing when there are no reminders at all", async () => {
    await deleteRemindersBySourceKey(email, bikeId, "job:oil-filter");
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("uses the correct item(id, email) call when deleting", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "rm-1", sourceKey: "job:oil-filter" },
    ]);
    await deleteRemindersBySourceKey(email, bikeId, "job:oil-filter");
    expect(mocks.item).toHaveBeenCalledWith("rm-1", email);
  });
});

describe("getAllReminders", () => {
  it("returns all reminders from the cross-partition query", async () => {
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [baseReminder] }) });
    const result = await getAllReminders();
    expect(result).toEqual([baseReminder]);
  });

  it("returns an empty array when there are no reminders", async () => {
    const result = await getAllReminders();
    expect(result).toEqual([]);
  });
});

describe("markReminderNotified", () => {
  it("does nothing when the reminder does not exist", async () => {
    mocks.read.mockResolvedValue({ resource: null });
    await markReminderNotified(email, "nonexistent-id");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sets notifiedAt to a current ISO timestamp and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: { ...baseReminder } });
    const before = Date.now();
    await markReminderNotified(email, baseReminder.id);
    const after = Date.now();
    const upsertedDoc = mocks.upsert.mock.calls[0][0];
    const ts = new Date(upsertedDoc.notifiedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("reads using the correct item(id, email) call", async () => {
    mocks.read.mockResolvedValue({ resource: { ...baseReminder } });
    await markReminderNotified(email, baseReminder.id);
    expect(mocks.item).toHaveBeenCalledWith(baseReminder.id, email);
  });
});
