// Place at: src/app/api/cron/update-fuel-price/route.ts
import { NextRequest, NextResponse } from "next/server";
import { saveCurrentPetrolPrice } from "@/lib/fuelPrice";

export const dynamic = "force-dynamic";

const STATS_PAGE_URL = "https://www.gov.uk/government/statistics/weekly-road-fuel-prices";

function extractCsvUrl(html: string): string | null {
  const match = html.match(
    /https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[a-zA-Z0-9]+\/weekly_road_fuel_prices_\d{6}\.csv/
  );
  return match ? match[0] : null;
}

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
