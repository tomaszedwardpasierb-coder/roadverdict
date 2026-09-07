import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// GDPR note: this table intentionally has no column that could identify a person.
// Don't add one later "just in case" — see the SEO/security/compliance guide.
//
// Azure note: Azure App Service on Linux mounts persistent storage (/home,
// where process.cwd() lives) over a network file share. SQLite's WAL mode
// relies on file-locking behaviour that network shares don't reliably
// support — a very commonly reported cause of "the app crashes instantly on
// Azure" for anything using SQLite. WEBSITE_SITE_NAME is set automatically
// by Azure App Service, so this only changes behaviour there, not locally.
//
// Trade-off: os.tmpdir() on Azure is LOCAL disk, not network-backed, so WAL
// mode works — but it's ephemeral. Data here can be wiped on restart/redeploy.
// Acceptable for now; this is exactly why the original plan always said
// "SQLite → Postgres only if needed" — this is the "needed" moment arriving
// once real data starts to matter, not something to solve by fighting SQLite
// further on Azure.
const DATA_DIR = process.env.WEBSITE_SITE_NAME
  ? path.join(os.tmpdir(), 'roadverdict-data')
  : path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'roadverdict.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS quote_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL,
    bike_class TEXT NOT NULL,
    quoted_price REAL NOT NULL,
    verdict TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

// Poor-man's migration: this table's shape has changed a few times already
// while prototyping, and `CREATE TABLE IF NOT EXISTS` does nothing once the
// table exists — it will NOT add new columns to an existing local .db file.
// Rather than requiring everyone to delete data/roadverdict.db every time the
// schema moves, check for and add any missing column at startup.
//
// The check-then-add below isn't atomic across processes: Next.js's build
// collects page data for each API route's bundle separately, and more than
// one of those bundles imports this module, each opening its own connection
// to the same physical roadverdict.db file. Two of them can both see "column
// doesn't exist yet" before either has committed its ALTER, so the second
// one fails with "duplicate column name" - a real race that surfaced once
// enough routes importing this file existed for the build to hit it
// reliably. The ALTER failing for that specific reason means the column now
// exists either way (which is exactly this function's postcondition), so
// it's caught and ignored rather than treated as a real error.
function ensureColumn(table: string, column: string, definitionSql: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql}`);
    } catch (err) {
      if (!(err instanceof Error) || !/duplicate column name/i.test(err.message)) throw err;
    }
  }
}

ensureColumn('quote_logs', 'brand', "TEXT NOT NULL DEFAULT ''");
ensureColumn('quote_logs', 'region', "TEXT NOT NULL DEFAULT ''");

db.exec(`
  CREATE TABLE IF NOT EXISTS buying_guide_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bike_class TEXT NOT NULL,
    brand TEXT NOT NULL,
    age_band TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

const insertBuyingGuideStmt = db.prepare(`
  INSERT INTO buying_guide_logs (bike_class, brand, age_band, created_at)
  VALUES (@bikeClass, @brand, @ageBand, @createdAt)
`);

export interface BuyingGuideLogEntry {
  bikeClass: string;
  brand: string;
  ageBand: string;
}

export function logBuyingGuideCheck(entry: BuyingGuideLogEntry): void {
  insertBuyingGuideStmt.run({ ...entry, createdAt: new Date().toISOString() });
}

const insertStmt = db.prepare(`
  INSERT INTO quote_logs (job_type, bike_class, brand, region, quoted_price, verdict, created_at)
  VALUES (@jobType, @bikeClass, @brand, @region, @quotedPrice, @verdict, @createdAt)
`);

export interface QuoteLogEntry {
  jobType: string;
  bikeClass: string;
  brand: string;
  region: string;
  quotedPrice: number;
  verdict: string;
}

export function logQuoteCheck(entry: QuoteLogEntry): void {
  insertStmt.run({ ...entry, createdAt: new Date().toISOString() });
}

/**
 * The actual sustainable answer to "the researched numbers will go stale":
 * once there's real traffic, this table is a live, self-refreshing price
 * source that costs nothing to maintain — no scraping, no API, no manual
 * refresh. It's the "quietly compounding asset" the whole plan is built
 * around.
 *
 * Deliberately NOT fed into the verdict calculation in priceData.ts. Reason:
 * selection bias. People who use a quote-fairness checker are disproportionately
 * people who suspect they're being overcharged — so submitted quotes likely
 * skew high versus the true market. Feeding that straight back into "what
 * counts as fair" would create a feedback loop where the tool quietly grades
 * on a curve that creeps upward over time. Shown here as a separate,
 * clearly-labelled "here's what other riders reported" stat instead — real
 * and useful, without pretending it's the same thing as a market rate.
 *
 * Gated on a minimum sample size so one or two outliers can't masquerade as
 * a trend.
 */
const MIN_SAMPLE_SIZE_FOR_COMMUNITY_STATS = 8;

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

export function getCommunityStats(jobType: string, bikeClass: string): CommunityStats | null {
  const rows = db
    .prepare(
      `SELECT quoted_price FROM quote_logs WHERE job_type = ? AND bike_class = ? ORDER BY quoted_price ASC`
    )
    .all(jobType, bikeClass) as { quoted_price: number }[];

  if (rows.length < MIN_SAMPLE_SIZE_FOR_COMMUNITY_STATS) return null;

  const prices = rows.map((r) => r.quoted_price);
  return {
    sampleSize: prices.length,
    low: Math.round(percentile(prices, 25)),
    high: Math.round(percentile(prices, 75)),
  };
}

/**
 * Car equivalents of the three functions/tables above - own tables, not
 * shared rows with the motorcycle ones (same sister-schema principle as
 * everywhere else in the car build). Same GDPR note applies: no column
 * here could identify a person.
 */
db.exec(`
  CREATE TABLE IF NOT EXISTS car_quote_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type TEXT NOT NULL,
    car_class TEXT NOT NULL,
    brand TEXT NOT NULL,
    region TEXT NOT NULL,
    quoted_price REAL NOT NULL,
    verdict TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

const insertCarQuoteStmt = db.prepare(`
  INSERT INTO car_quote_logs (job_type, car_class, brand, region, quoted_price, verdict, created_at)
  VALUES (@jobType, @carClass, @brand, @region, @quotedPrice, @verdict, @createdAt)
`);

export interface CarQuoteLogEntry {
  jobType: string;
  carClass: string;
  brand: string;
  region: string;
  quotedPrice: number;
  verdict: string;
}

export function logCarQuoteCheck(entry: CarQuoteLogEntry): void {
  insertCarQuoteStmt.run({ ...entry, createdAt: new Date().toISOString() });
}

export function getCarCommunityStats(jobType: string, carClass: string): CommunityStats | null {
  const rows = db
    .prepare(
      `SELECT quoted_price FROM car_quote_logs WHERE job_type = ? AND car_class = ? ORDER BY quoted_price ASC`
    )
    .all(jobType, carClass) as { quoted_price: number }[];

  if (rows.length < MIN_SAMPLE_SIZE_FOR_COMMUNITY_STATS) return null;

  const prices = rows.map((r) => r.quoted_price);
  return {
    sampleSize: prices.length,
    low: Math.round(percentile(prices, 25)),
    high: Math.round(percentile(prices, 75)),
  };
}

db.exec(`
  CREATE TABLE IF NOT EXISTS car_buying_guide_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_class TEXT NOT NULL,
    brand TEXT NOT NULL,
    age_band TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

const insertCarBuyingGuideStmt = db.prepare(`
  INSERT INTO car_buying_guide_logs (car_class, brand, age_band, created_at)
  VALUES (@carClass, @brand, @ageBand, @createdAt)
`);

export interface CarBuyingGuideLogEntry {
  carClass: string;
  brand: string;
  ageBand: string;
}

export function logCarBuyingGuideCheck(entry: CarBuyingGuideLogEntry): void {
  insertCarBuyingGuideStmt.run({ ...entry, createdAt: new Date().toISOString() });
}