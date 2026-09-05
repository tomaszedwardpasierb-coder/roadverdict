// Place at: tests/integration/bikeTransfer.integration.test.ts
//
// Exercises src/lib/tracker/bikeTransfer.ts - genuinely the highest-
// stakes untested-at-the-integration-level feature in the app, per this
// repo's own history - against the real Cosmos DB Emulator. A bike
// "moving" to a different owner's partition, its records copying to a
// brand new partition/bikeId, and the cross-account
// findBikeByRegistrationAcrossAccounts collision check are exactly the
// things a mocked container can prove pass without proving they'd
// actually work.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// isPro() is temporarily true for everyone (see subscriptions.ts's own
// comment) while no payment platform is wired in - real, deliberate,
// unrelated to Cosmos. Left un-mocked, it would defeat the recipient-cap
// test below entirely, which isn't what this file is for: the point
// here is proving transferBike's own cap check queries the recipient's
// real documents correctly, not re-litigating isPro() itself (already
// covered in tests/unit/bikeTransfer.test.ts, mocked the same way).
const mocks = vi.hoisted(() => ({ isPro: vi.fn(async () => false) }));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));

import { transferBike } from "@/lib/tracker/bikeTransfer";
import { createBike, getBike, MAX_FREE_BIKES } from "@/lib/tracker/bike";
import { createServiceRecord, getServiceRecords } from "@/lib/tracker/serviceRecord";
import { createReminder, getReminders, markReminderNotified } from "@/lib/tracker/reminder";
import { createBillSeries, getBillSeriesForBike } from "@/lib/tracker/billSeries";
import { cleanupPartition, testPk } from "./testCosmos";

function newBikeData(overrides: Partial<Parameters<typeof createBike>[1]> = {}) {
  return {
    make: "Honda",
    model: "CB500F",
    engineCC: 471,
    bikeClass: "medium" as const,
    registration: `TRANSFER${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    currentMileage: 5000,
    nickname: "Test bike",
    region: "rest-england-wales" as const,
    ...overrides,
  };
}

describe("bikeTransfer.ts against a real Cosmos container (emulator)", () => {
  let pks: string[];

  beforeEach(() => {
    pks = [];
    mocks.isPro.mockReset().mockResolvedValue(false);
  });

  afterEach(async () => {
    await Promise.all(pks.map((pk) => cleanupPartition(pk)));
  });

  function trackPk(label: string): string {
    const pk = testPk(label);
    pks.push(pk);
    return pk;
  }

  it("transfers a bike with records: moves the bike, links both docs, and copies real records into the new partition/bikeId", async () => {
    const fromEmail = trackPk("transfer-with-records-from");
    const toEmail = trackPk("transfer-with-records-to");
    const { bike: oldBike } = (await createBike(fromEmail, newBikeData())) as { ok: true; bike: { id: string } };

    await createServiceRecord(fromEmail, {
      bikeId: oldBike.id,
      jobType: "full-service",
      cost: 150,
      mileage: 4500,
      date: "2026-01-01",
      notes: "Full service",
    });
    const reminder = await createReminder(fromEmail, {
      bikeId: oldBike.id,
      name: "Next service",
      intervalType: "mileage",
      intervalValue: 6000,
      baseMileage: 4500,
      date: "2026-01-01",
    });
    await markReminderNotified(fromEmail, reminder.id); // proves notifiedAt gets reset on copy, not carried over

    const result = await transferBike(fromEmail, oldBike.id, toEmail, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const oldBikeAfter = await getBike(fromEmail, oldBike.id);
    expect(oldBikeAfter?.transferredTo).toMatchObject({ newBikeId: result.newBike.id, newOwnerEmail: toEmail });

    expect(result.newBike.pk).toBe(toEmail);
    expect(result.newBike.transferredFrom).toMatchObject({ previousBikeId: oldBike.id, previousOwnerEmail: fromEmail });
    // A frozen summary of what the old owner's records added up to, not
    // a live figure - computed from the real seller-report pipeline.
    expect(result.newBike.transferredFrom!.summaryAtTransfer.totalEntries).toBeGreaterThan(0);

    const copiedRecords = await getServiceRecords(toEmail, result.newBike.id);
    expect(copiedRecords).toHaveLength(1);
    expect(copiedRecords[0].bikeId).toBe(result.newBike.id);

    const copiedReminders = await getReminders(toEmail, result.newBike.id);
    expect(copiedReminders).toHaveLength(1);
    // The new owner hasn't been notified about anything yet, regardless
    // of whether the previous owner already was before the handover.
    expect(copiedReminders[0].notifiedAt).toBeNull();

    // The old owner's own copy of the record is untouched, still theirs.
    const oldRecords = await getServiceRecords(fromEmail, oldBike.id);
    expect(oldRecords).toHaveLength(1);
  });

  it("with includeRecords: false, only the bike-level facts move - no records copy over", async () => {
    const fromEmail = trackPk("transfer-no-records-from");
    const toEmail = trackPk("transfer-no-records-to");
    const { bike: oldBike } = (await createBike(fromEmail, newBikeData())) as { ok: true; bike: { id: string } };
    await createServiceRecord(fromEmail, { bikeId: oldBike.id, jobType: "full-service", cost: 150, mileage: 4500, date: "2026-01-01", notes: "" });

    const result = await transferBike(fromEmail, oldBike.id, toEmail, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await getServiceRecords(toEmail, result.newBike.id)).toEqual([]);
  });

  it("refuses to transfer to the same account", async () => {
    const email = trackPk("same-owner");
    const { bike } = (await createBike(email, newBikeData())) as { ok: true; bike: { id: string } };
    expect(await transferBike(email, bike.id, email, false)).toEqual({ ok: false, reason: "same_owner" });
  });

  it("refuses to transfer a bike id that doesn't exist", async () => {
    const fromEmail = trackPk("bike-not-found-from");
    const toEmail = trackPk("bike-not-found-to");
    expect(await transferBike(fromEmail, "does-not-exist", toEmail, false)).toEqual({ ok: false, reason: "bike_not_found" });
  });

  it("refuses to transfer a bike that's already been transferred once", async () => {
    const fromEmail = trackPk("already-transferred-from");
    const toEmail = trackPk("already-transferred-to");
    const thirdEmail = trackPk("already-transferred-third");
    const { bike } = (await createBike(fromEmail, newBikeData())) as { ok: true; bike: { id: string } };
    await transferBike(fromEmail, bike.id, toEmail, false);

    expect(await transferBike(fromEmail, bike.id, thirdEmail, false)).toEqual({ ok: false, reason: "already_transferred" });
  });

  it("refuses when the recipient is already at the real free-tier cap", async () => {
    const fromEmail = trackPk("recipient-cap-from");
    const toEmail = trackPk("recipient-cap-to");
    const { bike } = (await createBike(fromEmail, newBikeData())) as { ok: true; bike: { id: string } };
    for (let i = 0; i < MAX_FREE_BIKES; i++) {
      await createBike(toEmail, newBikeData({ registration: `CAP${i}-${Date.now()}` }));
    }

    expect(await transferBike(fromEmail, bike.id, toEmail, false)).toEqual({
      ok: false,
      reason: "recipient_limit_reached",
      limit: MAX_FREE_BIKES,
    });
  });

  it("lets a transfer through past the recipient's free-tier cap when the recipient is Pro, against a real Cosmos container", async () => {
    const fromEmail = trackPk("recipient-pro-from");
    const toEmail = trackPk("recipient-pro-to");
    const { bike } = (await createBike(fromEmail, newBikeData())) as { ok: true; bike: { id: string } };
    for (let i = 0; i < MAX_FREE_BIKES; i++) {
      await createBike(toEmail, newBikeData({ registration: `PROCAP${i}-${Date.now()}` }));
    }

    mocks.isPro.mockResolvedValue(true);
    const result = await transferBike(fromEmail, bike.id, toEmail, false);
    expect(result.ok).toBe(true);
  });

  it("refuses when the recipient already owns a bike under this exact registration - a real cross-partition collision check", async () => {
    const fromEmail = trackPk("collision-from");
    const toEmail = trackPk("collision-to");
    const registration = `COLLIDE${Date.now()}`;
    const { bike } = (await createBike(fromEmail, newBikeData({ registration }))) as { ok: true; bike: { id: string } };
    // The recipient already has their own separate record for the same physical bike.
    await createBike(toEmail, newBikeData({ registration }));

    expect(await transferBike(fromEmail, bike.id, toEmail, false)).toEqual({ ok: false, reason: "recipient_already_has_bike" });
  });

  it("copies an active bill series to the recipient when includeRecords is true, and ends the previous owner's own copy", async () => {
    const fromEmail = trackPk("billseries-transfer-from");
    const toEmail = trackPk("billseries-transfer-to");
    const { bike: oldBike } = (await createBike(fromEmail, newBikeData())) as { ok: true; bike: { id: string } };
    const series = await createBillSeries(fromEmail, {
      bikeId: oldBike.id,
      billType: "insurance",
      frequency: "monthly",
      startDate: "2026-01-01",
      collectionDay: 1,
      instalmentAmount: 45,
      instalmentCount: 12,
    });

    const result = await transferBike(fromEmail, oldBike.id, toEmail, true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const recipientSeries = await getBillSeriesForBike(toEmail, result.newBike.id);
    expect(recipientSeries).toHaveLength(1);
    expect(recipientSeries[0]).toMatchObject({ billType: "insurance", instalmentCount: 12, status: "active" });

    // The previous owner's own copy is ended, not left active against a
    // bike that's now read-only for them.
    const previousOwnerSeries = await getBillSeriesForBike(fromEmail, oldBike.id);
    expect(previousOwnerSeries).toHaveLength(1);
    expect(previousOwnerSeries[0].status).toBe("ended");
  });

  it("ends the previous owner's active bill series even when includeRecords is false, without copying it to the recipient", async () => {
    const fromEmail = trackPk("billseries-norecords-from");
    const toEmail = trackPk("billseries-norecords-to");
    const { bike: oldBike } = (await createBike(fromEmail, newBikeData())) as { ok: true; bike: { id: string } };
    await createBillSeries(fromEmail, {
      bikeId: oldBike.id,
      billType: "finance",
      frequency: "monthly",
      startDate: "2026-01-01",
      collectionDay: 1,
      instalmentAmount: 120,
      instalmentCount: 36,
    });

    const result = await transferBike(fromEmail, oldBike.id, toEmail, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await getBillSeriesForBike(toEmail, result.newBike.id)).toEqual([]);
    const previousOwnerSeries = await getBillSeriesForBike(fromEmail, oldBike.id);
    expect(previousOwnerSeries[0].status).toBe("ended");
  });
});
