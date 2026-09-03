// Place at: src/app/api/tracker/verify-receipt/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAttachmentContainer } from "@/lib/blobStorage";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import { convertDisplayToGbp, ALL_CURRENCIES, type Currency } from "@/lib/tracker/currency";
import { logGeminiUsage } from "@/lib/tracker/geminiUsageLog";

export const dynamic = "force-dynamic";

// Reverted to the exact model already proven live in production - see
// receiptParse.ts's GEMINI_MODEL comment. The per-task tier split from
// AI-Models-for-Different-Tasks.docx (this was meant to sit a tier above
// receiptParse.ts's flash-lite) broke real usage on deploy: gemini-2.5-*
// is on Google's deprecation path. Pinned rather than a "-latest" alias,
// which Google could silently repoint at any time.
const GEMINI_MODEL = "gemini-3.5-flash-lite";

// A discrepancy only gets flagged past this margin - rounding and
// currency-conversion noise is expected and shouldn't produce a false
// alarm on an entry that's actually correct.
const COST_TOLERANCE_GBP = 1;
const COST_TOLERANCE_RATIO = 0.03;

const PROMPT = `You are checking a receipt or invoice photo against details someone has already typed in elsewhere. Read the image and respond with ONLY a JSON object (no markdown, no explanation) matching this exact shape:
{
  "cost": the TOTAL amount shown on this receipt, as a plain number with no currency symbol,
  "currency": the ISO currency code this receipt is priced in (e.g. "GBP", "EUR"), your best guess from symbols or text visible, default to "GBP" only if there is genuinely no clue,
  "date": the transaction date as YYYY-MM-DD, your best reading; if genuinely illegible, use today's date
}
Make your best reasonable estimate for every field rather than leaving one out, even if the receipt is imperfectly lit or angled.`;

async function streamToBuffer(readableStream: NodeJS.ReadableStream | undefined): Promise<Buffer> {
  if (!readableStream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Not configured is not an error worth surfacing here - this is a
    // best-effort helper, not a required step, so the form should just
    // carry on without a check rather than showing an alarming failure.
    return NextResponse.json({ discrepancies: [], checked: false });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { blobName, expectedCost, expectedDate } = body as { blobName?: string; expectedCost?: number; expectedDate?: string };
  if (!blobName || expectedCost == null || !expectedDate) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  try {
    const container = await getAttachmentContainer();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    const downloadResponse = await blockBlobClient.download();
    const contentType = downloadResponse.contentType ?? "";

    // PDFs aren't checked in this first version, same scope limit as the
    // dedicated scanner - not an error, just nothing to compare here.
    if (contentType !== "image/jpeg" && contentType !== "image/png") {
      return NextResponse.json({ discrepancies: [], checked: false });
    }

    const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
    const base64 = buffer.toString("base64");

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: contentType, data: base64 } }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!geminiRes.ok) {
      await logGeminiUsage("verifyReceipt", GEMINI_MODEL, false);
      return NextResponse.json({ discrepancies: [], checked: false });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      await logGeminiUsage("verifyReceipt", GEMINI_MODEL, false);
      return NextResponse.json({ discrepancies: [], checked: false });
    }

    let parsed: { cost?: number; currency?: string; date?: string };
    try {
      parsed = JSON.parse(rawText);
      await logGeminiUsage("verifyReceipt", GEMINI_MODEL, true);
    } catch {
      await logGeminiUsage("verifyReceipt", GEMINI_MODEL, false);
      return NextResponse.json({ discrepancies: [], checked: false });
    }

    const detectedCurrency = typeof parsed.currency === "string" ? parsed.currency.toUpperCase() : "GBP";
    const rawCost = typeof parsed.cost === "number" ? parsed.cost : null;
    const receiptDate = typeof parsed.date === "string" ? parsed.date : null;

    const discrepancies: string[] = [];

    if (rawCost != null) {
      let receiptCostGbp = rawCost;
      if (detectedCurrency !== "GBP" && (ALL_CURRENCIES as string[]).includes(detectedCurrency)) {
        const rates = await getExchangeRates();
        receiptCostGbp = convertDisplayToGbp(rawCost, detectedCurrency as Currency, rates);
      }
      const diff = Math.abs(receiptCostGbp - expectedCost);
      const tolerance = Math.max(COST_TOLERANCE_GBP, expectedCost * COST_TOLERANCE_RATIO);
      if (diff > tolerance) {
        discrepancies.push(
          `The receipt appears to show ${rawCost.toFixed(2)} ${detectedCurrency}, which doesn't match the ${expectedCost.toFixed(2)} entered - worth double-checking.`
        );
      }
    }

    if (receiptDate && receiptDate !== expectedDate) {
      discrepancies.push(`The receipt appears to be dated ${receiptDate}, not ${expectedDate} as entered - worth double-checking.`);
    }

    return NextResponse.json({ discrepancies, checked: true });
  } catch {
    // A verification failure is never worth blocking or alarming someone
    // over - it's a best-effort helper, not a required step.
    return NextResponse.json({ discrepancies: [], checked: false });
  }
}
