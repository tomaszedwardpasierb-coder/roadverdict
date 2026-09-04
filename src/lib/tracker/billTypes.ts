// Place at: src/lib/tracker/billTypes.ts
export const BILL_LABELS: Record<string, string> = {
  "insurance": "Insurance",
  "road-tax": "Road tax (VED)",
  "mot-test": "MOT test",
  "finance": "Finance",
};

export const BILL_REMINDER_DEFAULTS: Record<string, { type: "months"; value: number }> = {
  "insurance": { type: "months", value: 12 },
  "road-tax": { type: "months", value: 12 },
  "mot-test": { type: "months", value: 12 },
};

// Which bill types can be logged as a recurring instalment plan instead
// of a single lump payment - MOT is deliberately never in this list, it's
// always a one-off test.
export const BILL_SERIES_ELIGIBLE_TYPES = ["insurance", "road-tax", "finance"] as const;

export const BILL_SERIES_FREQUENCY_LABELS: Record<"monthly" | "six-monthly", string> = {
  "monthly": "Monthly",
  "six-monthly": "Every 6 months",
};

// Starting points only, always editable in the form - there's no single
// right answer here (UK insurance premium finance commonly runs
// 10-11 regular payments after a deposit, but varies by insurer; DVLA's
// monthly/6-monthly VED cadence is fixed by the scheme itself, hence the
// road-tax defaults being exact rather than a guess; vehicle finance
// (HP/PCP) commonly runs 24-60 months, 36 is just a plausible midpoint).
// Keyed by `${billType}:${frequency}`.
export const BILL_SERIES_DEFAULT_INSTALMENT_COUNT: Record<string, number> = {
  "insurance:monthly": 12,
  "road-tax:monthly": 12,
  "road-tax:six-monthly": 2,
  "finance:monthly": 36,
};

// Bill types whose cost is tied to the OWNER, not the bike - a future
// buyer's own insurance premium or finance agreement depends on things
// specific to them (age, licence history, no-claims record, their own
// credit deal), never on the bike itself, so neither is predictive of
// what a buyer will actually pay. Road tax and MOT are the opposite -
// both are genuinely tied to the vehicle - and are never in this list.
// Each type here has its own independent buyer-report exclusion toggle
// (see BikeDoc's includeInsuranceInReport/includeFinanceInReport) rather
// than one shared flag, since someone may reasonably want to show one
// but not the other.
export const OWNER_SPECIFIC_BILL_TYPES = ["insurance", "finance"] as const;
