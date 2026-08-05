// Place at: src/lib/tracker/receiptParse.ts
//
// Phase 1 of scanning: read a receipt photo and turn it into structured
// data. Deliberately touches the database for nothing except uploading
// the photo itself (needed either way, and shared per-file rather than
// per-item) - no mileage estimate, no record creation. That's Phase 2,
// in commit-receipt-items/route.ts, which needs the WHOLE batch sorted
// into true chronological order first - estimating or creating anything
// here, one file at a time in upload order, is exactly what caused
// unrelated receipts years apart to collapse onto the same placeholder
// mileage.

import { randomBytes } from "crypto";
import sharp from "sharp";
import { getAttachmentContainer } from "@/lib/blobStorage";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import { convertDisplayToGbp, ALL_CURRENCIES, type Currency } from "@/lib/tracker/currency";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import type { Attachment, CurrencyConversionInfo } from "@/lib/tracker/cosmosHelpers";
import type { BikeDoc } from "@/lib/tracker/bike";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);

const PROMPT = `You are extracting structured data from a photo that is claimed to be a UK motorcycle-related receipt or invoice. First, check whether the image genuinely looks like a receipt or invoice at all (a till receipt, an emailed/printed invoice, a garage work order, etc.) - not a random photo of something else. Then, this receipt may contain ONE purchase, or it may contain SEVERAL distinct items that belong to different categories (for example, an oil change AND a padlock bought at the same garage visit, or fuel AND a snack). Respond with ONLY a JSON object (no markdown, no explanation) matching this exact shape:
{
  "isReceipt": true or false - false if the image clearly isn't a receipt/invoice of any kind,
  "rejectionReason": if isReceipt is false, a short (max 15 words) plain explanation of why (e.g. "This looks like a photo of a motorcycle, not a receipt."), otherwise null,
  "summary": a single brief sentence (max ~20 words) confirming what this receipt/invoice actually is - the business or petrol station name if visible, the country if you can tell, and the date. Written for a human to quickly confirm "yes, that's the right receipt". If something isn't legible, say so briefly rather than guessing confidently. Only relevant if isReceipt is true, otherwise null.,
  "currency": the ISO currency code this receipt is priced in (e.g. "GBP", "EUR", "PLN"), based on symbols or text visible on the receipt - your best guess, default to "GBP" only if there is genuinely no clue at all. Only relevant if isReceipt is true, otherwise null.,
  "merchantName": the name of the business/garage/petrol station this receipt is from, if visible - otherwise null. Only relevant if isReceipt is true.,
  "address": the street address printed on the receipt, if visible (e.g. "14 High Street") - otherwise null. Only relevant if isReceipt is true.,
  "city": the town or city printed on the receipt, if visible - otherwise null. Only relevant if isReceipt is true.,
  "items": [
    {
      "category": one of "service", "fuel", "mods", "bills",
      "date": the transaction date as YYYY-MM-DD (your best reading of the receipt; if genuinely illegible, use today's date),
      "cost": the cost of just THIS item, in whatever currency you identified above, as a plain number with no currency symbol - not the receipt's grand total, unless there is genuinely only one item,
      "description": a short (max 6 words) plain-English description of this specific item,
      "litres": if category is "fuel" AND you can genuinely read a litres figure, that number as a plain number - otherwise null. Do not guess a number here; a fuel entry with no readable litres is skipped entirely by the caller rather than logged with a made-up amount, so returning null when you're not confident is the correct, safe answer, not a failure.,
      "fuelType": if category is "fuel", your best read of the fuel type from wording on the receipt (e.g. "unleaded", "premium", "diesel", "super") - one of "petrol", "diesel", "other" (anything that isn't fuel for an engine, e.g. AdBlue). If there's truly no indication either way, use "petrol", since that's overwhelmingly the common case for a UK motorcycle receipt with no fuel-type wording at all. Otherwise null.,
      "mileageOnReceipt": an odometer/mileage reading, ONLY if you are genuinely confident a specific number on this receipt represents the bike's mileage - e.g. explicit wording like "mileage:", "odometer:", "miles:", or a number clearly logged against a service/inspection for that reason. Do NOT return a number just because it looks plausible as a mileage - order numbers, invoice numbers, part/SKU codes, phone numbers, postcodes, prices, and quantities all commonly appear on receipts and are NOT mileage readings even when they happen to be a few digits long. If there is no clearly-labelled mileage/odometer figure, or if you are not confident, return null rather than guessing - a missing value is far better than a wrong one, since a fallback estimate is used instead when this is null.
    }
  ]
}
Category guide:
- "service": motorcycle servicing, repairs, or parts fitted as a labour job (oil change, brake pads, tyres, chain, valve clearance, etc.)
- "fuel": a petrol or diesel fill-up
- "mods": accessories, gear, luggage, or electronics bought (not fitted as a labour job)
- "bills": insurance, road tax (VED), or an MOT test
If isReceipt is false, return an empty items array. If the receipt only really contains one purchase, return a single-item array rather than trying to invent a split. If you cannot confidently read a value on a genuine receipt, make your best reasonable estimate rather than leaving it out - every field on every item must have a value, except merchantName/address/city (genuinely null if not visible) and litres (genuinely null if you can't read it - see above).`;

interface GeminiItem {
  category?: string;
  date?: string;
  cost?: number;
  description?: string;
  litres?: number | null;
  fuelType?: "petrol" | "diesel" | "other" | null;
  mileageOnReceipt?: number | null;
}

interface GeminiResponse {
  isReceipt?: boolean;
  rejectionReason?: string;
  summary?: string;
  currency?: string;
  merchantName?: string | null;
  address?: string | null;
  city?: string | null;
  items?: GeminiItem[];
}

const VALID_CATEGORIES = new Set(["service", "fuel", "mods", "bills"]);

export interface ParsedReceiptItem {
  fileName: string;
  category: "service" | "fuel" | "mods" | "bills";
  date: string;
  costGbp: number;
  description: string;
  litres: number | null;
  mileageOnReceipt: number | null;
  merchantName: string | null;
  address: string | null;
  city: string | null;
  attachment: Attachment;
  currencyConversion?: CurrencyConversionInfo;
  forceReview: boolean;
}

export type ParseReceiptResult =
  | {
      ok: true;
      fileName: string;
      summary: string | null;
      items: ParsedReceiptItem[];
      skippedBeforeProduction: number;
      skippedNonPetrol: number;
      skippedUnreadableLitres: number;
    }
  | { ok: false; fileName: string; error: string; status: number };

export async function parseReceiptFile(file: File, apiKey: string, bike: BikeDoc): Promise<ParseReceiptResult> {
  const fileName = file.name || "receipt.jpg";

  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, fileName, error: "Only JPG or PNG photos are supported for scanning.", status: 400 };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, fileName, error: "File is too large - 10MB maximum.", status: 400 };
  }

  try {
    const originalBuffer = Buffer.from(await file.arrayBuffer());
    const compressed = await sharp(originalBuffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const base64 = compressed.toString("base64");

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: "image/jpeg", data: base64 } }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!geminiRes.ok) {
      return { ok: false, fileName, error: "Could not read the receipt. Please try again or enter it manually.", status: 502 };
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return { ok: false, fileName, error: "Could not read the receipt. Please try again or enter it manually.", status: 502 };
    }

    let parsed: GeminiResponse;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return { ok: false, fileName, error: "Could not read the receipt. Please try again or enter it manually.", status: 502 };
    }

    if (parsed.isReceipt === false) {
      return {
        ok: false,
        fileName,
        error: parsed.rejectionReason || "This doesn't look like a receipt or invoice. Please log this entry manually instead.",
        status: 422,
      };
    }

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const validItems = rawItems.filter((item) => item.category && VALID_CATEGORIES.has(item.category));
    if (validItems.length === 0) {
      return { ok: false, fileName, error: "Could not work out what kind of expense this is. Please enter it manually.", status: 502 };
    }

    const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : null;
    const detectedCurrency = typeof parsed.currency === "string" ? parsed.currency.toUpperCase() : "GBP";
    const merchantName = typeof parsed.merchantName === "string" && parsed.merchantName.trim() ? parsed.merchantName.trim() : null;
    const address = typeof parsed.address === "string" && parsed.address.trim() ? parsed.address.trim() : null;
    const city = typeof parsed.city === "string" && parsed.city.trim() ? parsed.city.trim() : null;

    // Uploaded once per file, shared as the attachment across every item
    // split out of this one receipt - they're all proof of the same
    // physical piece of paper.
    const blobName = `${randomBytes(24).toString("base64url")}.jpg`;
    const container = await getAttachmentContainer();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(compressed, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });
    const attachment: Attachment = { blobName, fileName, fileType: "image/jpeg", uploadedAt: new Date().toISOString() };

    const rates = await getExchangeRates();
    const currencySupported = (ALL_CURRENCIES as string[]).includes(detectedCurrency);

    const items: ParsedReceiptItem[] = [];
    let skippedBeforeProduction = 0;
    let skippedNonPetrol = 0;
    let skippedUnreadableLitres = 0;

    for (const item of validItems) {
      const category = item.category as "service" | "fuel" | "mods" | "bills";
      const date = item.date ?? new Date().toISOString().slice(0, 10);

      if (category !== "mods" && isBeforeProduction(date, bike)) {
        skippedBeforeProduction++;
        continue;
      }

      // Motorcycles run on petrol - a diesel (or other non-fuel-for-an-
      // engine) receipt is refused outright rather than logged, since
      // it almost certainly belongs to a different vehicle entirely.
      if (category === "fuel" && item.fuelType === "diesel") {
        skippedNonPetrol++;
        continue;
      }
      if (category === "fuel" && item.fuelType === "other") {
        skippedNonPetrol++;
        continue;
      }

      // A fuel entry with an unreadable litres figure used to silently
      // default to 0 - nonsensical (an "Infinity per litre" fuel
      // purchase), and it corrupts the MPG chain for every segment that
      // touches it. Skipped rather than guessed, same principle as
      // mileage: a missing value the person fills in themselves beats a
      // fabricated one every time.
      if (category === "fuel" && (typeof item.litres !== "number" || !(item.litres > 0))) {
        skippedUnreadableLitres++;
        continue;
      }

      const rawCost = typeof item.cost === "number" ? item.cost : 0;
      let costGbp = rawCost;
      let currencyConversion: CurrencyConversionInfo | undefined;
      let forceReview = false;
      if (detectedCurrency !== "GBP") {
        if (currencySupported && rates) {
          costGbp = convertDisplayToGbp(rawCost, detectedCurrency as Currency, rates);
          const rate = rates.rates[detectedCurrency];
          if (rate) {
            currencyConversion = { originalCurrency: detectedCurrency, originalAmount: rawCost, rate, ratedAt: rates.fetchedAt };
          }
        } else {
          forceReview = true;
        }
      }

      items.push({
        fileName,
        category,
        date,
        costGbp,
        description: item.description ?? "",
        litres: category === "fuel" ? (item.litres as number) : null,
        mileageOnReceipt: typeof item.mileageOnReceipt === "number" && item.mileageOnReceipt > 0 ? Math.round(item.mileageOnReceipt) : null,
        merchantName,
        address,
        city,
        attachment,
        currencyConversion,
        forceReview,
      });
    }

    return { ok: true, fileName, summary, items, skippedBeforeProduction, skippedNonPetrol, skippedUnreadableLitres };
  } catch (err) {
    return {
      ok: false,
      fileName,
      error: "Something went wrong reading the receipt. Please try again or enter it manually.",
      status: 500,
    };
  }
}
