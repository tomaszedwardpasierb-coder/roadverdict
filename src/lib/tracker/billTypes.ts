// Place at: src/lib/tracker/billTypes.ts
export const BILL_LABELS: Record<string, string> = {
  "insurance": "Insurance",
  "road-tax": "Road tax (VED)",
  "mot-test": "MOT test",
};

export const BILL_REMINDER_DEFAULTS: Record<string, { type: "months"; value: number }> = {
  "insurance": { type: "months", value: 12 },
  "road-tax": { type: "months", value: 12 },
  "mot-test": { type: "months", value: 12 },
};

// Which bill types can be logged as a recurring instalment plan instead
// of a single lump payment - MOT is deliberately never in this list, it's
// always a one-off test.
export const BILL_SERIES_ELIGIBLE_TYPES = ["insurance", "road-tax"] as const;

export const BILL_SERIES_FREQUENCY_LABELS: Record<"monthly" | "six-monthly", string> = {
  "monthly": "Monthly",
  "six-monthly": "Every 6 months",
};

// Starting points only, always editable in the form - there's no single
// right answer here (UK insurance premium finance commonly runs
// 10-11 regular payments after a deposit, but varies by insurer; DVLA's
// monthly/6-monthly VED cadence is fixed by the scheme itself, hence the
// road-tax defaults being exact rather than a guess). Keyed by
// `${billType}:${frequency}`.
export const BILL_SERIES_DEFAULT_INSTALMENT_COUNT: Record<string, number> = {
  "insurance:monthly": 12,
  "road-tax:monthly": 12,
  "road-tax:six-monthly": 2,
};
