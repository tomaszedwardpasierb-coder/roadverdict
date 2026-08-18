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
// Deliberately narrow for this phase: only bike-level facts move
// (identity, registration history, DVLA data, current mileage, and a
// frozen summary of what the previous owner's records added up to).
// The actual service/fuel/bill/mod records themselves stay under the
// previous owner's account - carrying those forward selectively is
// Phase 3, a deliberately separate and later step, not something this
// function does implicitly.
import { getContainer } from "@/lib/cosmos";
import { getBike, getBikesForUser, generateBikeId, MAX_FREE_BIKES, type BikeDoc } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getReminders } from "@/lib/tracker/reminder";
import { computeSellerReportRowsAndMetrics } from "@/lib/tracker/sellerReportData";
import { computeSellerVerdict } from "@/lib/tracker/sellerReportVerdict";

export type TransferBikeResult =
  | { ok: true; newBike: BikeDoc }
  | { ok: false; reason: "bike_not_found" }
  | { ok: false; reason: "already_transferred" }
  | { ok: false; reason: "same_owner" }
  | { ok: false; reason: "recipient_limit_reached"; limit: number };

export async function transferBike(fromEmail: string, bikeId: string, toEmail: string): Promise<TransferBikeResult> {
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
  const recipientBikes = await getBikesForUser(toEmail);
  if (recipientBikes.length >= MAX_FREE_BIKES) {
    return { ok: false, reason: "recipient_limit_reached", limit: MAX_FREE_BIKES };
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

  return { ok: true, newBike };
}
