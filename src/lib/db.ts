import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// GDPR note: this table intentionally has no column that could identify a person.
// Don't add one later "just in case" — see the SEO/security/compliance guide.
const DATA_DIR = path.join(process.cwd(), 'data');
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
function ensureColumn(table: string, column: string, definitionSql: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  const exists = columns.some((c) => c.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definitionSql}`);
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
