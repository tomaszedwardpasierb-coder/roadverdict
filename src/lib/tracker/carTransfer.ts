// Place at: src/lib/tracker/carTransfer.ts
//
// Car equivalent of bikeTransfer.ts - same mechanic (a new car document
// under the recipient's account, linked back to the old one via
// transferredFrom/transferredTo, old one marked read-only rather than
// deleted or mutated), just against CarDoc. No billSeries handling here
// at all - recurring bill series (billSeries.ts) has no car equivalent
// yet (see the parity backlog's item 8), so there's nothing to copy or
// end on transfer.
//
// The recipient-limit check deliberately differs from bikeTransfer.ts's
// own (which checks only countActiveBikes against the old bike-only
// MAX_FREE_BIKES): createCar has no cap logic of its own at all (see
// POST /api/cars/car's own comment - the combined bike+car cap is only
// ever enforced at the route layer), so this checks the recipient's
// COMBINED bike+car count against MAX_FREE_VEHICLES instead, the same
// cap car creation actually respects everywhere else.
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
  if (!(await isPro(toEmail)) && countActiveBikes(recipientBikes) + countActiveCars(recipientCars) >= MAX_FREE_VEHICLES) {
    return { ok: false, reason: "recipient_limit_reached", limit: MAX_FREE_VEHICLES };
  }

  // Same collision guard as transferBike's own - see that file's
  // comment for the full reasoning. Checked directly against the
  // recipient's own cars, not via findCarByRegistrationAcrossAccounts.
  const currentReg = getCurrentRegistration(oldCar);
  if (currentReg) {
    const normalizedCurrentReg = normalizePlate(currentReg);
    const recipientAlreadyHasThisCar = recipientCars.some((c) => allKnownCarPlates(c).includes(normalizedCurrentReg));
    if (recipientAlreadyHasThisCar) {
      return { ok: false, reason: "recipient_already_has_car" };
    }
  }

  const [records, mods, bills, fuelLogs, reminders] = await Promise.all([
    getCarServiceRecords(fromEmail, carId),
    getCarMods(fromEmail, carId),
    getCarBills(fromEmail, carId),
    getCarFuelLogs(fromEmail, carId),
    getCarReminders(fromEmail, carId),
  ]);
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
    const copyResults = await Promise.allSettled([
      ...records.map((r) => copyCarTrackerDoc(r, "carService", toEmail, newCarId)),
      ...mods.map((m) => copyCarTrackerDoc(m, "carMod", toEmail, newCarId)),
      ...bills.map((b) => copyCarTrackerDoc(b, "carBill", toEmail, newCarId)),
      ...fuelLogs.map((f) => copyCarTrackerDoc(f, "carFuel", toEmail, newCarId)),
      ...reminders.map((rm) => copyCarTrackerDoc(rm, "carReminder", toEmail, newCarId, { notifiedAt: null })),
    ]);
    const failures = copyResults.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      console.error(`transferCar: ${failures.length} record(s) failed to copy for car ${newCarId}:`, failures);
    }
  }

  return { ok: true, newCar };
}
