// Place at: src/lib/tracker/motHistoryFetch.ts
//
// The actual VDG network call, kept separate from motHistory.ts - that
// file is deliberately pure (no fetch, no Cosmos). This is shared by
// mot-history/route.ts, mot-history-preview/route.ts, and now the buyer
// report page, rather than duplicating the VDG call a third time.
import { parseMotHistory, type RawMotTest, type ParsedMotHistory } from "./motHistory";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

export async function fetchMotHistoryFromVdg(vrm: string): Promise<ParsedMotHistory | null> {
  const apiKey = process.env.VDG_API_KEY;
  if (!apiKey) {
    console.error("VDG_API_KEY is not configured.");
    return null;
  }

  try {
    const res = await fetch(
      `${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=MotHistoryDetails&vrm=${encodeURIComponent(vrm)}`
    );
    const data = await res.json();
    if (!data?.ResponseInformation?.IsSuccessStatusCode || !data?.Results?.MotHistoryDetails) {
      // Not an error worth surfacing on a public buyer-facing page - a
      // bike under 3 years old (MOT-exempt) or a lookup that just didn't
      // find anything is a normal outcome, not a failure.
      return null;
    }
    const motData = data.Results.MotHistoryDetails;
    return parseMotHistory(motData.MotDueDate ?? null, (motData.MotTestDetailsList ?? []) as RawMotTest[]);
  } catch (err) {
    console.error("VDG MOT history fetch failed:", err);
    return null;
  }
}
