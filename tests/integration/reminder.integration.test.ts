// Place at: tests/integration/reminder.integration.test.ts
//
// Exercises src/lib/tracker/reminder.ts against the real Cosmos DB
// Emulator, with particular focus on getAllReminders() - a genuine
// cross-partition scan (no partitionKey option at all) only ever run
// by the daily check-reminders cron, and on updateReminder's real
// notifiedAt-reset-on-edit behavior.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createReminder,
  deleteReminder,
  deleteRemindersBySourceKey,
  getAllReminders,
  getReminders,
  markReminderNotified,
  updateReminder,
} from "@/lib/tracker/reminder";
import { cleanupPartition, testPk } from "./testCosmos";

describe("reminder.ts against a real Cosmos container (emulator)", () => {
  let pks: string[];

  beforeEach(() => {
    pks = [];
  });

  afterEach(async () => {
    await Promise.all(pks.map((pk) => cleanupPartition(pk)));
  });

  function trackPk(label: string): string {
    const pk = testPk(label);
    pks.push(pk);
    return pk;
  }

  it("creates a reminder with notifiedAt initialized to null, and reads it back scoped to its bike", async () => {
    const email = trackPk("create-read");
    const created = await createReminder(email, {
      bikeId: "bike-1",
      name: "Insurance renewal",
      intervalType: "date",
      exactDate: "2027-01-01",
      date: "2026-01-01",
    });
    expect(created.notifiedAt).toBeNull();

    const reminders = await getReminders(email, "bike-1");
    expect(reminders.map((r) => r.id)).toEqual([created.id]);

    const otherBike = await getReminders(email, "bike-2");
    expect(otherBike).toEqual([]);
  });

  it("updateReminder resets notifiedAt to null even when editing an already-notified reminder", async () => {
    const email = trackPk("update-resets-notified");
    const created = await createReminder(email, {
      bikeId: "bike-1",
      name: "MOT due",
      intervalType: "mileage",
      intervalValue: 6000,
      baseMileage: 1000,
      date: "2026-01-01",
    });
    await markReminderNotified(email, created.id);

    const updated = await updateReminder(email, created.id, { intervalValue: 8000 });
    expect(updated?.intervalValue).toBe(8000);
    expect(updated?.notifiedAt).toBeNull();
  });

  it("deletes a reminder so it no longer shows up for its bike", async () => {
    const email = trackPk("delete");
    const created = await createReminder(email, {
      bikeId: "bike-1",
      name: "Tax due",
      intervalType: "date",
      exactDate: "2027-01-01",
      date: "2026-01-01",
    });
    await deleteReminder(email, created.id);
    expect(await getReminders(email, "bike-1")).toEqual([]);
  });

  it("deleteRemindersBySourceKey removes only the reminders tied to that source, leaving others alone", async () => {
    const email = trackPk("delete-by-source-key");
    const tied = await createReminder(email, {
      bikeId: "bike-1",
      name: "Next oil change",
      intervalType: "mileage",
      intervalValue: 6000,
      baseMileage: 0,
      date: "2026-01-01",
      sourceKey: "service::svc-1",
    });
    const untied = await createReminder(email, {
      bikeId: "bike-1",
      name: "Insurance renewal",
      intervalType: "date",
      exactDate: "2027-01-01",
      date: "2026-01-01",
    });

    await deleteRemindersBySourceKey(email, "bike-1", "service::svc-1");

    const remaining = await getReminders(email, "bike-1");
    expect(remaining.map((r) => r.id)).toEqual([untied.id]);
    expect(remaining.map((r) => r.id)).not.toContain(tied.id);
  });

  it("getAllReminders scans across every partition - a genuine cross-partition query, no partitionKey scoping", async () => {
    const emailA = trackPk("cross-partition-a");
    const emailB = trackPk("cross-partition-b");
    const createdA = await createReminder(emailA, {
      bikeId: "bike-1",
      name: "A's reminder",
      intervalType: "date",
      exactDate: "2027-01-01",
      date: "2026-01-01",
    });
    const createdB = await createReminder(emailB, {
      bikeId: "bike-1",
      name: "B's reminder",
      intervalType: "date",
      exactDate: "2027-01-01",
      date: "2026-01-01",
    });

    const all = await getAllReminders();
    const ids = all.map((r) => r.id);
    expect(ids).toContain(createdA.id);
    expect(ids).toContain(createdB.id);
  });

  it("markReminderNotified sets notifiedAt on the real document, and does nothing for a missing id", async () => {
    const email = trackPk("mark-notified");
    const created = await createReminder(email, {
      bikeId: "bike-1",
      name: "Insurance renewal",
      intervalType: "date",
      exactDate: "2027-01-01",
      date: "2026-01-01",
    });

    await markReminderNotified(email, created.id);
    const [reminder] = await getReminders(email, "bike-1");
    expect(reminder.notifiedAt).not.toBeNull();

    // Doesn't throw for a reminder that doesn't exist.
    await expect(markReminderNotified(email, "does-not-exist")).resolves.toBeUndefined();
  });
});
