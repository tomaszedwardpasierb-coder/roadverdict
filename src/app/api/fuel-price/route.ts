// Place at: src/app/api/fuel-price/route.ts
//
// This week's UK average pump prices, for the MPG calculator's cost per
// mile. The public page is static, so it asks here once it's loaded
// rather than baking a price into its HTML at build time. Public and the
// same for everyone, and it only changes weekly (see the update-fuel-price
// cron), so shared caches are welcome to keep it for an hour.
import { NextResponse } from "next/server";
import { getCurrentUkFuelPrices } from "@/lib/fuelPrice";

export const dynamic = "force-dynamic";

export async function GET() {
  const prices = await getCurrentUkFuelPrices();
  return NextResponse.json(
    {
      ...prices,
      source: "DESNZ weekly road fuel prices",
      sourceUrl: "https://www.gov.uk/government/statistics/weekly-road-fuel-prices",
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}
