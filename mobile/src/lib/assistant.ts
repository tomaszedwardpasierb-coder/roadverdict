// The website's AI assistant (/api/assistant), for the app: the chat
// itself, and the drafts it can hand back for the owner to confirm. Every
// confirm goes through the same route the website's own draft card uses,
// with the same body, so a draft saves identically from either place.
export type ChatMessage = { role: 'user' | 'assistant'; content: string };

// What the assistant drafts - see assistantTools.ts on the server. Costs
// are always pounds and mileages always miles, as they're stored.
export type ProposedEntry = { vehicleKind: 'bike' | 'car'; entryId?: string; cost: number; date: string; mileage?: number } & (
  | { category: 'service'; jobType: string; jobLabel: string; description: string }
  | { category: 'bill'; billType: string; billLabel: string; description: string }
  | { category: 'mod'; modCategory: string; modLabel: string; description: string }
  | { category: 'fuel'; litres?: number; kwh?: number; filledToFull: boolean }
  | { category: 'labour'; labourCategory: string; labourLabel: string; description: string }
  | { category: 'fine'; fineType: string; fineLabel: string; description: string }
  | { category: 'toll'; tollType: string; tollLabel: string; description: string }
);

export type ProposedShareLink = { category: 'shareLink'; vehicleKind: 'bike' | 'car'; duration: '1week' | '1month' | '6months'; recipientEmail: string; askingPrice?: number };

export type ProposedSettingsChange = { category: 'settings'; vehicleKind: 'bike' | 'car' } & Record<string, unknown>;

export type ProposedFeedback = { category: 'feedback'; feedbackType: 'feature' | 'bug' | 'other'; message: string };

export type AssistantReply = {
  reply: string;
  proposedEntry?: ProposedEntry;
  proposedShareLink?: ProposedShareLink;
  proposedSettingsChange?: ProposedSettingsChange;
  proposedFeedback?: ProposedFeedback;
  // Not in the app yet - the reply points to the website instead.
  proposedVaultDocument?: unknown;
};

// The server keeps the last 20 turns anyway; sending more is wasted.
export const MAX_TURNS = 20;

const ENTRY_ROUTES: Record<ProposedEntry['category'], [bike: string, car: string]> = {
  service: ['/api/tracker/services', '/api/cars/car-services'],
  bill: ['/api/tracker/bills', '/api/cars/car-bills'],
  mod: ['/api/tracker/mods', '/api/cars/car-mods'],
  fuel: ['/api/tracker/fuel', '/api/cars/car-fuel'],
  labour: ['/api/tracker/labour', '/api/cars/car-labour'],
  fine: ['/api/tracker/fines', '/api/cars/car-fines'],
  toll: ['/api/tracker/tolls', '/api/cars/car-tolls'],
};

export function entryRoute(entry: ProposedEntry): string {
  const base = ENTRY_ROUTES[entry.category][entry.vehicleKind === 'car' ? 1 : 0];
  return entry.entryId ? `${base}/${encodeURIComponent(entry.entryId)}` : base;
}

// The same bodies the website's draft card sends (AssistantProposedEntryCard).
export function entryBody(entry: ProposedEntry, mileageAcknowledged: boolean): Record<string, unknown> {
  const { cost, date } = entry;
  const mileage = entry.mileage;
  switch (entry.category) {
    case 'service':
      return { jobType: entry.jobType, cost, mileage, date, notes: entry.description, mileageAcknowledged };
    case 'bill':
      return { billType: entry.billType, cost, date, notes: entry.description };
    case 'mod':
      return { category: entry.modCategory, name: entry.description, cost, mileage, date, mileageAcknowledged };
    case 'labour':
      return { category: entry.labourCategory, cost, mileage, date, notes: entry.description, mileageAcknowledged };
    case 'fine':
      return { fineType: entry.fineType, cost, date, notes: entry.description };
    case 'toll':
      return { tollType: entry.tollType, cost, date, notes: entry.description };
    case 'fuel':
      return entry.kwh !== undefined
        ? { kwh: entry.kwh, cost, mileage, date, filledToFull: false, mileageAcknowledged }
        : { litres: entry.litres, cost, mileage, date, filledToFull: entry.filledToFull, mileageAcknowledged };
  }
}

export function entryTitle(entry: ProposedEntry): string {
  const verb = entry.entryId ? 'Edit' : 'New';
  switch (entry.category) {
    case 'service':
      return `${verb} service record: ${entry.jobLabel}`;
    case 'bill':
      return `${verb} bill: ${entry.billLabel}`;
    case 'mod':
      return `${verb} part or accessory: ${entry.modLabel}`;
    case 'labour':
      return `${verb} labour: ${entry.labourLabel}`;
    case 'fine':
      return `${verb} fine: ${entry.fineLabel}`;
    case 'toll':
      return `${verb} toll or parking: ${entry.tollLabel}`;
    case 'fuel':
      return entry.kwh !== undefined ? `${verb} charging session` : `${verb} fuel fill-up`;
  }
}

// Only these ever carry a mileage the server checks for consistency.
export function entryHasMileage(entry: ProposedEntry): boolean {
  return entry.category !== 'bill' && entry.category !== 'fine' && entry.category !== 'toll';
}

// The website spots a mileage-consistency refusal the same way: those
// messages all mention miles, and nothing else these routes return does.
export function isMileageWarning(message: string): boolean {
  return /miles/i.test(message);
}

export function settingsRoute(kind: 'bike' | 'car'): string {
  return kind === 'car' ? '/api/cars/car' : '/api/tracker/bike';
}

// Everything the draft proposes, minus its own labels.
export function settingsBody(change: ProposedSettingsChange): Record<string, unknown> {
  const { category: _category, vehicleKind: _kind, ...fields } = change;
  return fields;
}

const SETTING_LABELS: Record<string, string> = {
  currentMileage: 'Current mileage',
  region: 'Region',
  annualBudget: 'Yearly budget',
  currency: 'Currency',
  distanceUnit: 'Distance unit',
  fuelEconomyUnit: 'Fuel economy unit',
  includeInsuranceInReport: 'Insurance in the buyer report',
  includeFinanceInReport: 'Finance in the buyer report',
  includeFinesInReport: 'Fines in the buyer report',
  includeTollsInReport: 'Tolls in the buyer report',
  includeCleaningInReport: 'Valeting in the buyer report',
};

export function settingsLines(change: ProposedSettingsChange): { label: string; value: string }[] {
  return Object.entries(settingsBody(change)).map(([key, value]) => ({
    label: SETTING_LABELS[key] ?? key,
    value: typeof value === 'boolean' ? (value ? 'Shown' : 'Hidden') : key === 'annualBudget' ? `£${Number(value).toLocaleString('en-GB')}` : String(value),
  }));
}
