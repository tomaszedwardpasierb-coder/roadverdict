// Place at: src/lib/mot/motHistorySource.ts
//
// The one place that fetches a vehicle's MOT history, whichever service
// answers. Every MOT lookup on the site goes through here: the owner's MOT
// import, the MOT history preview, the Quote Checker, the Cost Calculator,
// the Buying Guide (bike and car), the shared buyer reports and the free
// MOT check.
//
// MOT_SOURCE=dvsa (with the DVSA_MOT_* settings present) asks DVSA's free
// MOT History API first; if DVSA errors or times out, VDG's paid
// MotHistoryDetails package answers instead, so a DVSA outage never takes
// the lookups down. A plate DVSA doesn't know is "not found" outright - VDG
// gets its MOT data from DVSA too, so asking it as well would only cost
// money. Anything else (unset, "vdg") uses VDG alone, as before: removing
// the one setting rolls the switch back.
//
// The answer always comes back in VDG's MotHistoryDetails shape (see
// dvsaMot.ts), so callers don't care which source it was.
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import { dvsaConfigured, dvsaToMotHistoryDetails, fetchDvsaVehicle, type MotHistoryDetails } from "./dvsaMot";

export type { MotHistoryDetails } from "./dvsaMot";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

export type MotHistoryDetailsResult =
  // plateInRetention: VDG's status 21, a plate held off any vehicle. DVSA
  // has no such flag, so it's always false from there.
  | { status: "found"; details: MotHistoryDetails; plateInRetention: boolean; source: "dvsa" | "vdg" }
  | { status: "not_found" }
  | { status: "unavailable" };

export function motSource(): "vdg" | "dvsa" {
  return process.env.MOT_SOURCE === "dvsa" && dvsaConfigured() ? "dvsa" : "vdg";
}

async function fromVdg(vrm: string): Promise<MotHistoryDetailsResult> {
  const apiKey = process.env.VDG_API_KEY;
  if (!apiKey) {
    console.error("VDG_API_KEY is not configured.");
    return { status: "unavailable" };
  }
  try {
    const res = await fetchWithTimeout(`${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=MotHistoryDetails&vrm=${encodeURIComponent(vrm)}`);
    const data = await res.json();
    const details = data?.Results?.MotHistoryDetails as MotHistoryDetails | undefined;
    if (!data?.ResponseInformation?.IsSuccessStatusCode || !details) return { status: "not_found" };
    return { status: "found", details, plateInRetention: data.ResponseInformation.StatusCode === 21, source: "vdg" };
  } catch (err) {
    // The error never includes the request URL, which carries the key.
    console.error("VDG MOT history lookup failed:", err instanceof Error ? err.message : "unknown error");
    return { status: "unavailable" };
  }
}

export async function fetchMotHistoryDetails(vrm: string): Promise<MotHistoryDetailsResult> {
  if (motSource() === "dvsa") {
    const dvsa = await fetchDvsaVehicle(vrm);
    if (dvsa.status === "found") {
      return { status: "found", details: dvsaToMotHistoryDetails(dvsa.vehicle), plateInRetention: false, source: "dvsa" };
    }
    if (dvsa.status === "not_found") return { status: "not_found" };
    console.warn("DVSA MOT lookup unavailable - falling back to VDG.");
  }
  return fromVdg(vrm);
}
