import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTrackerDoc: vi.fn(),
  updateTrackerDoc: vi.fn(),
  deleteTrackerDoc: vi.fn(),
  queryCarTrackerDocs: vi.fn(),
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
  updateTrackerDoc: mocks.updateTrackerDoc,
  deleteTrackerDoc: mocks.deleteTrackerDoc,
}));
// queryCarTrackerDocs lives in car.ts, not cosmosHelpers.ts - same split
// every other car record type test file already uses.
vi.mock("@/lib/tracker/car", () => ({ queryCarTrackerDocs: mocks.queryCarTrackerDocs }));

import {
  createCarReminder,
  getCarReminders,
  getCarReminderById,
  updateCarReminder,
  deleteCarReminder,
  deleteCarRemindersBySourceKey,
  getAllCarReminders,
  markCarReminderNotified,
  syncCarSornReminder,
  CAR_SORN_REMINDER_SOURCE_KEY,
  CAR_SORN_REMINDER_NAME,
} from "@/lib/tracker/carReminder";

const email = "driver@example.com";
const carId = "car-1";

const baseReminder = {
  id: `${email}::carReminder::1`,
  pk: email,
  type: "carReminder" as const,
  carId,
  name: "Cambelt replacement",
  intervalType: "mileage" as const,
  intervalValue: 60000,
  date: "2025-01-01",
  notifiedAt: null,
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseReminder);
  mocks.queryCarTrackerDocs.mockResolvedValue([]);
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

describe("createCarReminder", () => {
  it("delegates to createTrackerDoc with idPrefix and type both 'carReminder'", async () => {
    await createCarReminder(email, { carId, name: "Cambelt replacement", intervalType: "mileage", intervalValue: 60000, date: "2025-01-01" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email, "carReminder", "carReminder",
      expect.objectContaining({ carId, name: "Cambelt replacement", intervalType: "mileage" })
    );
  });

  it("always sets notifiedAt to null on creation", async () => {
    await createCarReminder(email, { carId, name: "Cambelt replacement", intervalType: "mileage", date: "2025-01-01" });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.notifiedAt).toBeNull();
  });

  it("returns the created reminder document", async () => {
    const result = await createCarReminder(email, { carId, name: "Cambelt replacement", intervalType: "mileage", date: "2025-01-01" });
    expect(result).toEqual(baseReminder);
  });

  it("passes optional fields through when provided", async () => {
    await createCarReminder(email, {
      carId, name: "MOT renewal", intervalType: "date",
      exactDate: "2026-01-01", sourceKey: "bill:mot-test", date: "2025-01-01",
    });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.exactDate).toBe("2026-01-01");
    expect(payload.sourceKey).toBe("bill:mot-test");
  });
});

describe("getCarReminders", () => {
  it("delegates to queryCarTrackerDocs (not queryTrackerDocs) with type 'carReminder'", async () => {
    await getCarReminders(email, carId);
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledWith(email, "carReminder", carId);
  });

  it("returns the query results", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([baseReminder]);
    const result = await getCarReminders(email, carId);
    expect(result).toEqual([baseReminder]);
  });
});

describe("getCarReminderById", () => {
  it("reads using item(id, email) and returns the resource", async () => {
    mocks.read.mockResolvedValue({ resource: baseReminder });
    const result = await getCarReminderById(email, baseReminder.id);
    expect(mocks.item).toHaveBeenCalledWith(baseReminder.id, email);
    expect(result).toEqual(baseReminder);
  });

  it("returns null when no such reminder exists", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await getCarReminderById(email, "missing")).toBeNull();
  });
});

describe("updateCarReminder", () => {
  it("delegates to updateTrackerDoc", async () => {
    await updateCarReminder(email, baseReminder.id, { name: "Updated name" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email, baseReminder.id,
      expect.objectContaining({ name: "Updated name" })
    );
  });

  it("always resets notifiedAt to null on update", async () => {
    await updateCarReminder(email, baseReminder.id, { intervalValue: 65000 });
    const payload = mocks.updateTrackerDoc.mock.calls[0][2];
    expect(payload.notifiedAt).toBeNull();
  });
});

describe("deleteCarReminder", () => {
  it("delegates to deleteTrackerDoc", async () => {
    await deleteCarReminder(email, baseReminder.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseReminder.id);
  });
});

describe("deleteCarRemindersBySourceKey", () => {
  it("deletes only reminders matching the given sourceKey", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "rm-1", sourceKey: "carService:cambelt" },
      { ...baseReminder, id: "rm-2", sourceKey: "carService:tyres-full-set" },
      { ...baseReminder, id: "rm-3", sourceKey: "carService:cambelt" },
    ]);
    await deleteCarRemindersBySourceKey(email, carId, "carService:cambelt");
    expect(mocks.delete).toHaveBeenCalledTimes(2);
  });

  it("does nothing when no reminders match the sourceKey", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "rm-1", sourceKey: "carService:tyres-full-set" },
    ]);
    await deleteCarRemindersBySourceKey(email, carId, "carService:cambelt");
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("uses the correct item(id, email) call when deleting", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "rm-1", sourceKey: "carService:cambelt" },
    ]);
    await deleteCarRemindersBySourceKey(email, carId, "carService:cambelt");
    expect(mocks.item).toHaveBeenCalledWith("rm-1", email);
  });
});

describe("getAllCarReminders", () => {
  it("returns all car reminders from the cross-partition query", async () => {
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [baseReminder] }) });
    const result = await getAllCarReminders();
    expect(result).toEqual([baseReminder]);
  });

  it("returns an empty array when there are no car reminders", async () => {
    const result = await getAllCarReminders();
    expect(result).toEqual([]);
  });
});

describe("markCarReminderNotified", () => {
  it("does nothing when the reminder does not exist", async () => {
    mocks.read.mockResolvedValue({ resource: null });
    await markCarReminderNotified(email, "nonexistent-id");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sets notifiedAt to a current ISO timestamp and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: { ...baseReminder } });
    const before = Date.now();
    await markCarReminderNotified(email, baseReminder.id);
    const after = Date.now();
    const upsertedDoc = mocks.upsert.mock.calls[0][0];
    const ts = new Date(upsertedDoc.notifiedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("syncCarSornReminder", () => {
  it("creates a permanent reminder the first time the car is found SORN'd", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([]);
    await syncCarSornReminder(email, carId, "SORN");
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email, "carReminder", "carReminder",
      expect.objectContaining({ name: CAR_SORN_REMINDER_NAME, intervalType: "permanent", sourceKey: CAR_SORN_REMINDER_SOURCE_KEY })
    );
  });

  it("does not create a second reminder when one already exists and the car is still SORN'd", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "existing-sorn", sourceKey: CAR_SORN_REMINDER_SOURCE_KEY, intervalType: "permanent" },
    ]);
    await syncCarSornReminder(email, carId, "SORN");
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("removes the existing SORN reminder once the car is confirmed taxed", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([
      { ...baseReminder, id: "existing-sorn", sourceKey: CAR_SORN_REMINDER_SOURCE_KEY, intervalType: "permanent" },
    ]);
    await syncCarSornReminder(email, carId, "Taxed");
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("does nothing when the car isn't SORN'd and no reminder exists yet", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([]);
    await syncCarSornReminder(email, carId, "Taxed");
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("does nothing when taxStatus is null and no reminder exists yet", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([]);
    await syncCarSornReminder(email, carId, null);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
