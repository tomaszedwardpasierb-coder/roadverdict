// Place at: src/lib/tracker/bikeTransfer.ts
//
// Phase 1 of the digital passport plan: prove the transfer mechanic
// works before any UI exists for it. Bikes are partitioned by owner
// email in Cosmos - a document can't move to a different partition in
// place - so "transferring ownership" here means creating a new bike
// document under the recipient's account, linked back to the old one,
// and marking the old one read-only/historical rather than deleting or
// mutating it. See transferredFrom/transferredTo on BikeDoc.
//
// Bike-level facts (identity, registration history, DVLA data, current
// mileage) always move, along with a frozen summary of what the
// previous owner's records added up to at the moment of transfer.
// Whether the individual service/fuel/bill/mod/reminder records
// themselves also move is the caller's choice via includeRecords -
// the current owner decides this, since it's their own logged history
// being handed over, not an automatic consequence of the bike itself
// changing hands. Attachments (receipt/invoice images) travel with
// whichever records copy, since blob storage isn't owner-scoped.
import { getContainer } from "@/lib/cosmos";
import { isPro } from "@/lib/subscriptions";
import { getBike, getBikesForUser, generateBikeId, countActiveBikes, getCurrentRegistration, MAX_FREE_BIKES, type BikeDoc } from "@/lib/tracker/bike";
import { normalizePlate, allKnownPlates } from "@/lib/tracker/reportAccess";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getReminders } from "@/lib/tracker/reminder";
import { copyTrackerDoc } from "@/lib/tracker/cosmosHelpers";
import { computeSellerReportRowsAndMetrics } from "@/lib/tracker/sellerReportData";
import { computeSellerVerdict } from "@/lib/tracker/sellerReportVerdict";

export type TransferBikeResult =
  | { ok: true; newBike: BikeDoc }
  | { ok: false; reason: "bike_not_found" }
  | { ok: false; reason: "already_transferred" }
  | { ok: false; reason: "same_owner" }
  | { ok: false; reason: "recipient_limit_reached"; limit: number }
  | { ok: false; reason: "recipient_already_has_bike" };

export async function transferBike(
  fromEmail: string,
  bikeId: string,
  toEmail: string,
  includeRecords: boolean
): Promise<TransferBikeResult> {
  if (fromEmail === toEmail) {
    return { ok: false, reason: "same_owner" };
  }

  const oldBike = await getBike(fromEmail, bikeId);
  if (!oldBike) {
    return { ok: false, reason: "bike_not_found" };
  }
  if (oldBike.transferredTo) {
    return { ok: false, reason: "already_transferred" };
  }

  // Same limit createBike() enforces - a transfer shouldn't be a way
  // to bypass the free-bike cap that adding a bike normally respects.
  // Counted the same way as everywhere else - a read-only bike the
  // recipient already has doesn't cost them an active slot, so it
  // shouldn't block them from accepting a genuinely new one either.
  const recipientBikes = await getBikesForUser(toEmail);
  if (!(await isPro(toEmail)) && countActiveBikes(recipientBikes) >= MAX_FREE_BIKES) {
    return { ok: false, reason: "recipient_limit_reached", limit: MAX_FREE_BIKES };
  }

  // Guards against a specific collision: the recipient may have already
  // clicked "Start fresh" on the add-bike flow for this exact
  // registration, rather than waiting for this same offer or request to
  // be approved (or requested ownership through one path while adding
  // the bike manually through another). transferBike() always creates
  // a brand new bike document, with no awareness on its own of whether
  // the recipient already has a separate, active record for the same
  // physical bike - silently creating a second one here would leave
  // them with two disconnected histories for the same bike, one just
  // appearing with no explanation, genuinely hard to untangle after the
  // fact. This is detected and blocked, not silently resolved: the
  // person needs to sort out which record should actually continue
  // (most likely by deleting the fresh one) before the transfer can go
  // through, rather than the system guessing which one should win.
  //
  // Checked directly against the recipient's own bikes (recipientBikes,
  // already fetched above), not via findBikeByRegistrationAcrossAccounts
  // - that function returns a single best-effort cross-account match
  // with no way to exclude the bike actually being transferred, so a
  // real cross-partition scan could return oldBike's own trivial
  // self-match instead of the recipient's, silently letting a genuine
  // collision through depending on scan order.
  const currentReg = getCurrentRegistration(oldBike);
  if (currentReg) {
    const normalizedCurrentReg = normalizePlate(currentReg);
    const recipientAlreadyHasThisBike = recipientBikes.some((b) => allKnownPlates(b).includes(normalizedCurrentReg));
    if (recipientAlreadyHasThisBike) {
      return { ok: false, reason: "recipient_already_has_bike" };
    }
  }

  // Same metrics/verdict logic the buyer report and Story So Far are
  // judged by, reused here so the frozen summary means the same thing
  // everywhere it appears rather than being computed a third, slightly
  // different way.
  const [records, mods, bills, fuelLogs, reminders] = await Promise.all([
    getServiceRecords(fromEmail, bikeId),
    getMods(fromEmail, bikeId),
    getBills(fromEmail, bikeId),
    getFuelLogs(fromEmail, bikeId),
    getReminders(fromEmail, bikeId),
  ]);
  const { rows, total, verdictMetrics } = computeSellerReportRowsAndMetrics(oldBike, records, mods, bills, fuelLogs, reminders);
  const verdict = computeSellerVerdict(verdictMetrics);

  const transferredAt = new Date().toISOString();
  const newBikeId = generateBikeId(toEmail);

  const newBike: BikeDoc = {
    id: newBikeId,
    pk: toEmail,
    type: "bike",
    make: oldBike.make,
    model: oldBike.model,
    engineCC: oldBike.engineCC,
    bikeClass: oldBike.bikeClass,
    year: oldBike.year,
    isCustomBuild: oldBike.isCustomBuild,
    originalRegistration: oldBike.originalRegistration,
    registrationChanges: oldBike.registrationChanges,
    currentMileage: oldBike.currentMileage,
    startingMileage: oldBike.currentMileage,
    // Deliberately not carried over - a nickname is the owner's own
    // personalisation, not a fact about the bike, so the new owner
    // starts with a plain default rather than inheriting someone
    // else's name for it.
    nickname: `${oldBike.make} ${oldBike.model}`,
    region: oldBike.region,
    // Preserved rather than reset to today - "this motorcycle has been
    // tracked on RoadVerdict since X" should survive a change of
    // account, even though the account itself is new.
    dateAdded: oldBike.dateAdded,
    dvlaData: oldBike.dvlaData,
    transferredFrom: {
      previousBikeId: oldBike.id,
      previousOwnerEmail: fromEmail,
      transferredAt,
      summaryAtTransfer: {
        totalEntries: rows.length,
        totalSpend: total,
        documentationVerdictLabel: verdict.label,
        mileageAtTransfer: oldBike.currentMileage,
      },
    },
  };

  oldBike.transferredTo = {
    newBikeId,
    newOwnerEmail: toEmail,
    transferredAt,
  };

  const container = getContainer();
  // Old bike written first deliberately - if this succeeds but the new
  // bike write fails, the old bike is locked with nothing to show for
  // it (bad, but recoverable by an admin retry, and not user-visible
  // since there's no UI to this yet). The other order would risk a
  // brand new bike existing while the old one still looks transferable,
  // which is the worse of the two failure shapes to leave behind.
  await container.items.upsert(oldBike);
  await container.items.upsert(newBike);

  if (includeRecords) {
    // Best-effort from here - the bike transfer itself already
    // succeeded and is the part that actually matters. A record that
    // fails to copy is a real problem worth logging, but not one that
    // should make this function report failure after the ownership
    // change has already been committed.
    const copyResults = await Promise.allSettled([
      ...records.map((r) => copyTrackerDoc(r, "service", toEmail, newBikeId)),
      ...mods.map((m) => copyTrackerDoc(m, "mod", toEmail, newBikeId)),
      ...bills.map((b) => copyTrackerDoc(b, "bill", toEmail, newBikeId)),
      ...fuelLogs.map((f) => copyTrackerDoc(f, "fuel", toEmail, newBikeId)),
      // notifiedAt reset to null - the new owner hasn't been notified
      // about anything yet, regardless of whether the previous owner
      // already was before the sale.
      ...reminders.map((rm) => copyTrackerDoc(rm, "reminder", toEmail, newBikeId, { notifiedAt: null })),
    ]);
    const failures = copyResults.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(`transferBike: ${failures.length} record(s) failed to copy for bike ${newBikeId}:`, failures);
    }
  }

  return { ok: true, newBike };
}
