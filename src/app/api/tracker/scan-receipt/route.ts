// Place at: src/app/api/tracker/scan-receipt/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { getSession } from "@/lib/auth/session";
import { getAttachmentContainer } from "@/lib/blobStorage";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { getServiceRecords, createServiceRecord } from "@/lib/tracker/serviceRecord";
import { getFuelLogs, createFuelLog } from "@/lib/tracker/fuelLog";
import { getMods, createMod } from "@/lib/tracker/mod";
import { getBills, createBill } from "@/lib/tracker/bill";
import { createReminder } from "@/lib/tracker/reminder";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import { convertDisplayToGbp, ALL_CURRENCIES, type Currency } from "@/lib/tracker/currency";
import { estimateMileage, type MileagePoint } from "@/lib/tracker/mileageEstimate";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import { guessJobType, guessModCategory, guessBillType } from "@/lib/tracker/guessCategory";
import { JOB_LABELS, JOB_REMINDER_DEFAULTS } from "@/lib/tracker/jobTypes";
import { BILL_LABELS, BILL_REMINDER_DEFAULTS } from "@/lib/tracker/billTypes";
import { buildAiDescription } from "@/lib/tracker/aiDescription";
import { findPossibleDuplicate, type DuplicateMatch } from "@/lib/tracker/duplicateCheck";
import type { Attachment, CurrencyConversionInfo } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

// Pinned to an explicit model string, deliberately not a "-latest" alias -
// an alias can be repointed by Google at any time with no code change on
// our end, which is exactly the kind of silent behaviour/cost shift a
// production app shouldn't be exposed to.
const GEMINI_MODEL = "gemini-3.5-flash-lite";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);
// PDFs aren't scanned in this first version - Gemini can technically read
// them, but the dominant real case is someone photographing a paper
// receipt, so keeping scope to photos keeps this first version simple.
// A PDF can still be attached manually as before.

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
      "litres": if category is "fuel", the number of litres for this item as a plain number, otherwise null,
      "mileageOnReceipt": if an odometer/mileage reading is printed anywhere on the receipt for this item, that number, otherwise null - do not guess or estimate this, only report a mileage that is actually printed on the receipt
    }
  ]
}
Category guide:
- "service": motorcycle servicing, repairs, or parts fitted as a labour job (oil change, brake pads, tyres, chain, valve clearance, etc.)
- "fuel": a petrol or diesel fill-up
- "mods": accessories, gear, luggage, or electronics bought (not fitted as a labour job)
- "bills": insurance, road tax (VED), or an MOT test
If isReceipt is false, return an empty items array. If the receipt only really contains one purchase, return a single-item array rather than trying to invent a split. If you cannot confidently read a value on a genuine receipt, make your best reasonable estimate rather than leaving it out - every field on every item must have a value, except merchantName/address/city, which should genuinely be null rather than guessed if not visible on the receipt.`;

interface GeminiItem {
  category?: string;
  date?: string;
  cost?: number;
  description?: string;
  litres?: number | null;
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

// The shape returned to the client for every record this scan created -
// exactly the fields the review queue needs to render and PATCH each
// one, not the raw Cosmos doc. A discriminated union on `category` so
// the client can narrow which fields it expects without extra checks.
export type ReviewQueueEntry =
  | { id: string; category: "service"; aiDescription: string; duplicate: DuplicateMatch | null; jobType: string; cost: number; mileage: number; date: string; notes: string }
  | { id: string; category: "fuel"; aiDescription: string; duplicate: DuplicateMatch | null; litres: number; cost: number; mileage: number; date: string; filledToFull: boolean }
  | { id: string; category: "mods"; aiDescription: string; duplicate: DuplicateMatch | null; name: string; modCategory: string; cost: number; mileage: number; date: string; notes: string }
  | { id: string; category: "bills"; aiDescription: string; duplicate: DuplicateMatch | null; billType: string; cost: number; date: string; notes: string };

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Receipt scanning isn't configured yet." }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Only JPG or PNG photos are supported for scanning." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File is too large - 10MB maximum." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  try {
    const originalBuffer = Buffer.from(await file.arrayBuffer());

    // Same compression standard already used for regular attachment
    // uploads - a receipt ends up looking and sizing the same in storage
    // regardless of whether it arrived through scanning or manual upload.
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
      return NextResponse.json({ error: "Could not read the receipt. Please try again or enter it manually." }, { status: 502 });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return NextResponse.json({ error: "Could not read the receipt. Please try again or enter it manually." }, { status: 502 });
    }

    let parsed: GeminiResponse;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Could not read the receipt. Please try again or enter it manually." }, { status: 502 });
    }

    // Refuses outright rather than guessing - no record is ever created
    // from something that isn't actually a receipt.
    if (parsed.isReceipt === false) {
      return NextResponse.json(
        { error: parsed.rejectionReason || "This doesn't look like a receipt or invoice. Please log this entry manually instead." },
        { status: 422 }
      );
    }

    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const validItems = rawItems.filter((item) => item.category && VALID_CATEGORIES.has(item.category));
    if (validItems.length === 0) {
      return NextResponse.json({ error: "Could not work out what kind of expense this is. Please enter it manually." }, { status: 502 });
    }
    const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : null;
    const detectedCurrency = typeof parsed.currency === "string" ? parsed.currency.toUpperCase() : "GBP";
    const merchantName = typeof parsed.merchantName === "string" && parsed.merchantName.trim() ? parsed.merchantName.trim() : null;
    const receiptAddress = typeof parsed.address === "string" && parsed.address.trim() ? parsed.address.trim() : null;
    const receiptCity = typeof parsed.city === "string" && parsed.city.trim() ? parsed.city.trim() : null;

    // Upload the same compressed image once - it's shared as the
    // attachment across every item split out of this one receipt, since
    // they're all proof of the same physical piece of paper.
    const blobName = `${randomBytes(24).toString("base64url")}.jpg`;
    const container = await getAttachmentContainer();
    const blockBlobClient = container.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(compressed, { blobHTTPHeaders: { blobContentType: "image/jpeg" } });

    const attachment: Attachment = {
      blobName,
      fileName: file.name || "receipt.jpg",
      fileType: "image/jpeg",
      uploadedAt: new Date().toISOString(),
    };

    // Gather every real, previously-logged mileage point for this bike -
    // across Service, Fuel, and Mods (Bills never carry mileage) - as
    // the input to the deterministic interpolation/extrapolation in
    // mileageEstimate.ts. Only fetched once per scan, reused for every
    // item on the receipt. The same four arrays double as the duplicate-
    // detection candidate pool below - fetched once, not re-queried per
    // item.
    const [existingRecords, existingFuelLogs, existingMods, existingBills] = await Promise.all([
      getServiceRecords(session.email, bike.id),
      getFuelLogs(session.email, bike.id),
      getMods(session.email, bike.id),
      getBills(session.email, bike.id),
    ]);
    const knownMileagePoints: MileagePoint[] = [
      ...existingRecords.map((r) => ({ date: r.date, mileage: r.mileage })),
      ...existingFuelLogs.map((r) => ({ date: r.date, mileage: r.mileage })),
      ...existingMods.map((r) => ({ date: r.date, mileage: r.mileage })),
    ];

    const rates = await getExchangeRates();
    const currencySupported = (ALL_CURRENCIES as string[]).includes(detectedCurrency);

    const createdCategories: string[] = [];
    let skippedBeforeProduction = 0;
    // Full detail on every record actually created by this file, for the
    // review queue on the client - not just counts, and not a second
    // fetch (there's no GET-by-id route for these), so this response IS
    // the queue's only data source. duplicate is filled in when this
    // item looks like it might already be logged.
    const createdEntries: ReviewQueueEntry[] = [];

    for (const item of validItems) {
      // Same rule already enforced on the manual forms: servicing, fuel,
      // and bills all require the bike to physically exist, so a date
      // before its production year is refused outright rather than
      // creating a nonsensical record. Mods are exempt, same as
      // everywhere else - buying gear ahead of a bike's delivery is a
      // genuine, normal thing people do.
      if (item.category !== "mods" && isBeforeProduction(item.date ?? "", bike)) {
        skippedBeforeProduction++;
        continue;
      }
      const date = item.date ?? new Date().toISOString().slice(0, 10);
      const rawCost = typeof item.cost === "number" ? item.cost : 0;
      const description = item.description ?? "";

      // Cost conversion - reuses the exact same GBP-based converter
      // already used everywhere else in the app, just pointed at
      // whatever currency the AI identified on the receipt instead of
      // the account's own display-currency preference. Every stored
      // cost is GBP regardless; currencyConversion is purely a record of
      // what happened, kept alongside the entry for transparency.
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
          // Not one of the currencies this app has exchange rates for -
          // the number is stored as-is (effectively treated as GBP),
          // which is very likely wrong, so this is flagged hard for the
          // person to fix themselves rather than silently guessing.
          forceReview = true;
        }
      }

      // Mileage: a figure actually printed on the receipt always wins
      // and is treated as exact - no confidence flag at all, same as a
      // manually-typed mileage. Otherwise, the deterministic estimator
      // runs, and its confidence level is stored and shown, forever,
      // rather than ever being presented as if it were exact.
      let mileage: number | undefined;
      let mileageConfidence: "interpolated" | "estimated" | undefined;
      if (item.category !== "bills") {
        if (typeof item.mileageOnReceipt === "number" && item.mileageOnReceipt > 0) {
          mileage = Math.round(item.mileageOnReceipt);
        } else {
          const estimate = estimateMileage(date, knownMileagePoints, {
            startingMileage: bike.startingMileage,
            currentMileage: bike.currentMileage,
            dateAdded: bike.dateAdded,
          });
          mileage = estimate.mileage;
          mileageConfidence = estimate.confidence;
        }
      }

      if (item.category === "service") {
        const jobType = guessJobType(description) ?? "other";
        const notes = forceReview ? `${description} (currency could not be auto-converted - please check the amount)` : description;
        const jobLabel = JOB_LABELS[jobType] ?? jobType;
        const aiDescription = buildAiDescription({ description: jobLabel, merchantName, address: receiptAddress, city: receiptCity, categoryLabel: "Service" });
        const duplicate = findPossibleDuplicate(
          date,
          costGbp,
          existingRecords.map((r) => ({ id: r.id, date: r.date, cost: r.cost, description: JOB_LABELS[r.jobType] ?? r.jobType }))
        );
        const record = await createServiceRecord(session.email, {
          bikeId: bike.id,
          jobType,
          cost: costGbp,
          mileage: mileage ?? bike.currentMileage,
          date,
          notes,
          attachments: [attachment],
          needsReview: true,
          currencyConversion,
          mileageConfidence,
          aiDescription,
        });
        createdEntries.push({
          id: record.id, category: "service", aiDescription, duplicate,
          jobType, cost: costGbp, mileage: mileage ?? bike.currentMileage, date, notes,
        });
        const reminderDefault = JOB_REMINDER_DEFAULTS[jobType];
        if (reminderDefault) {
          await createReminder(session.email, {
            bikeId: bike.id,
            name: JOB_LABELS[jobType] ?? jobType,
            intervalType: reminderDefault.type,
            intervalValue: reminderDefault.value,
            baseMileage: mileage ?? bike.currentMileage,
            date,
            sourceKey: `service:${jobType}`,
          });
        }
        createdCategories.push("service");
      } else if (item.category === "fuel") {
        const aiDescription = buildAiDescription({ description: description || "Fuel", merchantName, address: receiptAddress, city: receiptCity, categoryLabel: "Fuel" });
        const duplicate = findPossibleDuplicate(
          date,
          costGbp,
          existingFuelLogs.map((f) => ({ id: f.id, date: f.date, cost: f.cost, description: `${f.litres.toFixed(1)}L fill-up` }))
        );
        const record = await createFuelLog(session.email, {
          bikeId: bike.id,
          litres: typeof item.litres === "number" ? item.litres : 0,
          cost: costGbp,
          mileage: mileage ?? bike.currentMileage,
          date,
          filledToFull: true,
          attachments: [attachment],
          needsReview: true,
          currencyConversion,
          mileageConfidence,
          aiDescription,
        });
        createdEntries.push({
          id: record.id, category: "fuel", aiDescription, duplicate,
          litres: typeof item.litres === "number" ? item.litres : 0,
          cost: costGbp, mileage: mileage ?? bike.currentMileage, date, filledToFull: true,
        });
        createdCategories.push("fuel");
      } else if (item.category === "mods") {
        const modCategory = guessModCategory(description) ?? "other-accessory";
        const modNotes = forceReview ? "Currency could not be auto-converted - please check the amount" : "";
        const aiDescription = buildAiDescription({ description, merchantName, address: receiptAddress, city: receiptCity, categoryLabel: "Parts & Accessories" });
        const duplicate = findPossibleDuplicate(
          date,
          costGbp,
          existingMods.map((m) => ({ id: m.id, date: m.date, cost: m.cost, description: m.name }))
        );
        const record = await createMod(session.email, {
          bikeId: bike.id,
          category: modCategory,
          name: description,
          cost: costGbp,
          mileage: mileage ?? bike.currentMileage,
          date,
          notes: modNotes,
          attachments: [attachment],
          needsReview: true,
          currencyConversion,
          mileageConfidence,
          aiDescription,
        });
        createdEntries.push({
          id: record.id, category: "mods", aiDescription, duplicate,
          name: description, modCategory, cost: costGbp, mileage: mileage ?? bike.currentMileage, date, notes: modNotes,
        });
        createdCategories.push("mods");
      } else {
        const billType = guessBillType(description) ?? "insurance";
        const billNotes = forceReview ? `${description} (currency could not be auto-converted - please check the amount)` : description;
        const billLabel = BILL_LABELS[billType] ?? billType;
        const aiDescription = buildAiDescription({ description: billLabel, merchantName, address: receiptAddress, city: receiptCity, categoryLabel: "Insurance, tax & MOT" });
        const duplicate = findPossibleDuplicate(
          date,
          costGbp,
          existingBills.map((b) => ({ id: b.id, date: b.date, cost: b.cost, description: BILL_LABELS[b.billType] ?? b.billType }))
        );
        const record = await createBill(session.email, {
          bikeId: bike.id,
          billType,
          cost: costGbp,
          date,
          notes: billNotes,
          attachments: [attachment],
          needsReview: true,
          currencyConversion,
          aiDescription,
        });
        createdEntries.push({
          id: record.id, category: "bills", aiDescription, duplicate,
          billType, cost: costGbp, date, notes: billNotes,
        });
        const reminderDefault = BILL_REMINDER_DEFAULTS[billType];
        if (reminderDefault) {
          await createReminder(session.email, {
            bikeId: bike.id,
            name: `${BILL_LABELS[billType] ?? billType} renewal`,
            intervalType: reminderDefault.type,
            intervalValue: reminderDefault.value,
            baseMileage: bike.currentMileage,
            date,
            sourceKey: `bill:${billType}`,
          });
        }
        createdCategories.push("bills");
      }
    }

    if (createdCategories.length === 0) {
      return NextResponse.json(
        { error: `This receipt is dated before ${bike.year}, when this bike was made - it couldn't have happened yet, so nothing was logged.` },
        { status: 422 }
      );
    }

    return NextResponse.json({
      createdCount: validItems.length - skippedBeforeProduction,
      categories: [...new Set(createdCategories)],
      summary,
      skippedBeforeProduction,
      createdEntries,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Something went wrong scanning the receipt. Please try again or enter it manually.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
