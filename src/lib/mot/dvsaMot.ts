// Place at: src/lib/mot/dvsaMot.ts
//
// DVSA's own MOT History API - free, under the Open Government Licence
// (500,000 requests a day), so an MOT lookup costs nothing, unlike VDG's
// MotHistoryDetails package. motHistorySource.ts decides when it's used and
// falls back to VDG; this file only talks to DVSA and translates its
// answer.
//
// Sign-in is OAuth client credentials against Microsoft's token endpoint;
// the token lasts about an hour and is reused until shortly before it
// runs out. Every call also carries the API key in X-API-Key. All five
// settings come from the environment (DVSA_MOT_*), never the code.
//
// The answer is translated into VDG's MotHistoryDetails shape, so every
// existing caller - parseMotHistory, fromVdg, the lookup routes - reads it
// unchanged.
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { RawMotTest } from "@/lib/tracker/motHistory";

const API_BASE = "https://history.mot.api.gov.uk/v1/trade/vehicles/registration/";
// Ask for a new token this long before the old one runs out.
const TOKEN_MARGIN_MS = 5 * 60 * 1000;

export interface DvsaDefect {
  type?: string;
  text?: string;
  dangerous?: boolean;
}

export interface DvsaMotTest {
  completedDate?: string;
  testResult?: string;
  expiryDate?: string | null;
  odometerValue?: string | null;
  odometerUnit?: string | null;
  odometerResultType?: string | null;
  defects?: DvsaDefect[];
}

export interface DvsaVehicle {
  registration?: string;
  make?: string;
  model?: string;
  fuelType?: string;
  primaryColour?: string;
  engineSize?: string;
  firstUsedDate?: string;
  registrationDate?: string;
  manufactureDate?: string;
  // Only on a vehicle too new to have had an MOT yet.
  motTestDueDate?: string | null;
  hasOutstandingRecall?: string;
  motTests?: DvsaMotTest[];
}

// VDG's MotHistoryDetails - the shape every caller already reads.
export interface MotHistoryDetails {
  Make?: string;
  Model?: string;
  FuelType?: string;
  Colour?: string;
  MotDueDate?: string | null;
  MotTestDetailsList?: RawMotTest[];
}

export type DvsaLookup =
  | { status: "found"; vehicle: DvsaVehicle }
  | { status: "not_found" }
  | { status: "unavailable" };

function settings() {
  const s = {
    clientId: process.env.DVSA_MOT_CLIENT_ID,
    clientSecret: process.env.DVSA_MOT_CLIENT_SECRET,
    apiKey: process.env.DVSA_MOT_API_KEY,
    scope: process.env.DVSA_MOT_SCOPE,
    tokenUrl: process.env.DVSA_MOT_TOKEN_URL,
  };
  return Object.values(s).every(Boolean) ? (s as { [K in keyof typeof s]: string }) : null;
}

export function dvsaConfigured(): boolean {
  return settings() !== null;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

// For tests only.
export function resetDvsaTokenCache(): void {
  cachedToken = null;
}

async function accessToken(s: NonNullable<ReturnType<typeof settings>>): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_MARGIN_MS > Date.now()) return cachedToken.value;
  const res = await fetchWithTimeout(s.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: s.clientId,
      client_secret: s.clientSecret,
      scope: s.scope,
    }).toString(),
  });
  if (!res.ok) {
    console.error(`DVSA MOT token request failed: HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

export async function fetchDvsaVehicle(registration: string): Promise<DvsaLookup> {
  const s = settings();
  if (!s) return { status: "unavailable" };
  try {
    const token = await accessToken(s);
    if (!token) return { status: "unavailable" };
    const res = await fetchWithTimeout(API_BASE + encodeURIComponent(registration), {
      headers: { Authorization: `Bearer ${token}`, "X-API-Key": s.apiKey, Accept: "application/json" },
    });
    if (res.status === 404) return { status: "not_found" };
    if (res.status === 401) cachedToken = null;
    if (!res.ok) {
      console.error(`DVSA MOT lookup failed: HTTP ${res.status}`);
      return { status: "unavailable" };
    }
    return { status: "found", vehicle: (await res.json()) as DvsaVehicle };
  } catch (err) {
    console.error("DVSA MOT lookup failed:", err instanceof Error ? err.message : "unknown error");
    return { status: "unavailable" };
  }
}

// DVSA writes dates as "2027-06-11"; VDG as "2027-06-11T00:00:00Z" (checked
// side by side on the same plates, 2 Nov 2026). VDG's form is kept, so
// nothing downstream ever sees two kinds.
function vdgDate(date: string | null | undefined): string | null {
  if (!date) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : date;
}

// The current MOT runs to the latest expiry date on any test (a fail has
// none, so a fail after the old one ran out leaves that past date - still
// the right "due" answer). A vehicle with no test yet carries DVSA's own
// first-MOT due date instead.
function motDueDate(vehicle: DvsaVehicle): string | null {
  const expiries = (vehicle.motTests ?? []).map((t) => t.expiryDate).filter((d): d is string => !!d);
  if (expiries.length > 0) return vdgDate(expiries.sort().at(-1));
  return vdgDate(vehicle.motTestDueDate);
}

export function dvsaToMotHistoryDetails(vehicle: DvsaVehicle): MotHistoryDetails {
  return {
    Make: vehicle.make ?? "",
    Model: vehicle.model ?? "",
    FuelType: vehicle.fuelType ?? "",
    Colour: vehicle.primaryColour ?? "",
    MotDueDate: motDueDate(vehicle),
    MotTestDetailsList: (vehicle.motTests ?? []).map((t) => ({
      TestDate: t.completedDate ?? "",
      TestPassed: t.testResult === "PASSED",
      ExpiryDate: vdgDate(t.expiryDate),
      OdometerReading: t.odometerValue ?? "",
      OdometerUnit: t.odometerUnit ?? "",
      // "READ" is the only value anything downstream trusts; DVSA's others
      // ("UNREADABLE", "NO_ODOMETER") pass through and are treated as unread.
      OdometerResultType: t.odometerResultType ?? "",
      // Neither is read anywhere - kept only to fill VDG's shape.
      DaysOutOfMot: 0,
      IsRetest: false,
      AnnotationList: (t.defects ?? []).map((d) => ({
        Type: d.type ?? "",
        Text: d.text ?? "",
        IsDangerous: Boolean(d.dangerous),
      })),
    })),
  };
}
