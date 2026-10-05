// Place at: src/lib/analytics/weeklyReport.ts
//
// The Monday report: last week (a UK week, Monday to Sunday) in one email,
// so the owner doesn't have to open /tomasz, Stripe and the funnel to see
// how the week went. Built from the same numbers /tomasz shows - the
// anonymous funnel counters, the activation figures worked out from the
// records, Stripe's Pro subscriptions, and paid vehicle checks - with the
// week before alongside for comparison. Nothing here names a person.
//
// buildWeeklyReport is pure (and tested); gatherWeeklyReport reads the data.
import { getFunnelDays, FUNNEL_SOURCES, type FunnelDay } from "@/lib/analytics/funnel";
import { getActivationStats, weekStartOf, type ActivationStats, type AccountRow } from "@/lib/analytics/activation";
import { getProStats, type ProStats } from "@/lib/payments/proStats";
import { getContainer } from "@/lib/cosmos";

export type WeekCounts = Record<string, number>;
export type VehicleChecks = { count: number; pence: number };

export type WeeklyReportInput = {
  weekStart: string; // the Monday the report covers, YYYY-MM-DD
  thisWeek: WeekCounts;
  lastWeek: WeekCounts;
  activation: ActivationStats | null;
  pro: ProStats | null;
  checks: { thisWeek: VehicleChecks; lastWeek: VehicleChecks } | null;
};

export type WeeklyReport = { subject: string; preheader: string; bodyHtml: string };

// The 7 UK days of the week starting `monday` (YYYY-MM-DD).
export function daysOfWeek(monday: string): string[] {
  const [y, m, d] = monday.split("-").map(Number);
  return Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

// The Monday before the week `now` falls in - the last complete week.
export function lastCompleteWeekStart(now: Date): string {
  const thisMonday = weekStartOf(now);
  const [y, m, d] = thisMonday.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
}

export function sumDays(days: FunnelDay[], wanted: string[]): WeekCounts {
  const set = new Set(wanted);
  const out: WeekCounts = {};
  for (const day of days) {
    if (!set.has(day.day)) continue;
    for (const [k, v] of Object.entries(day.counts)) out[k] = (out[k] ?? 0) + (typeof v === "number" ? v : 0);
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function longDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

function change(now: number, before: number): string {
  if (now === before) return "same as the week before";
  const diff = now - before;
  return `${diff > 0 ? "up" : "down"} ${Math.abs(diff)} on the week before (${before})`;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-";
}

const FUNNEL_ROWS: { key: string; label: string }[] = [
  { key: "home", label: "Home page visits (signed out)" },
  { key: "login", label: "Sign-in page" },
  { key: "link_requested", label: "Asked for a sign-in link" },
  { key: "signed_in", label: "Signed in from the link" },
  { key: "account_created", label: "New accounts" },
  { key: "first_vehicle", label: "Added a first vehicle" },
];
const DEMO_ROWS: { key: string; label: string }[] = [
  { key: "demo", label: "Sample-bike demo visits" },
  { key: "demo_scanned", label: "Read a receipt" },
  { key: "demo_asked", label: "Asked a question" },
];
const MONEY_ROWS: { key: string; label: string }[] = [
  { key: "pro", label: "Pro page visits" },
  { key: "checkout_started", label: "Checkouts started" },
  { key: "report_shared", label: "History reports shared" },
  { key: "report", label: "Shared reports viewed" },
];

const td = "padding:6px 8px;border-bottom:1px solid #e6e1d6;";
const tdNum = `${td}text-align:right;font-variant-numeric:tabular-nums;`;

function table(rows: { key: string; label: string }[], a: WeekCounts, b: WeekCounts, withRate: boolean): string {
  let prev: number | null = null;
  const body = rows
    .map((r) => {
      const now = a[r.key] ?? 0;
      const rate = withRate && prev !== null ? pct(now, prev) : "";
      prev = now;
      return `<tr><td style="${td}">${esc(r.label)}</td><td style="${tdNum}"><strong>${now}</strong></td><td style="${tdNum}color:#8a867d;">${b[r.key] ?? 0}</td>${withRate ? `<td style="${tdNum}color:#8a867d;">${rate}</td>` : ""}</tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 18px;">
<tr><th style="${td}text-align:left;"></th><th style="${tdNum}">Last week</th><th style="${tdNum}color:#8a867d;">Week before</th>${withRate ? `<th style="${tdNum}color:#8a867d;">From step above</th>` : ""}</tr>${body}</table>`;
}

function sourcesLine(a: WeekCounts, step: string): string {
  const parts = FUNNEL_SOURCES.map((s) => [s, a[`${step}__src_${s}`] ?? 0] as const)
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1])
    .map(([s, n]) => `${s} ${n}`);
  return parts.length ? parts.join(" · ") : "none recorded";
}

const h2 = "font-size:16px;margin:22px 0 8px;";

export function buildWeeklyReport(input: WeeklyReportInput): WeeklyReport {
  const { weekStart, thisWeek, lastWeek, activation, pro, checks } = input;
  const prevMonday = (() => {
    const [y, m, d] = weekStart.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
  })();
  const activeNow = activation?.weeks.find((w) => w.weekStart === weekStart)?.people ?? null;
  const activeBefore = activation?.weeks.find((w) => w.weekStart === prevMonday)?.people ?? null;
  const cohort = activation?.cohorts.find((c) => c.weekStart === weekStart) ?? null;
  const newAccounts = cohort?.accounts ?? thisWeek.account_created ?? 0;
  const paying = pro ? pro.payingMonthly + pro.payingAnnual : null;

  const headline: string[] = [];
  headline.push(
    activeNow === null
      ? "Couldn't read the activation numbers this week."
      : `<strong>${activeNow}</strong> ${activeNow === 1 ? "person" : "people"} added something real to a vehicle - ${change(activeNow, activeBefore ?? 0)}.`
  );
  headline.push(
    `<strong>${newAccounts}</strong> new ${newAccounts === 1 ? "account" : "accounts"}${
      cohort && cohort.accounts > 0 ? ` - ${cohort.addedVehicle} added a vehicle, ${cohort.addedRecord} logged something real` : ""
    }.`
  );
  headline.push(
    pro
      ? `<strong>${paying}</strong> paying for Pro (${pro.payingMonthly} monthly, ${pro.payingAnnual} yearly), ${pro.inTrial} in a free trial${pro.paymentFailing ? `, <strong>${pro.paymentFailing} with a failing payment</strong>` : ""}.`
      : "Couldn't reach Stripe for the Pro numbers this week."
  );
  if (checks) {
    headline.push(
      `<strong>${checks.thisWeek.count}</strong> paid vehicle ${checks.thisWeek.count === 1 ? "check" : "checks"} (£${(checks.thisWeek.pence / 100).toFixed(2)}) - ${change(checks.thisWeek.count, checks.lastWeek.count)}.`
    );
  }

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const bodyHtml = `
<p style="margin:0 0 12px;">The week of ${longDay(weekStart)} (Monday to Sunday).</p>
<ul style="margin:0 0 6px;padding-left:18px;line-height:1.6;">${headline.map((l) => `<li>${l}</li>`).join("")}</ul>

<h2 style="${h2}">Sign-ups</h2>
${table(FUNNEL_ROWS, thisWeek, lastWeek, true)}
<p style="margin:0 0 6px;font-size:13px;color:#5b5850;">Home page visits by source: ${esc(sourcesLine(thisWeek, "home"))}</p>
<p style="margin:0 0 6px;font-size:13px;color:#5b5850;">Sign-in page by source: ${esc(sourcesLine(thisWeek, "login"))}</p>
<p style="margin:0 0 6px;font-size:13px;color:#5b5850;">New accounts by source: ${esc(sourcesLine(thisWeek, "account_created"))}</p>

<h2 style="${h2}">Sample bike</h2>
${table(DEMO_ROWS, thisWeek, lastWeek, false)}

<h2 style="${h2}">Pro and shared reports</h2>
${table(MONEY_ROWS, thisWeek, lastWeek, false)}
${
  pro
    ? `<p style="margin:0 0 6px;font-size:13px;color:#5b5850;">Last 30 days: ${pro.started} Pro started (${pro.trialsStarted} with a trial), ${pro.trialsConverted} trials became paid, ${pro.trialsEndedUnpaid} ended unpaid, ${pro.ended} subscriptions ended.</p>`
    : ""
}

<h2 style="${h2}">Elsewhere</h2>
<p style="margin:0 0 6px;font-size:14px;line-height:1.6;">
<a href="${appUrl}/tomasz">/tomasz</a> · <a href="https://dash.cloudflare.com/?to=/:account/web-analytics">Cloudflare visits</a> ·
<a href="https://search.google.com/search-console">Search Console</a> · <a href="https://play.google.com/console">Play Console</a>
</p>
<p style="margin:12px 0 0;font-size:12px;color:#8a867d;">Anonymous totals from the site's own counters. The funnel counts people who reached each step; your own visits count too.</p>`;

  const subject = `RoadVerdict, week of ${longDay(weekStart)}: ${activeNow ?? "?"} active, ${newAccounts} new, ${paying ?? "?"} Pro`;
  return { subject, preheader: `${activeNow ?? "?"} people added something real; ${newAccounts} new accounts.`, bodyHtml };
}

// Paid vehicle checks (Buying Guide reports bought through Stripe, not the
// Pro free allowance) paid in [from, to).
async function paidChecks(fromIso: string, toIso: string): Promise<VehicleChecks> {
  const { resources } = await getContainer()
    .items.query<{ pricePence?: number; grantMethod?: string }>({
      query: "SELECT c.pricePence, c.grantMethod FROM c WHERE c.type = 'vdiPurchase' AND IS_DEFINED(c.paidAt) AND c.paidAt >= @from AND c.paidAt < @to",
      parameters: [
        { name: "@from", value: fromIso },
        { name: "@to", value: toIso },
      ],
    })
    .fetchAll();
  const paid = resources.filter((r) => r.grantMethod !== "proFreeAllowance");
  return { count: paid.length, pence: paid.reduce((s, r) => s + (r.pricePence ?? 999), 0) };
}

export async function gatherWeeklyReport(accounts: AccountRow[], now = new Date()): Promise<WeeklyReportInput> {
  const weekStart = lastCompleteWeekStart(now);
  const [y, m, d] = weekStart.split("-").map(Number);
  const prevStart = new Date(Date.UTC(y, m - 1, d - 7)).toISOString().slice(0, 10);
  const days = await getFunnelDays(21);
  const thisWeek = sumDays(days, daysOfWeek(weekStart));
  const lastWeek = sumDays(days, daysOfWeek(prevStart));
  const [activation, pro, checks] = await Promise.all([
    getActivationStats(accounts, now).catch(() => null),
    getProStats(now.getTime()).catch(() => null),
    (async () => {
      const iso = (s: string, add: number) => {
        const [yy, mm, dd] = s.split("-").map(Number);
        return new Date(Date.UTC(yy, mm - 1, dd + add)).toISOString();
      };
      const [a, b] = await Promise.all([paidChecks(iso(weekStart, 0), iso(weekStart, 7)), paidChecks(iso(prevStart, 0), iso(prevStart, 7))]);
      return { thisWeek: a, lastWeek: b };
    })().catch(() => null),
  ]);
  return { weekStart, thisWeek, lastWeek, activation, pro, checks };
}
