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
  getReminderById,
  updateReminder,
  deleteReminder,
  deleteRemindersBySourceKey,
  getAllReminders,
  markReminderNotified,
  syncSornReminder,
  SORN_REMINDER_SOURCE_KEY,
  SORN_REMINDER_NAME,
  TAX_DUE_REMINDER_SOURCE_KEY,
  TAX_DUE_REMINDER_NAME,
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

describe("getReminderById", () => {
  it("reads using item(id, email) and returns the resource", async () => {
    mocks.read.mockResolvedValue({ resource: baseReminder });
    const result = await getReminderById(email, baseReminder.id);
    expect(mocks.item).toHaveBeenCalledWith(baseReminder.id, email);
    expect(result).toEqual(baseReminder);
  });

  it("returns null when no such reminder exists", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await getReminderById(email, "missing")).toBeNull();
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

describe("syncSornReminder", () => {
  it("creates a permanent reminder the first time the vehicle is found SORN'd", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([]);
    await syncSornReminder(email, bikeId, "SORN");
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email, "reminder", "reminder",
      expect.objectContaining({ name: SORN_REMINDER_NAME, intervalType: "permanent", sourceKey: SORN_REMINDER_SOURCE_KEY })
    );
  });

  it("is case-insensitive and tolerant of surrounding whitespace when matching SORN", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([]);
    await syncSornReminder(email, bikeId, "  sorn ");
    expect(mocks.createTrackerDoc).toHaveBeenCalled();
  });

  it("does not create a second reminder when one already exists and the vehicle is still SORN'd", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "existing-sorn", sourceKey: SORN_REMINDER_SOURCE_KEY, intervalType: "permanent" },
    ]);
    await syncSornReminder(email, bikeId, "SORN");
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("removes the existing SORN reminder once the vehicle is confirmed taxed", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "existing-sorn", sourceKey: SORN_REMINDER_SOURCE_KEY, intervalType: "permanent" },
    ]);
    await syncSornReminder(email, bikeId, "Taxed");
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("does nothing when the vehicle isn't SORN'd and no reminder exists yet", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([]);
    await syncSornReminder(email, bikeId, "Taxed");
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("does nothing when taxStatus is null and no reminder exists yet", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([]);
    await syncSornReminder(email, bikeId, null);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  // Taxed with a due date: the other half of this function's job - a
  // "date" reminder for the next renewal, so a taxed vehicle always has
  // a reminder reflecting reality (never silently none at all).
  it("creates a tax-due reminder for a taxed vehicle with a due date", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([]);
    await syncSornReminder(email, bikeId, "Taxed", "2027-06-01");
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email, "reminder", "reminder",
      expect.objectContaining({ name: TAX_DUE_REMINDER_NAME, intervalType: "date", exactDate: "2027-06-01", sourceKey: TAX_DUE_REMINDER_SOURCE_KEY })
    );
  });

  it("replaces an existing tax-due reminder (delete then recreate) once the due date has moved on", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "existing-tax-due", sourceKey: TAX_DUE_REMINDER_SOURCE_KEY, intervalType: "date", exactDate: "2026-06-01" },
    ]);
    await syncSornReminder(email, bikeId, "Taxed", "2027-06-01");
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email, "reminder", "reminder",
      expect.objectContaining({ exactDate: "2027-06-01" })
    );
  });

  it("removes a leftover tax-due reminder when there's no due date on record", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "existing-tax-due", sourceKey: TAX_DUE_REMINDER_SOURCE_KEY, intervalType: "date", exactDate: "2026-06-01" },
    ]);
    await syncSornReminder(email, bikeId, "Taxed", null);
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("removes a leftover tax-due reminder when the vehicle goes SORN, alongside creating the SORN reminder", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "existing-tax-due", sourceKey: TAX_DUE_REMINDER_SOURCE_KEY, intervalType: "date", exactDate: "2026-06-01" },
    ]);
    await syncSornReminder(email, bikeId, "SORN", "2026-06-01");
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email, "reminder", "reminder",
      expect.objectContaining({ name: SORN_REMINDER_NAME, sourceKey: SORN_REMINDER_SOURCE_KEY })
    );
  });
});
