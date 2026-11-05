// Place at: src/lib/mot/motReminders.ts
//
// "Email me before this MOT is due" on the free MOT check (4 Nov 2026):
// anyone who checks a vehicle can leave an email address - no account -
// and get one email 4 weeks before each MOT runs out, with what that
// vehicle's last test flagged, what those repairs typically cost, and
// what to check before the test.
//
// Double opt-in: nothing is sent until the address's owner opens the link
// in the confirmation email, and an unconfirmed request deletes itself
// after 7 days. One document per address and registration (its id is a
// hash of the two), so asking twice just refreshes the request. Only a
// hash of the confirmation link's secret is stored, like sign-in links.
// The unsubscribe secret is kept as it is, because the daily run has to
// put it in every reminder - it can only stop the reminders, and anyone
// able to read the database could delete them anyway.
//
// The yearly cycle (processMotReminders, run daily from check-reminders):
// the reminder goes 4 weeks before the due date, after a fresh look at
// the record in case the vehicle was tested early. From a week after the
// due date the record is looked at once a week until the new MOT shows
// up, and the next reminder is set for that one. A vehicle whose MOT
// still hasn't been renewed 4 months on (sold, scrapped, off the road)
// is dropped, address and all.
import { getContainer } from "@/lib/cosmos";
import { generateToken, hashToken } from "@/lib/auth/crypto";
import { recordFunnelStep } from "@/lib/analytics/funnel";
import { runInBatches } from "@/lib/concurrency";
import { sendMotReminderConfirmEmail, sendMotReminderEmail, type MotReminderItem } from "@/lib/resend";
import { cachedMotLookup, freshMotLookup, type MotLookupResult } from "./motCheckLookup";
import { bumpDailyCounter, takeNewLookup } from "./motCheckUsage";
import { cleanRegistration, type MotRecord, type MotVehicleKind } from "./motRecord";
import { CATEGORIES, SEVERITY, explainDefect } from "./motDefects";

const PK = "motReminder";
const DAY_MS = 86_400_000;

export const REMIND_DAYS_BEFORE = 28;
const PENDING_TTL_SECONDS = 7 * 24 * 60 * 60;
const RECHECK_FROM_DAYS_AFTER_DUE = 7;
const RECHECK_EVERY_DAYS = 7;
const DROP_AFTER_DAYS_PAST_DUE = 120;
// The most things a reminder lists from the last test.
const MAX_ITEMS = 8;

// Daily ceilings on sign-up requests, so the form can't be used to send
// confirmation emails to someone over and over.
export const MOT_REMINDER_LIMITS = { perVisitor: 10, perAddress: 3, siteWide: 300 };

export interface MotReminderDoc {
  id: string;
  pk: typeof PK;
  type: "motReminder";
  email: string;
  registration: string;
  kind: MotVehicleKind | null;
  vehicleName: string;
  // When the MOT this reminder is for runs out.
  motDueDate: string;
  status: "pending" | "confirmed";
  confirmHash: string | null;
  unsubscribeToken: string;
  createdAt: string;
  confirmedAt?: string;
  // The due date the last reminder was sent for.
  remindedFor?: string;
  // The last weekly look for a renewed MOT, after the due date.
  lastCheckedAt?: string;
  // Only on an unconfirmed request: Cosmos deletes it after 7 days.
  ttl?: number;
}

// The id without its prefix travels in the links (?r=).
function docKey(email: string, registration: string): string {
  return hashToken(`${email}|${registration}`).slice(0, 40);
}

function docId(key: string): string {
  return `motReminder::${key}`;
}

function keyOf(doc: Pick<MotReminderDoc, "id">): string {
  return doc.id.slice("motReminder::".length);
}

export function normaliseReminderEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

export function vehicleNameOf(record: Pick<MotRecord, "make" | "model" | "registration">): string {
  return [titleCase(record.make), record.model.toUpperCase()].filter(Boolean).join(" ") || record.registration;
}

export function reminderDate(motDueDate: string): Date {
  return new Date(Date.parse(motDueDate) - REMIND_DAYS_BEFORE * DAY_MS);
}

async function readDoc(key: string): Promise<MotReminderDoc | null> {
  if (!/^[0-9a-f]{40}$/.test(key)) return null;
  try {
    const { resource } = await getContainer().item(docId(key), PK).read<MotReminderDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export type MotReminderRequestResult =
  | { status: "sent"; motDueDate: string }
  | { status: "already"; motDueDate: string }
  | { status: "invalid_email" }
  | { status: "invalid_registration" }
  | { status: "no_due_date" }
  | { status: "limit" }
  | { status: "unavailable" };

// The record behind a sign-up: the one the visitor has just been shown
// comes from today's cache; a fresh lookup only if it has gone.
async function recordForSignUp(registration: string): Promise<MotLookupResult> {
  const cached = await cachedMotLookup(registration);
  if (cached) return cached;
  if ((await takeNewLookup()) !== "ok") return { status: "unavailable" };
  return freshMotLookup(registration);
}

export async function requestMotReminder(input: {
  email: unknown;
  registration: unknown;
  ip: string;
  appUrl: string;
  now?: Date;
}): Promise<MotReminderRequestResult> {
  const now = input.now ?? new Date();
  const email = normaliseReminderEmail(input.email);
  if (!email) return { status: "invalid_email" };
  const registration = cleanRegistration(typeof input.registration === "string" ? input.registration : null);
  if (!registration) return { status: "invalid_registration" };

  if ((await bumpDailyCounter(`mot-reminder::ip::${hashToken(input.ip)}`)) > MOT_REMINDER_LIMITS.perVisitor) return { status: "limit" };
  if ((await bumpDailyCounter(`mot-reminder::to::${hashToken(email)}`)) > MOT_REMINDER_LIMITS.perAddress) return { status: "limit" };
  if ((await bumpDailyCounter("mot-reminder::site")) > MOT_REMINDER_LIMITS.siteWide) return { status: "limit" };

  const lookup = await recordForSignUp(registration);
  if (lookup.status === "unavailable") return { status: "unavailable" };
  if (lookup.status === "not_found") return { status: "no_due_date" };
  const record = lookup.record;
  if (!record.motDueDate || Date.parse(record.motDueDate) <= now.getTime()) return { status: "no_due_date" };

  const key = docKey(email, registration);
  const existing = await readDoc(key);
  if (existing?.status === "confirmed") return { status: "already", motDueDate: existing.motDueDate };

  const confirm = generateToken();
  const doc: MotReminderDoc = {
    id: docId(key),
    pk: PK,
    type: "motReminder",
    email,
    registration,
    kind: record.kind,
    vehicleName: vehicleNameOf(record),
    motDueDate: record.motDueDate,
    status: "pending",
    confirmHash: confirm.hash,
    unsubscribeToken: existing?.unsubscribeToken ?? generateToken().raw,
    createdAt: now.toISOString(),
    ttl: PENDING_TTL_SECONDS,
  };
  await getContainer().items.upsert(doc);
  const remindOn = reminderDate(doc.motDueDate);
  await sendMotReminderConfirmEmail({
    email,
    registration,
    vehicleName: doc.vehicleName,
    motDueDate: doc.motDueDate,
    // null: due in under 4 weeks, so the next morning's run sends it.
    remindOn: remindOn.getTime() > now.getTime() ? remindOn.toISOString() : null,
    confirmUrl: `${input.appUrl}/api/mot-reminder/confirm?r=${key}&t=${confirm.raw}`,
  });
  void recordFunnelStep("mot_reminder_requested");
  return { status: "sent", motDueDate: doc.motDueDate };
}

export type MotReminderLinkResult = { ok: true; registration: string; motDueDate: string } | { ok: false };

export async function confirmMotReminder(key: string, token: string, now = new Date()): Promise<MotReminderLinkResult> {
  const doc = await readDoc(key);
  if (!doc) return { ok: false };
  if (doc.status === "confirmed") return { ok: true, registration: doc.registration, motDueDate: doc.motDueDate };
  if (!doc.confirmHash || hashToken(token) !== doc.confirmHash) return { ok: false };
  const confirmed: MotReminderDoc = { ...doc, status: "confirmed", confirmHash: null, confirmedAt: now.toISOString() };
  // Without its ttl the document stays until unsubscribed or dropped.
  delete confirmed.ttl;
  await getContainer().item(doc.id, PK).replace(confirmed);
  void recordFunnelStep("mot_reminder_confirmed");
  return { ok: true, registration: doc.registration, motDueDate: doc.motDueDate };
}

// For the unsubscribe page: which vehicle the link is for, before the
// visitor presses the button.
export async function findMotReminderForUnsubscribe(key: string, token: string): Promise<MotReminderLinkResult> {
  const doc = await readDoc(key);
  if (!doc || token !== doc.unsubscribeToken) return { ok: false };
  return { ok: true, registration: doc.registration, motDueDate: doc.motDueDate };
}

// Deletes the reminder. A link that no longer matches anything is treated
// as done, since the outcome the visitor wants is already true.
export async function unsubscribeMotReminder(key: string, token: string): Promise<boolean> {
  const doc = await readDoc(key);
  if (!doc) return true;
  if (token !== doc.unsubscribeToken) return false;
  try {
    await getContainer().item(doc.id, PK).delete();
  } catch (err) {
    if ((err as { code?: number }).code !== 404) throw err;
  }
  return true;
}

// What the reminder lists: everything recorded at the latest test, each
// explained, with a typical cost where the price tables cover the job.
export function itemsFromLastTest(record: MotRecord, appUrl: string): { testDate: string | null; items: MotReminderItem[] } {
  const last = record.tests[0];
  if (!last) return { testDate: null, items: [] };
  const items = last.defects.slice(0, MAX_ITEMS).map((d): MotReminderItem => {
    const e = explainDefect(d, record.kind);
    return {
      label: SEVERITY[e.severity].label,
      text: d.text,
      area: CATEGORIES[e.category].name,
      costLine: e.cost?.line ?? null,
      quoteUrl: e.cost ? `${appUrl}${e.cost.quoteHref}` : null,
    };
  });
  return { testDate: last.date, items };
}

function linksFor(doc: MotReminderDoc, appUrl: string) {
  const key = keyOf(doc);
  return {
    unsubscribeUrl: `${appUrl}/mot-check/reminder?unsubscribe=${key}&t=${doc.unsubscribeToken}`,
    oneClickUnsubscribeUrl: `${appUrl}/api/mot-reminder/unsubscribe?r=${key}&t=${doc.unsubscribeToken}`,
    saveUrl: `${appUrl}/login?redirect=${encodeURIComponent(`/dashboard?addVehicle=${doc.kind ?? "car"}&vrm=${doc.registration}`)}&src=email`,
  };
}

// The daily run looks a vehicle up like a visitor would, minus the
// visitor's own limit: today's cached record if there is one.
async function lookupForRun(registration: string): Promise<MotLookupResult> {
  return (await cachedMotLookup(registration)) ?? freshMotLookup(registration);
}

type RunOutcome = "sent" | "rolled" | "dropped" | "waiting" | "failed";

async function remove(doc: MotReminderDoc): Promise<"dropped"> {
  await getContainer().item(doc.id, PK).delete();
  return "dropped";
}

async function save(doc: MotReminderDoc): Promise<void> {
  await getContainer().item(doc.id, PK).replace(doc);
}

export async function processOneMotReminder(doc: MotReminderDoc, now: Date, appUrl: string): Promise<RunOutcome> {
  try {
    const t = now.getTime();
    const due = Date.parse(doc.motDueDate);

    if (doc.remindedFor !== doc.motDueDate && t >= reminderDate(doc.motDueDate).getTime() && t < due) {
      const lookup = await lookupForRun(doc.registration);
      if (lookup.status === "unavailable") return "failed";
      if (lookup.status === "not_found") return remove(doc);
      const record = lookup.record;
      // Tested early: the new date replaces the old one, and the reminder
      // waits for that.
      if (record.motDueDate && Date.parse(record.motDueDate) > due) {
        await save({ ...doc, motDueDate: record.motDueDate, lastCheckedAt: undefined });
        return "rolled";
      }
      const { testDate, items } = itemsFromLastTest(record, appUrl);
      await sendMotReminderEmail({
        email: doc.email,
        registration: doc.registration,
        vehicleName: doc.vehicleName,
        kind: doc.kind,
        motDueDate: doc.motDueDate,
        lastTestDate: testDate,
        items,
        ...linksFor(doc, appUrl),
      });
      await save({ ...doc, remindedFor: doc.motDueDate });
      return "sent";
    }

    if (t >= due + RECHECK_FROM_DAYS_AFTER_DUE * DAY_MS) {
      if (t >= due + DROP_AFTER_DAYS_PAST_DUE * DAY_MS) return remove(doc);
      if (doc.lastCheckedAt && t - Date.parse(doc.lastCheckedAt) < RECHECK_EVERY_DAYS * DAY_MS) return "waiting";
      const lookup = await lookupForRun(doc.registration);
      if (lookup.status === "unavailable") return "failed";
      if (lookup.status === "not_found") return remove(doc);
      const newDue = lookup.record.motDueDate;
      if (newDue && Date.parse(newDue) > due) {
        await save({ ...doc, motDueDate: newDue, lastCheckedAt: undefined });
        return "rolled";
      }
      await save({ ...doc, lastCheckedAt: now.toISOString() });
      return "waiting";
    }

    return "waiting";
  } catch (err) {
    console.error(`MOT reminder ${doc.id} failed:`, err);
    return "failed";
  }
}

export async function processMotReminders(now = new Date()): Promise<{ sent: number; rolled: number; dropped: number; failed: number }> {
  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const { resources } = await getContainer()
    .items.query<MotReminderDoc>(
      { query: "SELECT * FROM c WHERE c.type = 'motReminder' AND c.status = 'confirmed'" },
      { partitionKey: PK }
    )
    .fetchAll();
  const outcomes = await runInBatches(resources, 10, (doc) => processOneMotReminder(doc, now, appUrl));
  const totals = { sent: 0, rolled: 0, dropped: 0, failed: 0 };
  for (const o of outcomes) {
    if (o.status === "rejected") totals.failed++;
    else if (o.value !== "waiting") totals[o.value]++;
  }
  return totals;
}
