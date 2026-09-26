// Place at: src/lib/app/homeData.ts
//
// Read-side data for the Android app's Garage switcher and Home screen.
// The web dashboard assembles the same numbers inside its server
// component (dashboard/page.tsx), which the app can't call - so this
// rebuilds them from the very same tracker functions, with the same
// rules: the same five categories count as spend, the same five feed
// "recent", the same reminder status maths, and the same Premium gate
// on exact due dates. Amounts and distances go out preformatted in the
// vehicle's own currency and unit, so the app never has to re-implement
// the conversion.
import { getBikesForUser, getBike, getCurrentRegistration, isBikeReadOnly, type BikeDoc } from "@/lib/tracker/bike";
import {
  getCarsForUser,
  getCarById,
  getCurrentRegistration as getCarCurrentRegistration,
  isCarReadOnly,
  type CarDoc,
} from "@/lib/tracker/car";
import { resolveActiveVehicle, type VehicleKind } from "@/lib/tracker/activeVehicle";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getLabour } from "@/lib/tracker/labour";
import { getReminders, computeReminderStatus, reminderDetailLabel } from "@/lib/tracker/reminder";
import { materializeAllDueForBike } from "@/lib/tracker/billSeries";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarMods } from "@/lib/tracker/carMod";
import { getCarBills } from "@/lib/tracker/carBill";
import { getCarLabour } from "@/lib/tracker/carLabour";
import { getCarReminders } from "@/lib/tracker/carReminder";
import { computeCarReminderStatus, carReminderDetailLabel } from "@/lib/tracker/carReminderStatus";
import { materializeAllDueForCar } from "@/lib/tracker/carBillSeries";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import { LABOUR_LABELS } from "@/lib/tracker/labourTypes";
import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import { CAR_LABOUR_LABELS } from "@/lib/tracker/carLabourTypes";
import { formatCurrency, type Currency, type ExchangeRates } from "@/lib/tracker/currency";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import { convertMilesToDisplay, type DistanceUnit } from "@/lib/tracker/unitFormat";
import { getProStatus } from "@/lib/subscriptions";

export type GarageVehicle = {
  kind: VehicleKind;
  id: string;
  name: string;
  makeModel: string;
  registration: string | null;
  readOnly: boolean;
};

export type ReminderStatus = "ok" | "due-soon" | "overdue";

export type HomeReminder = {
  id: string;
  name: string;
  status: ReminderStatus;
  // null when the exact due date/mileage is Premium-only for this
  // account - the app shows its own "Premium" hint in its place, the
  // same split the web's ReminderItem makes.
  detail: string | null;
};

export type RecentCategory = "service" | "fuel" | "mods" | "bills" | "labour";

export type HomeRecentItem = {
  id: string;
  category: RecentCategory;
  type: string;
  description: string;
  date: string;
  costLabel: string;
  mileageLabel: string | null;
};

export type HomeData = {
  vehicle: GarageVehicle & { mileageLabel: string };
  isPro: boolean;
  dueSoon: HomeReminder[];
  reminderCounts: { overdue: number; dueSoon: number; ok: number };
  spend: { monthTotalLabel: string; yearTotalLabel: string; monthName: string; year: number };
  recent: HomeRecentItem[];
};

function vehicleName(v: { nickname?: string; make: string; model: string }): { name: string; makeModel: string } {
  const makeModel = `${v.make} ${v.model}`;
  return { name: v.nickname || makeModel, makeModel };
}

function bikeSummary(bike: BikeDoc): GarageVehicle {
  return { kind: "bike", id: bike.id, ...vehicleName(bike), registration: getCurrentRegistration(bike) ?? null, readOnly: isBikeReadOnly(bike) };
}

function carSummary(car: CarDoc): GarageVehicle {
  return { kind: "car", id: car.id, ...vehicleName(car), registration: getCarCurrentRegistration(car) ?? null, readOnly: isCarReadOnly(car) };
}

export async function getGarage(email: string): Promise<{ vehicles: GarageVehicle[]; defaultVehicle: { kind: VehicleKind; id: string } | null }> {
  const [bikes, cars] = await Promise.all([getBikesForUser(email), getCarsForUser(email)]);
  // Same choice the web dashboard would make for a first visit (no
  // cookies): the app only uses this until the person picks a vehicle
  // themselves, which it then remembers on the phone.
  const active = await resolveActiveVehicle(email, { bikes, cars });
  const defaultVehicle = active ? { kind: active.kind, id: active.kind === "bike" ? active.bike.id : active.car.id } : null;
  return { vehicles: [...bikes.map(bikeSummary), ...cars.map(carSummary)], defaultVehicle };
}

type Costed = { id: string; date: string; cost: number };

function sumWhere(items: Costed[], keep: (d: Date) => boolean): number {
  return items.filter((i) => keep(new Date(i.date))).reduce((s, i) => s + i.cost, 0);
}

function formatMileage(miles: number, unit: DistanceUnit): string {
  return `${Math.round(convertMilesToDisplay(miles, unit)).toLocaleString("en-GB")} ${unit === "km" ? "km" : "mi"}`;
}

const STATUS_ORDER: Record<ReminderStatus, number> = { overdue: 0, "due-soon": 1, ok: 2 };
const RECENT_LIMIT = 5;

function buildHome(params: {
  vehicle: GarageVehicle;
  currentMileage: number;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
  isPro: boolean;
  reminders: { id: string; name: string; status: ReminderStatus; detail: string; permanent: boolean }[];
  spendItems: Costed[];
  recent: (Omit<HomeRecentItem, "costLabel" | "mileageLabel"> & { cost: number; mileage?: number })[];
  now: Date;
}): HomeData {
  const { now, currency, rates, distanceUnit } = params;
  const monthTotal = sumWhere(params.spendItems, (d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth());
  const yearTotal = sumWhere(params.spendItems, (d) => d.getFullYear() === now.getFullYear());

  const counts = { overdue: 0, dueSoon: 0, ok: 0 };
  for (const r of params.reminders) {
    if (r.status === "overdue") counts.overdue++;
    else if (r.status === "due-soon") counts.dueSoon++;
    else counts.ok++;
  }

  return {
    vehicle: { ...params.vehicle, mileageLabel: formatMileage(params.currentMileage, distanceUnit) },
    isPro: params.isPro,
    dueSoon: params.reminders
      .filter((r) => r.status !== "ok")
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      .map((r) => ({ id: r.id, name: r.name, status: r.status, detail: r.permanent || params.isPro ? r.detail || null : null })),
    reminderCounts: counts,
    spend: {
      monthTotalLabel: formatCurrency(monthTotal, currency, rates),
      yearTotalLabel: formatCurrency(yearTotal, currency, rates),
      monthName: now.toLocaleString("en-GB", { month: "long" }),
      year: now.getFullYear(),
    },
    recent: [...params.recent]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, RECENT_LIMIT)
      .map(({ cost, mileage, ...item }) => ({
        ...item,
        costLabel: formatCurrency(cost, currency, rates),
        mileageLabel: mileage != null ? formatMileage(mileage, distanceUnit) : null,
      })),
  };
}

export async function getHomeData(email: string, kind: VehicleKind, id: string, now: Date = new Date()): Promise<HomeData | null> {
  if (kind === "bike") {
    const bike = await getBike(email, id);
    if (!bike) return null;
    // Same lazy instalment write the web dashboard does before reading
    // bills - see dashboard/page.tsx.
    if (!isBikeReadOnly(bike)) await materializeAllDueForBike(email, bike.id);
    const [records, fuelLogs, mods, bills, labour, reminders, rates, pro] = await Promise.all([
      getServiceRecords(email, bike.id),
      getFuelLogs(email, bike.id),
      getMods(email, bike.id),
      getBills(email, bike.id),
      getLabour(email, bike.id),
      getReminders(email, bike.id),
      getExchangeRates(),
      getProStatus(email),
    ]);
    return buildHome({
      vehicle: bikeSummary(bike),
      currentMileage: bike.currentMileage,
      distanceUnit: bike.distanceUnit ?? "mi",
      currency: bike.currency ?? "GBP",
      rates,
      isPro: pro.isPro,
      now,
      reminders: reminders.map((r) => ({
        id: r.id,
        name: r.name,
        status: computeReminderStatus(r, bike.currentMileage),
        detail: reminderDetailLabel(r),
        permanent: r.intervalType === "permanent",
      })),
      spendItems: [...records, ...mods, ...fuelLogs, ...bills, ...labour],
      recent: [
        ...records.map((r) => ({ id: r.id, category: "service" as const, type: "Service", description: JOB_LABELS[r.jobType] ?? r.jobType, date: r.date, cost: r.cost, mileage: r.mileage })),
        ...fuelLogs.map((f) => ({ id: f.id, category: "fuel" as const, type: "Fuel", description: `${f.litres.toFixed(1)} L${f.filledToFull ? " (full)" : ""}`, date: f.date, cost: f.cost, mileage: f.mileage })),
        ...mods.map((m) => ({ id: m.id, category: "mods" as const, type: "Part", description: m.name, date: m.date, cost: m.cost, mileage: m.mileage })),
        ...bills.map((b) => ({ id: b.id, category: "bills" as const, type: "Bill", description: BILL_LABELS[b.billType] ?? b.billType, date: b.date, cost: b.cost })),
        ...labour.map((l) => ({ id: l.id, category: "labour" as const, type: "Labour", description: LABOUR_LABELS[l.category] ?? l.category, date: l.date, cost: l.cost, mileage: l.mileage })),
      ],
    });
  }

  const car = await getCarById(email, id);
  if (!car) return null;
  if (!isCarReadOnly(car)) await materializeAllDueForCar(email, car.id);
  const [records, fuelLogs, mods, bills, labour, reminders, rates, pro] = await Promise.all([
    getCarServiceRecords(email, car.id),
    getCarFuelLogs(email, car.id),
    getCarMods(email, car.id),
    getCarBills(email, car.id),
    getCarLabour(email, car.id),
    getCarReminders(email, car.id),
    getExchangeRates(),
    getProStatus(email),
  ]);
  return buildHome({
    vehicle: carSummary(car),
    currentMileage: car.currentMileage,
    distanceUnit: car.distanceUnit ?? "mi",
    currency: car.currency ?? "GBP",
    rates,
    isPro: pro.isPro,
    now,
    reminders: reminders.map((r) => ({
      id: r.id,
      name: r.name,
      status: computeCarReminderStatus(r, car.currentMileage),
      detail: carReminderDetailLabel(r),
      permanent: r.intervalType === "permanent",
    })),
    spendItems: [...records, ...mods, ...fuelLogs, ...bills, ...labour],
    recent: [
      ...records.map((r) => ({ id: r.id, category: "service" as const, type: "Service", description: CAR_JOB_LABELS[r.jobType] ?? r.jobType, date: r.date, cost: r.cost, mileage: r.mileage })),
      ...fuelLogs.map((f) => ({
        id: f.id,
        category: "fuel" as const,
        type: "Fuel",
        description: f.fuelType === "electric" ? `${(f.kwh ?? 0).toFixed(1)} kWh` : `${(f.litres ?? 0).toFixed(1)} L${f.filledToFull ? " (full)" : ""}`,
        date: f.date,
        cost: f.cost,
        mileage: f.mileage,
      })),
      ...mods.map((m) => ({ id: m.id, category: "mods" as const, type: "Part", description: m.name, date: m.date, cost: m.cost, mileage: m.mileage })),
      ...bills.map((b) => ({ id: b.id, category: "bills" as const, type: "Bill", description: CAR_BILL_LABELS[b.billType] ?? b.billType, date: b.date, cost: b.cost })),
      ...labour.map((l) => ({ id: l.id, category: "labour" as const, type: "Labour", description: CAR_LABOUR_LABELS[l.category] ?? l.category, date: l.date, cost: l.cost, mileage: l.mileage })),
    ],
  });
}
