// Place at: src/lib/tracker/aiDescription.ts
//
// Deliberately has zero dependencies, same reasoning as mpgCalc.ts - this
// is pure string composition, safe to import from a client component
// (the review queue) as well as the scan-receipt API route, without
// dragging anything else along with it.

export interface AiDescriptionInput {
  // The short per-item description already extracted by Gemini (e.g.
  // "Front brake pads").
  description: string;
  // Receipt-level fields - one receipt can produce several items, so
  // these are the same across every item split from the same photo.
  merchantName?: string | null;
  address?: string | null;
  city?: string | null;
  // Human label for the category this specific item landed in (e.g.
  // "Service"), not the raw category key - always known deterministically
  // by the caller, never guessed by the AI a second time.
  categoryLabel: string;
}

// Composes something like:
// "Front brake pads at Dave's Motorcycles - Colchester (Service)"
// Any missing piece is simply omitted rather than leaving a stray "at" or
// empty parentheses. The street address is left out: this is the entry's
// title, and "Unit 4, Mill Lane Trading Estate" made every title read like
// an address. The town is enough to tell two branches apart.
// A scanned job's notes: "Full service: engine oil, oil filter, spark
// plugs". One entry per job, so the invoice's individual lines live here
// rather than as entries of their own.
export function describeWithDetails(description: string, details: string | null | undefined): string {
  return details && details.trim() ? `${description}: ${details.trim()}` : description;
}

export function buildAiDescription(input: AiDescriptionInput): string {
  const whatFor = input.merchantName ? `${input.description} at ${input.merchantName}` : input.description;
  const parts = [whatFor];
  if (input.city && input.city.trim()) parts.push(input.city.trim());
  const withPlace = parts.join(" - ");
  return `${withPlace} (${input.categoryLabel})`;
}
