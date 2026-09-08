// Place at: src/lib/tracker/carGuessCategory.ts
//
// The car equivalent of guessCategory.ts - same word-overlap heuristic,
// not a modification of the original (which stays scoped to the
// motorcycle catalogs it already imports).
import { CAR_JOB_LABELS } from "./carJobTypes";
import { CAR_MOD_LABELS } from "./carModTypes";
import { CAR_BILL_LABELS } from "./carBillTypes";
import { CAR_LABOUR_LABELS } from "./carLabourTypes";

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

export function guessCarJobType(description: string): string | null {
  return bestMatch(description, CAR_JOB_LABELS);
}

export function guessCarModCategory(description: string): string | null {
  return bestMatch(description, CAR_MOD_LABELS);
}

export function guessCarBillType(description: string): string | null {
  return bestMatch(description, CAR_BILL_LABELS);
}

export function guessCarLabourCategory(description: string): string | null {
  return bestMatch(description, CAR_LABOUR_LABELS);
}
