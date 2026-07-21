// Place at: src/app/api/cron/update-exchange-rates/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { ALL_CURRENCIES } from "@/lib/tracker/currency";

export const dynamic = "force-dynamic";

interface FrankfurterRow {
  quote: string;
  rate: number;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const targets = ALL_CURRENCIES.filter((c) => c !== "GBP").join(",");
    const res = await fetch(`https://api.frankfurter.dev/v2/rates?base=GBP&quotes=${targets}`);
    if (!res.ok) {
      throw new Error(`Frankfurter returned ${res.status}`);
    }

    // v2/rates returns a flat array - one row per quote, e.g.
    // [{ quote: "EUR", rate: 1.15 }, ...] - not an object with a
    // .rates property like most exchange-rate APIs. Confirmed directly
    // against Frankfurter's own docs before writing this, since
    // guessing the shape here would have failed silently.
    const rows: FrankfurterRow[] = await res.json();
    const rates: Record<string, number> = {};
    for (const row of rows) {
      rates[row.quote] = row.rate;
    }

    const container = getContainer();
    await container.items.upsert({
      id: "exchangeRates",
      pk: "system",
      type: "exchangeRates",
      base: "GBP",
      rates,
      fetchedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, rates });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch exchange rates", detail: String(err) }, { status: 500 });
  }
}
