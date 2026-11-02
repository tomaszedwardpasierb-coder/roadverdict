// Place at: src/lib/tracker/motHistoryFetch.ts
//
// A vehicle's MOT history, parsed - kept separate from motHistory.ts,
// which is deliberately pure (no fetch, no Cosmos). Shared by the owner's
// MOT import (bike and car) and the shared buyer report pages. Which
// service answers (DVSA, or VDG as the fallback) is motHistorySource.ts's
// job.
import { parseMotHistory, type ParsedMotHistory } from "./motHistory";
import { fetchMotHistoryDetails } from "@/lib/mot/motHistorySource";

export async function fetchMotHistory(vrm: string): Promise<ParsedMotHistory | null> {
  const result = await fetchMotHistoryDetails(vrm);
  // Not an error worth surfacing on a public buyer-facing page - a bike
  // under 3 years old (MOT-exempt) or a lookup that just didn't find
  // anything is a normal outcome, not a failure.
  if (result.status !== "found") return null;
  return parseMotHistory(result.details.MotDueDate ?? null, result.details.MotTestDetailsList ?? []);
}
