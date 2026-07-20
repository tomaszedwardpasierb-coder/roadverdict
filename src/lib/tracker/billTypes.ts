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
