// Place at: src/lib/quoteLogs.ts
//
// The anonymous records behind the free tools: what people check in the
// Quote Checker and the Buying Guide, for bikes and cars, kept in the main
// database. They used to go to a SQLite file in the server's temp folder,
// which Azure wipes on every restart and deploy, so nothing ever built up -
// and the "what other riders reported" figure could never reach its minimum
// sample. Now they persist.
//
// GDPR note: no field here can identify a person - no email, no IP address,
// no registration. Don't add one later "just in case".
//
// Writes happen only on the live Azure site (App Service sets
// WEBSITE_SITE_NAME). Local runs use the real database and CI uses a test
// one; neither should add its own test checks to the price statistics.
// Reads work anywhere. Nothing here ever throws: a logging problem must
// never fail a visitor's check.
import { randomUUID } from "node:crypto";
import { getContainer } from "@/lib/cosmos";

type LogType = "quoteLog" | "buyingGuideLog";
type Kind = "bike" | "car";

async function writeLog(type: LogType, kind: Kind, fields: Record<string, string | number>): Promise<void> {
  if (!process.env.WEBSITE_SITE_NAME) return;
  try {
    await getContainer().items.create({
      id: `${type}::${kind}::${randomUUID()}`,
      pk: `${type}::${kind}`,
      type,
      kind,
      ...fields,
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Never let bookkeeping fail a request.
  }
}

export interface QuoteLogEntry {
  jobType: string;
  bikeClass: string;
  brand: string;
  region: string;
  quotedPrice: number;
  verdict: string;
}

export interface CarQuoteLogEntry {
  jobType: string;
  carClass: string;
  brand: string;
  region: string;
  quotedPrice: number;
  verdict: string;
}

export interface BuyingGuideLogEntry {
  bikeClass: string;
  brand: string;
  ageBand: string;
}

export interface CarBuyingGuideLogEntry {
  carClass: string;
  brand: string;
  ageBand: string;
}

export function logQuoteCheck(entry: QuoteLogEntry): Promise<void> {
  return writeLog("quoteLog", "bike", { ...entry });
}

export function logCarQuoteCheck(entry: CarQuoteLogEntry): Promise<void> {
  return writeLog("quoteLog", "car", { ...entry });
}

export function logBuyingGuideCheck(entry: BuyingGuideLogEntry): Promise<void> {
  return writeLog("buyingGuideLog", "bike", { ...entry });
}

export function logCarBuyingGuideCheck(entry: CarBuyingGuideLogEntry): Promise<void> {
  return writeLog("buyingGuideLog", "car", { ...entry });
}

/**
 * The actual sustainable answer to "the researched numbers will go stale":
 * once there's real traffic, these records are a live, self-refreshing price
 * source that costs nothing to maintain - no scraping, no API, no manual
 * refresh.
 *
 * Deliberately NOT fed into the verdict calculation in priceData.ts. Reason:
 * selection bias. People who use a quote-fairness checker are
 * disproportionately people who suspect they're being overcharged - so
 * submitted quotes likely skew high versus the true market. Feeding that
 * straight back into "what counts as fair" would create a feedback loop where
 * the tool quietly grades on a curve that creeps upward over time. Shown as a
 * separate, clearly-labelled "here's what other riders reported" stat
 * instead - real and useful, without pretending it's the same thing as a
 * market rate.
 *
 * Gated on a minimum sample size so one or two outliers can't masquerade as
 * a trend. Only the latest MAX_SAMPLE_SIZE quotes feed the figure, so one
 * query stays small however much data builds up (and old prices drift).
 */
const MIN_SAMPLE_SIZE_FOR_COMMUNITY_STATS = 8;
const MAX_SAMPLE_SIZE = 500;

export interface CommunityStats {
  sampleSize: number;
  low: number;
  high: number;
}

function percentile(sortedValues: number[], p: number): number {
  const idx = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (idx - lower);
}

async function communityStats(kind: Kind, jobType: string, classField: "bikeClass" | "carClass", classValue: string): Promise<CommunityStats | null> {
  try {
    const { resources } = await getContainer()
      .items.query<number>(
        {
          // classField is one of two constants above, never user input.
          query: `SELECT TOP ${MAX_SAMPLE_SIZE} VALUE c.quotedPrice FROM c WHERE c.type = 'quoteLog' AND c.jobType = @jobType AND c.${classField} = @classValue ORDER BY c.createdAt DESC`,
          parameters: [
            { name: "@jobType", value: jobType },
            { name: "@classValue", value: classValue },
          ],
        },
        { partitionKey: `quoteLog::${kind}` }
      )
      .fetchAll();

    if (resources.length < MIN_SAMPLE_SIZE_FOR_COMMUNITY_STATS) return null;

    const prices = [...resources].sort((a, b) => a - b);
    return {
      sampleSize: prices.length,
      low: Math.round(percentile(prices, 25)),
      high: Math.round(percentile(prices, 75)),
    };
  } catch {
    // The verdict stands on its own without this extra figure.
    return null;
  }
}

export function getCommunityStats(jobType: string, bikeClass: string): Promise<CommunityStats | null> {
  return communityStats("bike", jobType, "bikeClass", bikeClass);
}

export function getCarCommunityStats(jobType: string, carClass: string): Promise<CommunityStats | null> {
  return communityStats("car", jobType, "carClass", carClass);
}
