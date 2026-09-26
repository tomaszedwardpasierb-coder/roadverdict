// Place at: src/lib/app/homeData.ts
//
// Read-side data for the Android app's Garage switcher, Home and
// Logbook screens. The web dashboard assembles the same numbers inside
// its server component (dashboard/page.tsx), which the app can't call -
// so this rebuilds them from the very same tracker functions, with the
// same rules: the same five categories count as spend and feed "recent",
// the same reminder status maths, and the same Premium gate on exact
// due dates. Amounts and distances go out preformatted in the vehicle's
// own currency and unit, so the app never has to re-implement the
// conversion.
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
import { getFines } from "@/lib/tracker/fine";
import { getTolls } from "@/lib/tracker/toll";
import { getReminders, computeReminderStatus, reminderDetailLabel } from "@/lib/tracker/reminder";
import { materializeAllDueForBike } from "@/lib/tracker/billSeries";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarMods } from "@/lib/tracker/carMod";
import { getCarBills } from "@/lib/tracker/carBill";
import { getCarLabour } from "@/lib/tracker/carLabour";
import { getCarFines } from "@/lib/tracker/carFine";
import { getCarTolls } from "@/lib/tracker/carToll";
import { getCarReminders } from "@/lib/tracker/carReminder";
import { computeCarReminderStatus, carReminderDetailLabel } from "@/lib/tracker/carReminderStatus";
import { materializeAllDueForCar } from "@/lib/tracker/carBillSeries";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { BILL_LABELS } from "@/lib/tracker/billTypes";
import { LABOUR_LABELS } from "@/lib/tracker/labourTypes";
import { FINE_LABELS } from "@/lib/tracker/fineTypes";
import { TOLL_LABELS } from "@/lib/tracker/tollTypes";
import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import { CAR_LABOUR_LABELS } from "@/lib/tracker/carLabourTypes";
import { CAR_FINE_LABELS } from "@/lib/tracker/carFineTypes";
import { CAR_TOLL_LABELS } from "@/lib/tracker/carTollTypes";
import { formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from "@/lib/tracker/currency";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import { convertMilesToDisplay, KM_PER_MILE, type DistanceUnit } from "@/lib/tracker/unitFormat";
import { getProStatus } from "@/lib/subscriptions";
import { gatherMileagePoints } from "@/lib/tracker/summary";
import { gatherCarMileagePoints } from "@/lib/tracker/carSummary";
import { estimateMileage } from "@/lib/tracker/mileageEstimate";

// What the app needs to enter new records the way the web's own forms
// do: every cost is stored in GBP and every distance in miles, so the
// app converts what the person typed exactly as LogFuelForm does -
// divide a cost by rateFromGbp, and a km reading by KM_PER_MILE.
export type VehicleUnits = {
  distanceUnit: DistanceUnit;
  currency: Currency;
  currencySymbol: string;
  rateFromGbp: number;
  kmPerMile: number;
  currentMileageDisplay: number;
};

export type GarageVehicle = {
  kind: VehicleKind;
  id: string;
  name: string;
  makeModel: string;
  registration: string | null;
  readOnly: boolean;
  // Cars only - decides whether a fill-up is litres or a kWh charge.
  fuelType: CarDoc["fuelType"] | null;
  units: VehicleUnits;
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

export type EntryCategory = "service" | "fuel" | "mods" | "bills" | "labour" | "fines" | "tolls";

// The five the web dashboard counts as spend and lists as recent
// activity - fines and tolls live in the logbook but, on the web too,
// stay out of those two totals.
const SPEND_CATEGORIES: ReadonlySet<EntryCategory> = new Set(["service", "fuel", "mods", "bills", "labour"]);

export const ENTRY_CATEGORIES: EntryCategory[] = ["fuel", "service", "mods", "bills", "labour", "fines", "tolls"];

export type LogEntry = {
  id: string;
  category: EntryCategory;
  type: string;
  description: string;
  date: string;
  costLabel: string;
  mileageLabel: string | null;
  // Set on entries the receipt scanner created that nobody has checked
  // yet - the web shows the same "check details" flag.
  needsReview: boolean;
  attachmentCount: number;
};

export type HomeData = {
  vehicle: GarageVehicle & { mileageLabel: string };
  isPro: boolean;
  dueSoon: HomeReminder[];
  reminderCounts: { overdue: number; dueSoon: number; ok: number };
  spend: { monthTotalLabel: string; yearTotalLabel: string; monthName: string; year: number };
  recent: LogEntry[];
};

export type LogbookData = {
  vehicle: GarageVehicle;
  entries: LogEntry[];
  counts: Record<EntryCategory, number>;
};

function vehicleName(v: { nickname?: string; make: string; model: string }): { name: string; makeModel: string } {
  const makeModel = `${v.make} ${v.model}`;
  return { name: v.nickname || makeModel, makeModel };
}

function vehicleUnits(v: { distanceUnit?: DistanceUnit; currency?: Currency; currentMileage: number }, rates: ExchangeRates | null): VehicleUnits {
  const distanceUnit = v.distanceUnit ?? "mi";
  const currency = v.currency ?? "GBP";
  // Same fallback as convertDisplayToGbp: GBP, or no rates loaded, means 1.
  const rate = currency !== "GBP" ? rates?.rates[currency] : undefined;
  return {
    distanceUnit,
    currency,
    currencySymbol: CURRENCY_SYMBOLS[currency],
    rateFromGbp: rate || 1,
    kmPerMile: KM_PER_MILE,
    currentMileageDisplay: Math.round(convertMilesToDisplay(v.currentMileage, distanceUnit)),
  };
}

function bikeSummary(bike: BikeDoc, rates: ExchangeRates | null): GarageVehicle {
  return {
    kind: "bike",
    id: bike.id,
    ...vehicleName(bike),
    registration: getCurrentRegistration(bike) ?? null,
    readOnly: isBikeReadOnly(bike),
    fuelType: null,
    units: vehicleUnits(bike, rates),
  };
}

function carSummary(car: CarDoc, rates: ExchangeRates | null): GarageVehicle {
  return {
    kind: "car",
    id: car.id,
    ...vehicleName(car),
    registration: getCarCurrentRegistration(car) ?? null,
    readOnly: isCarReadOnly(car),
    fuelType: car.fuelType,
    units: vehicleUnits(car, rates),
  };
}

export async function getGarage(email: string): Promise<{ vehicles: GarageVehicle[]; defaultVehicle: { kind: VehicleKind; id: string } | null }> {
  const [bikes, cars, rates] = await Promise.all([getBikesForUser(email), getCarsForUser(email), getExchangeRates()]);
  // Same choice the web dashboard would make for a first visit (no
  // cookies): the app only uses this until the person picks a vehicle
  // themselves, which it then remembers on the phone.
  const active = await resolveActiveVehicle(email, { bikes, cars });
  const defaultVehicle = active ? { kind: active.kind, id: active.kind === "bike" ? active.bike.id : active.car.id } : null;
  return { vehicles: [...bikes.map((b) => bikeSummary(b, rates)), ...cars.map((c) => carSummary(c, rates))], defaultVehicle };
}

function formatMileage(miles: number, unit: DistanceUnit): string {
  return `${Math.round(convertMilesToDisplay(miles, unit)).toLocaleString("en-GB")} ${unit === "km" ? "km" : "mi"}`;
}

type RawEntry = {
  id: string;
  category: EntryCategory;
  type: string;
  description: string;
  date: string;
  cost: number;
  mileage?: number;
  needsReview?: boolean;
  attachments?: unknown[];
};

type RawReminder = { id: string; name: string; status: ReminderStatus; detail: string; permanent: boolean };

type VehicleBundle = {
  summary: GarageVehicle;
  currentMileage: number;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
  entries: RawEntry[];
  loadReminders: () => Promise<RawReminder[]>;
};

// One place that knows how to turn a bike's or car's records into the
// app's entry shape, so Home and Logbook can't drift apart.
async function loadVehicle(email: string, kind: VehicleKind, id: string): Promise<VehicleBundle | null> {
  if (kind === "bike") {
    const bike = await getBike(email, id);
    if (!bike) return null;
    // Same lazy instalment write the web dashboard does before reading
    // bills - see dashboard/page.tsx.
    if (!isBikeReadOnly(bike)) await materializeAllDueForBike(email, bike.id);
    const [records, fuelLogs, mods, bills, labour, fines, tolls, rates] = await Promise.all([
      getServiceRecords(email, bike.id),
      getFuelLogs(email, bike.id),
      getMods(email, bike.id),
      getBills(email, bike.id),
      getLabour(email, bike.id),
      getFines(email, bike.id),
      getTolls(email, bike.id),
      getExchangeRates(),
    ]);
    return {
      summary: bikeSummary(bike, rates),
      currentMileage: bike.currentMileage,
      distanceUnit: bike.distanceUnit ?? "mi",
      currency: bike.currency ?? "GBP",
      rates,
      entries: [
        ...records.map((r) => ({ ...r, category: "service" as const, type: "Service", description: JOB_LABELS[r.jobType] ?? r.jobType })),
        ...fuelLogs.map((f) => ({ ...f, category: "fuel" as const, type: "Fuel", description: `${f.litres.toFixed(1)} L${f.filledToFull ? " (full)" : ""}` })),
        ...mods.map((m) => ({ ...m, category: "mods" as const, type: "Part", description: m.name })),
        ...bills.map((b) => ({ ...b, category: "bills" as const, type: "Bill", description: BILL_LABELS[b.billType] ?? b.billType })),
        ...labour.map((l) => ({ ...l, category: "labour" as const, type: "Labour", description: LABOUR_LABELS[l.category] ?? l.category })),
        ...fines.map((f) => ({ ...f, category: "fines" as const, type: "Fine", description: FINE_LABELS[f.fineType] ?? f.fineType })),
        ...tolls.map((t) => ({ ...t, category: "tolls" as const, type: "Toll", description: TOLL_LABELS[t.tollType] ?? t.tollType })),
      ],
      loadReminders: async () =>
        (await getReminders(email, bike.id)).map((r) => ({
          id: r.id,
          name: r.name,
          status: computeReminderStatus(r, bike.currentMileage),
          detail: reminderDetailLabel(r),
          permanent: r.intervalType === "permanent",
        })),
    };
  }

  const car = await getCarById(email, id);
  if (!car) return null;
  if (!isCarReadOnly(car)) await materializeAllDueForCar(email, car.id);
  const [records, fuelLogs, mods, bills, labour, fines, tolls, rates] = await Promise.all([
    getCarServiceRecords(email, car.id),
    getCarFuelLogs(email, car.id),
    getCarMods(email, car.id),
    getCarBills(email, car.id),
    getCarLabour(email, car.id),
    getCarFines(email, car.id),
    getCarTolls(email, car.id),
    getExchangeRates(),
  ]);
  return {
    summary: carSummary(car, rates),
    currentMileage: car.currentMileage,
    distanceUnit: car.distanceUnit ?? "mi",
    currency: car.currency ?? "GBP",
    rates,
    entries: [
      ...records.map((r) => ({ ...r, category: "service" as const, type: "Service", description: CAR_JOB_LABELS[r.jobType] ?? r.jobType })),
      ...fuelLogs.map((f) => ({
        ...f,
        category: "fuel" as const,
        type: "Fuel",
        description: f.fuelType === "electric" ? `${(f.kwh ?? 0).toFixed(1)} kWh` : `${(f.litres ?? 0).toFixed(1)} L${f.filledToFull ? " (full)" : ""}`,
      })),
      ...mods.map((m) => ({ ...m, category: "mods" as const, type: "Part", description: m.name })),
      ...bills.map((b) => ({ ...b, category: "bills" as const, type: "Bill", description: CAR_BILL_LABELS[b.billType] ?? b.billType })),
      ...labour.map((l) => ({ ...l, category: "labour" as const, type: "Labour", description: CAR_LABOUR_LABELS[l.category] ?? l.category })),
      ...fines.map((f) => ({ ...f, category: "fines" as const, type: "Fine", description: CAR_FINE_LABELS[f.fineType] ?? f.fineType })),
      ...tolls.map((t) => ({ ...t, category: "tolls" as const, type: "Toll", description: CAR_TOLL_LABELS[t.tollType] ?? t.tollType })),
    ],
    loadReminders: async () =>
      (await getCarReminders(email, car.id)).map((r) => ({
        id: r.id,
        name: r.name,
        status: computeCarReminderStatus(r, car.currentMileage),
        detail: carReminderDetailLabel(r),
        permanent: r.intervalType === "permanent",
      })),
  };
}

function newestFirst(a: { date: string }, b: { date: string }): number {
  return new Date(b.date).getTime() - new Date(a.date).getTime();
}

function toLogEntry(bundle: VehicleBundle, e: RawEntry): LogEntry {
  return {
    id: e.id,
    category: e.category,
    type: e.type,
    description: e.description,
    date: e.date,
    costLabel: formatCurrency(e.cost, bundle.currency, bundle.rates),
    mileageLabel: e.mileage != null ? formatMileage(e.mileage, bundle.distanceUnit) : null,
    needsReview: !!e.needsReview,
    attachmentCount: e.attachments?.length ?? 0,
  };
}

const STATUS_ORDER: Record<ReminderStatus, number> = { overdue: 0, "due-soon": 1, ok: 2 };
const RECENT_LIMIT = 5;

export async function getHomeData(email: string, kind: VehicleKind, id: string, now: Date = new Date()): Promise<HomeData | null> {
  const bundle = await loadVehicle(email, kind, id);
  if (!bundle) return null;
  const [reminders, pro] = await Promise.all([bundle.loadReminders(), getProStatus(email)]);

  const spendEntries = bundle.entries.filter((e) => SPEND_CATEGORIES.has(e.category));
  const sumWhere = (keep: (d: Date) => boolean) => spendEntries.filter((e) => keep(new Date(e.date))).reduce((s, e) => s + e.cost, 0);
  const monthTotal = sumWhere((d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth());
  const yearTotal = sumWhere((d) => d.getFullYear() === now.getFullYear());

  const counts = { overdue: 0, dueSoon: 0, ok: 0 };
  for (const r of reminders) {
    if (r.status === "overdue") counts.overdue++;
    else if (r.status === "due-soon") counts.dueSoon++;
    else counts.ok++;
  }

  return {
    vehicle: { ...bundle.summary, mileageLabel: formatMileage(bundle.currentMileage, bundle.distanceUnit) },
    isPro: pro.isPro,
    dueSoon: reminders
      .filter((r) => r.status !== "ok")
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
      .map((r) => ({ id: r.id, name: r.name, status: r.status, detail: r.permanent || pro.isPro ? r.detail || null : null })),
    reminderCounts: counts,
    spend: {
      monthTotalLabel: formatCurrency(monthTotal, bundle.currency, bundle.rates),
      yearTotalLabel: formatCurrency(yearTotal, bundle.currency, bundle.rates),
      monthName: now.toLocaleString("en-GB", { month: "long" }),
      year: now.getFullYear(),
    },
    recent: [...spendEntries].sort(newestFirst).slice(0, RECENT_LIMIT).map((e) => toLogEntry(bundle, e)),
  };
}

export async function getLogbook(email: string, kind: VehicleKind, id: string): Promise<LogbookData | null> {
  const bundle = await loadVehicle(email, kind, id);
  if (!bundle) return null;
  const counts = Object.fromEntries(ENTRY_CATEGORIES.map((c) => [c, 0])) as Record<EntryCategory, number>;
  for (const e of bundle.entries) counts[e.category]++;
  return {
    vehicle: bundle.summary,
    entries: [...bundle.entries].sort(newestFirst).map((e) => toLogEntry(bundle, e)),
    counts,
  };
}

export type MileageEstimate = {
  // In the vehicle's own unit, ready to pre-fill the form. null when
  // there isn't enough history near the date to suggest anything.
  mileageDisplay: number | null;
  note: string | null;
};

// The app's version of the web forms' useEstimatedMileage: the same
// estimateMileage maths over the same logged points, run here because
// that code lives with the web app. Read-only - unlike Home and Logbook
// it doesn't write due instalments first; a bill's mileage is optional
// anyway, and an estimate is only ever a suggestion the person checks.
export async function getMileageEstimate(email: string, kind: VehicleKind, id: string, date: string): Promise<MileageEstimate | null> {
  const vehicle = kind === "bike" ? await getBike(email, id) : await getCarById(email, id);
  if (!vehicle) return null;
  const unit: DistanceUnit = vehicle.distanceUnit ?? "mi";
  const display = (miles: number) => Math.round(convertMilesToDisplay(miles, unit));

  // Today (or later) needs no estimate - the current mileage is the
  // answer. Same rule, and the same reason, as useEstimatedMileage.
  if (date >= new Date().toISOString().slice(0, 10)) {
    return { mileageDisplay: display(vehicle.currentMileage), note: null };
  }

  const points =
    kind === "bike"
      ? gatherMileagePoints(
          ...(await Promise.all([getServiceRecords(email, id), getMods(email, id), getFuelLogs(email, id), getBills(email, id), getLabour(email, id)]))
        )
      : gatherCarMileagePoints(
          ...(await Promise.all([getCarServiceRecords(email, id), getCarMods(email, id), getCarFuelLogs(email, id), getCarBills(email, id), getCarLabour(email, id)]))
        );

  const result = estimateMileage(date, points, {
    startingMileage: vehicle.startingMileage,
    currentMileage: vehicle.currentMileage,
    dateAdded: vehicle.dateAdded,
  });
  if (result.requiresManualEntry) {
    return {
      mileageDisplay: null,
      note: result.warning ?? "Not enough logged history near this date to estimate mileage confidently - please enter it yourself.",
    };
  }
  const how = result.confidence === "interpolated" ? "interpolated between logged records" : `estimated from this ${kind}'s logged pace`;
  return {
    mileageDisplay: display(result.mileage),
    note: `Mileage ${how} for this date${result.warning ? ` - ${result.warning}` : ""}. Please check and adjust if needed.`,
  };
}

export type ReminderListItem = {
  id: string;
  name: string;
  status: ReminderStatus;
  // null when the exact due date/mileage is Premium-only for this account.
  detail: string | null;
  // A SORN reminder: clears itself once the vehicle is taxed again, so
  // it can't be marked done or deleted by hand (the API refuses both).
  permanent: boolean;
  // An exact-date reminder doesn't repeat - "done" clears it.
  oneOff: boolean;
};

export type ReminderList = { vehicle: GarageVehicle; isPro: boolean; reminders: ReminderListItem[] };

// The Reminders tab: every reminder for one vehicle, most urgent first,
// with the same status maths and Premium gate as the web's ReminderItem.
export async function getReminderList(email: string, kind: VehicleKind, id: string): Promise<ReminderList | null> {
  const [vehicle, rates, pro] = await Promise.all([
    kind === "bike" ? getBike(email, id) : getCarById(email, id),
    getExchangeRates(),
    getProStatus(email),
  ]);
  if (!vehicle) return null;

  const raw =
    kind === "bike"
      ? (await getReminders(email, id)).map((r) => ({ r, status: computeReminderStatus(r, vehicle.currentMileage), detail: reminderDetailLabel(r) }))
      : (await getCarReminders(email, id)).map((r) => ({ r, status: computeCarReminderStatus(r, vehicle.currentMileage), detail: carReminderDetailLabel(r) }));

  const reminders = raw
    .map(({ r, status, detail }) => {
      const permanent = r.intervalType === "permanent";
      return { id: r.id, name: r.name, status, detail: permanent || pro.isPro ? detail || null : null, permanent, oneOff: r.intervalType === "date" };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name));

  return {
    vehicle: kind === "bike" ? bikeSummary(vehicle as BikeDoc, rates) : carSummary(vehicle as CarDoc, rates),
    isPro: pro.isPro,
    reminders,
  };
}
