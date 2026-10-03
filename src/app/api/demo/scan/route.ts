// Place at: src/app/api/demo/scan/route.ts
//
// The public sample-bike demo's receipt step: reads one receipt photo with
// the same AI as the real scan, for anyone, no account. The file is read
// and thrown away - nothing is stored (parseReceiptFile with store: false),
// no record is created, and only the readable details come back. Limited per
// visitor and across the site (lib/demo/demoUsage.ts) because every read
// costs an AI call; /tomasz's funnel counts how many happen.
import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/auth/signInRateLimit";
import { recordFunnelStep, isLikelyBot } from "@/lib/analytics/funnel";
import { parseReceiptFile, type ScanVehicle } from "@/lib/tracker/receiptParse";
import { DEMO_MESSAGES, demoEnabled, takeDemoUse } from "@/lib/demo/demoUsage";
import { SAMPLE_BIKE } from "@/lib/demo/sampleBike";

export const dynamic = "force-dynamic";

// Only what the receipt parser reads of a vehicle: the sample bike.
const SAMPLE_VEHICLE = { type: "bike", year: 2019, isCustomBuild: false, make: "Yamaha", model: SAMPLE_BIKE.name } as unknown as ScanVehicle;

export async function POST(request: NextRequest) {
  if (!demoEnabled()) return NextResponse.json({ error: DEMO_MESSAGES.disabled }, { status: 503 });
  if (isLikelyBot(request.headers.get("user-agent"))) return NextResponse.json({ error: "Not available." }, { status: 403 });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Receipt scanning isn't available right now." }, { status: 503 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });

  const use = await takeDemoUse("scan", getClientIp(request));
  if (use !== "ok") return NextResponse.json({ error: DEMO_MESSAGES[use] }, { status: 429 });

  const result = await parseReceiptFile(file, apiKey, SAMPLE_VEHICLE, { store: false, escalate: false });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  if (result.items.length === 0) {
    return NextResponse.json({ error: "Nothing usable was found on that receipt. Try the sample receipt, or a clearer photo." }, { status: 422 });
  }

  void recordFunnelStep("demo_scanned");
  return NextResponse.json({
    summary: result.summary,
    items: result.items.slice(0, 8).map((item) => ({
      category: item.category,
      date: item.date,
      costGbp: item.costGbp,
      description: item.description,
      litres: item.litres,
      mileageOnReceipt: item.mileageOnReceipt,
      merchantName: item.merchantName,
    })),
  });
}
