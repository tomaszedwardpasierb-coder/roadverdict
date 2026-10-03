// Place at: src/lib/analytics/funnel.ts
//
// The sign-up funnel: how many people reach each step, per day, so we can
// see where visitors drop out - home page -> sign-in page -> link emailed ->
// signed in -> new account -> first vehicle. Two shorter funnels share the
// same counters: Pro (Pro page viewed -> checkout started; what happens
// after that is read from Stripe itself, see payments/proStats.ts) and
// shared reports (link shared -> report viewed -> a buyer signs up, counted
// as the sign-up steps with source "report"). Cloudflare Web Analytics only
// counts page views, which can't show any of the steps after the sign-in
// page.
//
// Anonymous totals only, like Cloudflare: one counter document per day,
// no cookies, nothing stored on the visitor's device, and no email, IP
// address or account id kept anywhere. A step's source (where the visit
// came from - Facebook, YouTube, Google...) travels from page to page in
// the sign-in link's own address (?src=), never in storage.
//
// Recording never throws and is never awaited by anything a visitor waits
// on beyond a single quick write - an analytics failure must never break
// signing in or adding a vehicle.
import { getContainer } from "@/lib/cosmos";
import type { FunnelSource } from "@/lib/analytics/funnelSource";

export { FUNNEL_SOURCES, toFunnelSource, classifySource, isInAppBrowser, isLikelyBot, type FunnelSource } from "@/lib/analytics/funnelSource";

export const FUNNEL_STEPS = [
  "home",
  "login",
  "link_requested",
  "signed_in",
  "account_created",
  "vehicle_added",
  "first_vehicle",
  // Page steps, like home and login: /pro, and a shared report page.
  "pro",
  "report",
  // Server steps.
  "checkout_started",
  "report_shared",
  // The sample-bike demo (/demo): the page itself, then the two things a
  // visitor can try - reading a receipt, asking a question. Sign-ups from
  // it are counted as the sign-up steps with source "demo".
  "demo",
  "demo_scanned",
  "demo_asked",
] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export function isFunnelStep(v: unknown): v is FunnelStep {
  return typeof v === "string" && (FUNNEL_STEPS as readonly string[]).includes(v);
}

const PK = "funnel";

type FunnelDayDoc = { id: string; pk: string; type: "funnelDay"; day: string; counts: Record<string, number> };

function dayKey(date = new Date()): string {
  // UK days - the funnel reads in the owner's own day, not UTC's.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// Counter names: "<step>", "<step>__src_<source>", "<step>__inapp" -
// flat keys, so each is one atomic increment.
function counterKeys(step: FunnelStep, source: FunnelSource | null, inApp: boolean): string[] {
  return [step, ...(source ? [`${step}__src_${source}`] : []), ...(inApp ? [`${step}__inapp`] : [])];
}

export async function recordFunnelStep(step: FunnelStep, options: { source?: FunnelSource | null; inApp?: boolean } = {}): Promise<void> {
  const day = dayKey();
  const id = `funnel::${day}`;
  const keys = counterKeys(step, options.source ?? null, !!options.inApp);
  try {
    const container = getContainer();
    const operations = keys.map((key) => ({ op: "incr" as const, path: `/counts/${key}`, value: 1 }));
    try {
      await container.item(id, PK).patch(operations);
    } catch (err) {
      if ((err as { code?: number }).code !== 404) throw err;
      // First count of the day: create the document, or - if another
      // request created it a moment ago - increment that one instead.
      const doc: FunnelDayDoc = { id, pk: PK, type: "funnelDay", day, counts: Object.fromEntries(keys.map((k) => [k, 1])) };
      try {
        await container.items.create(doc);
      } catch (createErr) {
        if ((createErr as { code?: number }).code !== 409) throw createErr;
        await container.item(id, PK).patch(operations);
      }
    }
  } catch (err) {
    console.error(`recordFunnelStep(${step}) failed:`, err);
  }
}

export type FunnelDay = { day: string; counts: Record<string, number> };

// The last `days` days, newest first - days with nothing recorded are
// included as empty, so gaps show.
export async function getFunnelDays(days = 14): Promise<FunnelDay[]> {
  const wanted: string[] = [];
  for (let i = 0; i < days; i++) wanted.push(dayKey(new Date(Date.now() - i * 86_400_000)));
  const { resources } = await getContainer()
    .items.query<FunnelDayDoc>(
      { query: "SELECT c.day, c.counts FROM c WHERE c.type = 'funnelDay' AND c.day >= @from", parameters: [{ name: "@from", value: wanted[wanted.length - 1] }] },
      { partitionKey: PK }
    )
    .fetchAll();
  const byDay = new Map(resources.map((r) => [r.day, r.counts ?? {}]));
  return wanted.map((day) => ({ day, counts: byDay.get(day) ?? {} }));
}

