// Place at: src/lib/tracker/reminderEdit.ts
//
// Editing a reminder (website and Android app): its name and its main
// schedule - every N miles, every N months, or one exact date. What was
// last done (baseMileage/date) and any extra "whichever comes first"
// triggers stay as they are; marking it done is still the PATCH route.
// Pure and shared by the bike and car reminder routes.

export type ReminderEdit = {
  name: string;
  intervalType: "mileage" | "months" | "date";
  intervalValue?: number;
  exactDate?: string;
};

const MAX_NAME = 80;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseReminderEdit(body: unknown): { ok: true; edit: ReminderEdit } | { ok: false; error: string } {
  const b = (body ?? {}) as { name?: unknown; intervalType?: unknown; intervalValue?: unknown; exactDate?: unknown };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return { ok: false, error: "Say what the reminder is for." };
  if (name.length > MAX_NAME) return { ok: false, error: `Keep the name under ${MAX_NAME} characters.` };

  if (b.intervalType === "date") {
    if (typeof b.exactDate !== "string" || !DATE.test(b.exactDate) || Number.isNaN(new Date(b.exactDate).getTime())) {
      return { ok: false, error: "Pick a date." };
    }
    return { ok: true, edit: { name, intervalType: "date", exactDate: b.exactDate } };
  }
  if (b.intervalType === "mileage" || b.intervalType === "months") {
    const value = typeof b.intervalValue === "number" ? b.intervalValue : Number(b.intervalValue);
    const max = b.intervalType === "months" ? 120 : 200_000;
    if (!Number.isInteger(value) || value <= 0 || value > max) {
      return { ok: false, error: b.intervalType === "months" ? "Enter how many months, from 1 to 120." : "Enter how many miles, from 1 to 200,000." };
    }
    return { ok: true, edit: { name, intervalType: b.intervalType, intervalValue: value } };
  }
  return { ok: false, error: "Choose miles, months or a date." };
}
