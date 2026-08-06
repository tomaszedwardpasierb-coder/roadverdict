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
// "Front brake pads at Dave's Motorcycles - 14 High Street, Colchester (Service)"
// Any missing piece is simply omitted rather than leaving a stray "at" or
// empty parentheses.
export function buildAiDescription(input: AiDescriptionInput): string {
  const whatFor = input.merchantName ? `${input.description} at ${input.merchantName}` : input.description;
  const place = [input.address, input.city].filter((p): p is string => Boolean(p && p.trim())).join(", ");
  const parts = [whatFor];
  if (place) parts.push(place);
  const withPlace = parts.join(" - ");
  return `${withPlace} (${input.categoryLabel})`;
}
