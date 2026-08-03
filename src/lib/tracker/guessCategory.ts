// Place at: src/lib/tracker/guessCategory.ts
import { JOB_LABELS } from "./jobTypes";
import { MOD_LABELS } from "./modTypes";
import { BILL_LABELS } from "./billTypes";

// Counts how many words from the description appear in each label, picks
// whichever label matches the most - a simple heuristic, not true fuzzy
// matching, but the result is always shown to the user to review and
// change before saving, so an imperfect guess costs nothing beyond one
// dropdown click.
function bestMatch(description: string, labels: Record<string, string>): string | null {
  const words = description.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (words.length === 0) return null;
  let bestKey: string | null = null;
  let bestScore = 0;
  for (const [key, label] of Object.entries(labels)) {
    const labelLower = label.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (labelLower.includes(w)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestScore > 0 ? bestKey : null;
}

export function guessJobType(description: string): string | null {
  return bestMatch(description, JOB_LABELS);
}

export function guessModCategory(description: string): string | null {
  return bestMatch(description, MOD_LABELS);
}

export function guessBillType(description: string): string | null {
  return bestMatch(description, BILL_LABELS);
}
