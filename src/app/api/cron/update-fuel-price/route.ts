// Place at: src/app/api/cron/update-fuel-price/route.ts
import { NextRequest, NextResponse } from "next/server";
import { saveCurrentPetrolPrice } from "@/lib/fuelPrice";

export const dynamic = "force-dynamic";

const STATS_PAGE_URL = "https://www.gov.uk/government/statistics/weekly-road-fuel-prices";

// GOV.UK's filename convention has changed at least once already - this
// used to be a new, date-stamped file every week
// (weekly_road_fuel_prices_DDMMYY.csv), and is now a single,
// continuously-updated file covering the whole historical range
// instead (currently CSV__2018_-__.csv, labelled "2018 to 2026" on the
// page - that end year will keep advancing). Matching any .csv under
// their standard asset-hosting path, rather than a specific filename,
// is what survives a rename like that instead of breaking on it again.
// The current-range file is consistently the first .csv link on the
// page, ahead of the older historical archive (currently "2003 to
// 2017"), which is what makes the first match still the right one to
// take - same strategy the original version relied on, just not tied
// to a filename that turned out not to be permanent.
function extractCsvUrl(html: string): string | null {
  const match = html.match(
    /https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[a-zA-Z0-9]+\/[a-zA-Z0-9_.-]+\.csv/
  );
  return match ? match[0] : null;
}

// DD/MM/YYYY specifically, as DESNZ publishes it - never handed to
// new Date() directly, since that's ambiguous between DD/MM and MM/DD
// depending on the JS engine's locale handling, and this is exactly
// the kind of silent misparse that would corrupt every date derived
// from it downstream without ever throwing an error to catch it.
function parseUkDate(value: string): Date | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

const MAX_PLAUSIBLE_AGE_DAYS = 30;

function extractLatestPetrolPrice(
  csvText: string
): { price: number; weekCommencing: string } | null {
  // Strip a possible leading BOM, split into lines, drop the header,
  // and take the last non-empty line - the CSV is in chronological order.
  const cleaned = csvText.replace(/^\uFEFF/, "").trim();
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const lastLine = lines[lines.length - 1];
  const columns = lastLine.split(",");
  // Columns: Date, ULSP pence/litre, ULSD pence/litre, ...
  const weekCommencing = columns[0]?.trim();
  const price = Number(columns[1]);

  if (!weekCommencing || !Number.isFinite(price)) return null;

  // Catches the file-identity mistake this endpoint has already made
  // once (matching the CSV covering 2018-2026 versus the historical
  // 2003-2017 archive sitting on the same page) without needing to
  // know in advance which specific mistake to guard against - any
  // result claiming to be the current week but actually years stale
  // gets rejected the same way, rather than silently accepted and
  // written over a genuinely current stored price.
  const parsedDate = parseUkDate(weekCommencing);
  if (!parsedDate) return null;
  const ageDays = (Date.now() - parsedDate.getTime()) / 86_400_000;
  if (ageDays > MAX_PLAUSIBLE_AGE_DAYS || ageDays < -7) return null;

  return { price, weekCommencing };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pageResponse = await fetch(STATS_PAGE_URL);
    if (!pageResponse.ok) {
      return NextResponse.json({ error: "Could not load statistics page" }, { status: 502 });
    }
    const html = await pageResponse.text();

    const csvUrl = extractCsvUrl(html);
    if (!csvUrl) {
      return NextResponse.json({ error: "Could not find CSV link on page" }, { status: 502 });
    }

    const csvResponse = await fetch(csvUrl);
    if (!csvResponse.ok) {
      return NextResponse.json({ error: "Could not download CSV" }, { status: 502 });
    }
    const csvText = await csvResponse.text();

    const latest = extractLatestPetrolPrice(csvText);
    if (!latest) {
      return NextResponse.json({ error: "Could not parse latest price from CSV" }, { status: 502 });
    }

    await saveCurrentPetrolPrice(latest.price, latest.weekCommencing);

    return NextResponse.json({
      ok: true,
      pricePenceLitre: latest.price,
      weekCommencing: latest.weekCommencing,
    });
  } catch {
    return NextResponse.json({ error: "Unexpected error updating fuel price" }, { status: 500 });
  }
}
