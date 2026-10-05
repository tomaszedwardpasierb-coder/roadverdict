// The Monday report: which week it covers, how the funnel days add up, and what
// the email says.
import { describe, expect, it } from "vitest";
import { buildWeeklyReport, daysOfWeek, lastCompleteWeekStart, sumDays } from "@/lib/analytics/weeklyReport";
import type { ProStats } from "@/lib/payments/proStats";
import type { FunnelDay } from "@/lib/analytics/funnel";

const pro: ProStats = {
  payingMonthly: 3, payingAnnual: 1, payingCancelling: 0, paymentFailing: 0, inTrial: 2, trialsCancelling: 0,
  started: 4, trialsStarted: 2, trialsConverted: 1, trialsEndedUnpaid: 0, renewalPayments: 3, ended: 1,
} as ProStats;

describe("which week the Monday report covers", () => {
  it("is the last complete UK week, Monday to Sunday", () => {
    expect(lastCompleteWeekStart(new Date("2026-10-05T07:00:00Z"))).toBe("2026-09-28"); // Monday morning
    expect(lastCompleteWeekStart(new Date("2026-10-11T20:00:00Z"))).toBe("2026-09-28"); // Sunday evening
    expect(daysOfWeek("2026-09-28")).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("adds up only that week's days", () => {
    const days: FunnelDay[] = [
      { day: "2026-10-04", counts: { home: 10, login: 2, home__src_youtube: 7 } },
      { day: "2026-09-28", counts: { home: 5 } },
      { day: "2026-09-27", counts: { home: 100 } },
    ];
    expect(sumDays(days, daysOfWeek("2026-09-28"))).toEqual({ home: 15, login: 2, home__src_youtube: 7 });
  });
});

describe("the report email", () => {
  const base = {
    weekStart: "2026-09-28",
    thisWeek: { home: 120, login: 12, link_requested: 6, signed_in: 5, account_created: 3, first_vehicle: 2, home__src_youtube: 80, home__src_google: 10, demo: 9, demo_scanned: 3 },
    lastWeek: { home: 100, login: 10 },
    activation: {
      weeks: [{ weekStart: "2026-10-05", people: 0 }, { weekStart: "2026-09-28", people: 4 }, { weekStart: "2026-09-21", people: 6 }],
      cohorts: [{ weekStart: "2026-09-28", accounts: 3, addedVehicle: 2, addedRecord: 2, week2Eligible: 0, week2: 0 }],
    },
    pro,
    checks: { thisWeek: { count: 2, pence: 1998 }, lastWeek: { count: 0, pence: 0 } },
  };

  it("leads with the numbers that matter, against the week before", () => {
    const r = buildWeeklyReport(base);
    expect(r.subject).toBe("RoadVerdict, week of 28 September: 4 active, 3 new, 4 Pro");
    expect(r.bodyHtml).toContain("<strong>4</strong> people added something real to a vehicle - down 2 on the week before (6)");
    expect(r.bodyHtml).toContain("<strong>3</strong> new accounts - 2 added a vehicle, 2 logged something real");
    expect(r.bodyHtml).toContain("<strong>4</strong> paying for Pro (3 monthly, 1 yearly), 2 in a free trial");
    expect(r.bodyHtml).toContain("<strong>2</strong> paid vehicle checks (£19.98) - up 2 on the week before (0)");
  });

  it("shows the sign-up funnel with step-to-step rates, and where visits came from", () => {
    const r = buildWeeklyReport(base);
    expect(r.bodyHtml).toContain("Sign-in page</td>");
    expect(r.bodyHtml).toMatch(/Asked for a sign-in link<\/td><td[^>]*><strong>6<\/strong><\/td><td[^>]*>0<\/td><td[^>]*>50%/);
    expect(r.bodyHtml).toContain("Home page visits by source: youtube 80 · google 10");
  });

  it("shows a dash, not 0, for a week before the funnel was counting", () => {
    const r = buildWeeklyReport({ ...base, lastWeek: {} });
    expect(r.bodyHtml).toMatch(/Sign-in page<\/td><td[^>]*><strong>12<\/strong><\/td><td[^>]*>-<\/td>/);
  });

  it("still sends, saying so, when Stripe or the records can't be read", () => {
    const r = buildWeeklyReport({ ...base, activation: null, pro: null, checks: null });
    expect(r.subject).toBe("RoadVerdict, week of 28 September: ? active, 3 new, ? Pro");
    expect(r.bodyHtml).toContain("Couldn't read the activation numbers this week.");
    expect(r.bodyHtml).toContain("Couldn't reach Stripe for the Pro numbers this week.");
    expect(r.bodyHtml).not.toContain("paid vehicle check");
  });
});
