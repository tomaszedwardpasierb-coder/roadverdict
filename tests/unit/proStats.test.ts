// Pro's end of the growth scorecard, read from Stripe: who's paying,
// who's in a trial, and the last 30 days' trials, conversions and renewals.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payments/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({ getContainer: vi.fn() }));

import { summariseProSubscriptions } from "@/lib/payments/proStats";

const now = Date.parse("2026-10-02T12:00:00.000Z");
const secs = (iso: string) => Math.floor(Date.parse(iso) / 1000);

function sub(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_x",
    status: "active",
    created: secs("2026-06-01T00:00:00.000Z"),
    trial_start: null,
    trial_end: null,
    cancel_at_period_end: false,
    cancel_at: null,
    ended_at: null,
    metadata: { email: "a@example.com" },
    items: { data: [{ price: { recurring: { interval: "month" } } }] },
    ...overrides,
  };
}

describe("summariseProSubscriptions", () => {
  it("counts paying, trialling and failing Pro subscriptions, leaving extra vehicles out", () => {
    const stats = summariseProSubscriptions(
      [
        sub({ id: "sub_monthly" }),
        sub({ id: "sub_annual", items: { data: [{ price: { recurring: { interval: "year" } } }] }, cancel_at_period_end: true }),
        sub({ id: "sub_trial", status: "trialing", created: secs("2026-09-25T00:00:00.000Z"), trial_start: secs("2026-09-25T00:00:00.000Z"), trial_end: secs("2026-10-09T00:00:00.000Z") }),
        sub({ id: "sub_failing", status: "past_due" }),
        sub({ id: "sub_extras", metadata: { email: "a@example.com", kind: "extra_vehicles" } }),
      ] as never,
      [],
      now
    );
    expect(stats).toEqual(
      expect.objectContaining({ payingMonthly: 1, payingAnnual: 1, payingCancelling: 1, paymentFailing: 1, inTrial: 1, trialsCancelling: 0, started: 1, trialsStarted: 1 })
    );
  });

  it("tells converted trials from ones that ended unpaid, and counts renewal payments", () => {
    const converted = sub({ id: "sub_converted", created: secs("2026-09-10T00:00:00.000Z"), trial_start: secs("2026-09-10T00:00:00.000Z"), trial_end: secs("2026-09-24T00:00:00.000Z") });
    const lapsed = sub({ id: "sub_lapsed", status: "canceled", created: secs("2026-09-12T00:00:00.000Z"), trial_start: secs("2026-09-12T00:00:00.000Z"), trial_end: secs("2026-09-26T00:00:00.000Z"), ended_at: secs("2026-09-26T00:00:00.000Z") });
    const invoice = (subscription: string, reason: string, amount: number) => ({
      billing_reason: reason,
      amount_paid: amount,
      created: secs("2026-09-24T00:05:00.000Z"),
      parent: { subscription_details: { subscription } },
    });
    const stats = summariseProSubscriptions(
      [converted, lapsed] as never,
      [invoice("sub_converted", "subscription_cycle", 599), invoice("sub_converted", "subscription_create", 0), invoice("sub_other", "subscription_cycle", 199)] as never,
      now
    );
    expect(stats.trialsConverted).toBe(1);
    expect(stats.trialsEndedUnpaid).toBe(1);
    expect(stats.ended).toBe(1);
    expect(stats.renewalPayments).toBe(1);
  });
});
