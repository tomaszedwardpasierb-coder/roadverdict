// Place at: src/lib/tracker/carTransfer.ts
//
// Car equivalent of bikeTransfer.ts - same mechanic (a new car document
// under the recipient's account, linked back to the old one via
// transferredFrom/transferredTo, old one marked read-only rather than
// deleted or mutated), just against CarDoc. Bill series (carBillSeries.ts)
// are handled exactly the same way bikeTransfer.ts handles its own: an
// active series is copied to the recipient when includeRecords is true
// (lastMaterializedIndex carries over unchanged, so future auto-
// materialized instalments keep numbering correctly), and the previous
// owner's own active series is always ended regardless of includeRecords,
// since their car is read-only from this point on either way.
//
// The recipient-limit check matches bikeTransfer.ts's own exactly - both
// check the recipient's COMBINED bike+car count against
// MAX_FREE_VEHICLES, the same cap car/bike creation actually respects
// everywhere else. createCar has no cap logic of its own at all (see
// POST /api/cars/car's own comment - the combined bike+car cap is only
// ever enforced at the route layer); createBike still keeps its own
// inner, bike-only safety net (MAX_FREE_BIKES) for a direct call, but
// that's unrelated to this check.
import { getContainer } from "@/lib/cosmos";
import { isPro } from "@/lib/subscriptions";
import { MAX_FREE_VEHICLES } from "@/lib/tracker/vehicleLimit";
import { getBikesForUser, countActiveBikes } from "@/lib/tracker/bike";
import { getCarById, getCarsForUser, generateCarId, countActiveCars, getCurrentRegistration, copyCarTrackerDoc, type CarDoc } from "@/lib/tracker/car";
import { normalizePlate } from "@/lib/tracker/reportAccess";
import { allKnownCarPlates } from "@/lib/tracker/carReportAccess";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarMods } from "@/lib/tracker/carMod";
import { getCarBills } from "@/lib/tracker/carBill";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarReminders } from "@/lib/tracker/carReminder";
import { getBillSeriesForCar, endCarBillSeries } from "@/lib/tracker/carBillSeries";
import { computeCarSellerReportRowsAndMetrics } from "@/lib/tracker/carSellerReportData";
import { computeSellerVerdict } from "@/lib/tracker/sellerReportVerdict";

export type TransferCarResult =
  | { ok: true; newCar: CarDoc }
  | { ok: false; reason: "car_not_found" }
  | { ok: false; reason: "already_transferred" }
  | { ok: false; reason: "same_owner" }
  | { ok: false; reason: "recipient_limit_reached"; limit: number }
  | { ok: false; reason: "recipient_already_has_car" };

export async function transferCar(
  fromEmail: string,
  carId: string,
  toEmail: string,
  includeRecords: boolean
): Promise<TransferCarResult> {
  if (fromEmail === toEmail) {
    return { ok: false, reason: "same_owner" };
  }

  const oldCar = await getCarById(fromEmail, carId);
  if (!oldCar) {
    return { ok: false, reason: "car_not_found" };
  }
  if (oldCar.transferredTo) {
    return { ok: false, reason: "already_transferred" };
  }

  const [recipientBikes, recipientCars] = await Promise.all([
    getBikesForUser(toEmail),
    getCarsForUser(toEmail),
  ]);

  // Same collision guard as transferBike's own - see that file's comment
  // for the full reasoning, including why this runs BEFORE the free-tier
  // cap check below (a recipient who already has this exact car isn't
  // asking for a genuinely new vehicle, so that's the more specific
  // answer even when they're also at their cap). Checked directly
  // against the recipient's own cars, not via findCarByRegistrationAcrossAccounts.
  const currentReg = getCurrentRegistration(oldCar);
  if (currentReg) {
    const normalizedCurrentReg = normalizePlate(currentReg);
    const recipientAlreadyHasThisCar = recipientCars.some((c) => allKnownCarPlates(c).includes(normalizedCurrentReg));
    if (recipientAlreadyHasThisCar) {
      return { ok: false, reason: "recipient_already_has_car" };
    }
  }

  if (!(await isPro(toEmail)) && countActiveBikes(recipientBikes) + countActiveCars(recipientCars) >= MAX_FREE_VEHICLES) {
    return { ok: false, reason: "recipient_limit_reached", limit: MAX_FREE_VEHICLES };
  }

  const [records, mods, bills, fuelLogs, reminders, billSeries] = await Promise.all([
    getCarServiceRecords(fromEmail, carId),
    getCarMods(fromEmail, carId),
    getCarBills(fromEmail, carId),
    getCarFuelLogs(fromEmail, carId),
    getCarReminders(fromEmail, carId),
    getBillSeriesForCar(fromEmail, carId),
  ]);
  const activeBillSeries = billSeries.filter((s) => s.status === "active");
  const { rows, total, verdictMetrics } = computeCarSellerReportRowsAndMetrics(oldCar, records, mods, bills, fuelLogs, reminders);
  const verdict = computeSellerVerdict(verdictMetrics);

  const transferredAt = new Date().toISOString();
  const newCarId = generateCarId(toEmail);

  const newCar: CarDoc = {
    id: newCarId,
    pk: toEmail,
    type: "car",
    make: oldCar.make,
    model: oldCar.model,
    fuelType: oldCar.fuelType,
    engineLitres: oldCar.engineLitres,
    batteryKwh: oldCar.batteryKwh,
    year: oldCar.year,
    isCustomBuild: oldCar.isCustomBuild,
    originalRegistration: oldCar.originalRegistration,
    registrationChanges: oldCar.registrationChanges,
    currentMileage: oldCar.currentMileage,
    startingMileage: oldCar.currentMileage,
    // Deliberately not carried over - see bikeTransfer.ts's own comment:
    // a nickname is the owner's own personalisation, not a fact about
    // the car.
    nickname: `${oldCar.make} ${oldCar.model}`,
    region: oldCar.region,
    // Preserved rather than reset to today, same reasoning as bikeTransfer.ts.
    dateAdded: oldCar.dateAdded,
    dvlaData: oldCar.dvlaData,
    transferredFrom: {
      previousCarId: oldCar.id,
      previousOwnerEmail: fromEmail,
      transferredAt,
      summaryAtTransfer: {
        totalEntries: rows.length,
        totalSpend: total,
        documentationVerdictLabel: verdict.label,
        mileageAtTransfer: oldCar.currentMileage,
      },
    },
  };

  oldCar.transferredTo = {
    newCarId,
    newOwnerEmail: toEmail,
    transferredAt,
  };

  const container = getContainer();
  // Old car written first deliberately - same reasoning as bikeTransfer.ts.
  await container.items.upsert(oldCar);
  await container.items.upsert(newCar);

  if (includeRecords) {
    // An active instalment plan continues under the new owner rather
    // than silently stopping - lastMaterializedIndex carries over
    // unchanged, so future auto-materialized instalments keep numbering
    // correctly from wherever the plan actually is (e.g. "6 of 12", not
    // restarting at 1). Same reasoning as bikeTransfer.ts's own handling.
    const copyResults = await Promise.allSettled([
      ...records.map((r) => copyCarTrackerDoc(r, "carService", toEmail, newCarId)),
      ...mods.map((m) => copyCarTrackerDoc(m, "carMod", toEmail, newCarId)),
      ...bills.map((b) => copyCarTrackerDoc(b, "carBill", toEmail, newCarId)),
      ...fuelLogs.map((f) => copyCarTrackerDoc(f, "carFuel", toEmail, newCarId)),
      ...reminders.map((rm) => copyCarTrackerDoc(rm, "carReminder", toEmail, newCarId, { notifiedAt: null })),
      ...activeBillSeries.map((s) => copyCarTrackerDoc(s, "carBillSeries", toEmail, newCarId)),
    ]);
    const failures = copyResults.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(`transferCar: ${failures.length} record(s) failed to copy for car ${newCarId}:`, failures);
    }
  }

  // Ends the previous owner's own active instalment plan(s) regardless
  // of includeRecords - the old car is read-only from this point on no
  // matter what, so a plan left "active" would otherwise keep
  // auto-materializing new instalment bills against a car its former
  // owner no longer has any real reason to be paying for. Same
  // reasoning as bikeTransfer.ts's own handling.
  if (activeBillSeries.length > 0) {
    const endResults = await Promise.allSettled(activeBillSeries.map((s) => endCarBillSeries(fromEmail, s.id)));
    const endFailures = endResults.filter((r) => r.status === "rejected");
    if (endFailures.length > 0) {
      console.error(`transferCar: ${endFailures.length} bill series failed to end for the previous owner of car ${carId}:`, endFailures);
    }
  }

  return { ok: true, newCar };
}
