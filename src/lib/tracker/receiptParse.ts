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
import { matchesDeclaredFileType, type SniffableFileType } from "@/lib/tracker/fileSignature";
import { logGeminiUsage } from "@/lib/tracker/geminiUsageLog";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";
import type { Attachment, CurrencyConversionInfo } from "@/lib/tracker/cosmosHelpers";
import type { BikeDoc } from "@/lib/tracker/bike";
import type { CarDoc } from "@/lib/tracker/car";
import { JOB_LABELS } from "@/lib/tracker/jobTypes";
import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";

export type ScanVehicle = BikeDoc | CarDoc;
export type VehicleKind = "motorcycle" | "car";

export function vehicleKindOf(vehicle: ScanVehicle): VehicleKind {
  return vehicle.type === "bike" ? "motorcycle" : "car";
}

// Pinned to the exact model already proven live in production - the
// gemini-2.5-* family this app briefly moved to (per
// AI-Models-for-Different-Tasks.docx) turned out to already be on
// Google's deprecation path (2.5 Flash/Flash-Lite shutting down October
// 2026, with some accounts reportedly losing access even earlier than
// that date) and broke real usage immediately on deploy. Reverted here
// rather than guessing another exact model string blind - the Gemini
// model line-up is moving fast enough that a guess isn't safe without
// verifying it against a real API key first.
const GEMINI_MODEL = "gemini-3.5-flash-lite";
// Escalation path for the ambiguous minority (Stage 3 in the doc above):
// the flash-lite pass can self-report low confidence, in which case the
// SAME receipt is re-read once before anything is shown to the person -
// not on every upload, only when the first pass wasn't sure. Re-reads
// with the same pinned model for now (see GEMINI_MODEL above) rather
// than a separate, unverified "stronger" model - a second, independent
// look still catches a one-off misread even without a genuine model-
// tier upgrade, and this can be pointed at a verified stronger model
// later once one's actually confirmed live.
const GEMINI_ESCALATION_MODEL = GEMINI_MODEL;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
// Longer than fetchWithTimeout's own 15s default - this call sends an
// inline image/PDF for vision inference, not a small text completion, so
// it genuinely needs more time before a slow-but-successful read is
// mistaken for a hang.
const GEMINI_VISION_TIMEOUT_MS = 30_000;

// Only the handful of spots that are genuinely vehicle-specific are
// parametrised - the rest of the prompt (JSON shape, field-by-field
// guidance, the illegible-value fallback rule) is identical either way,
// so it stays one shared template rather than two near-duplicate ~50-
// line strings that could quietly drift apart.
function buildPrompt(vehicleKind: VehicleKind): string {
  const noun = vehicleKind === "motorcycle" ? "motorcycle" : "car";
  const ridingOrDriving = vehicleKind === "motorcycle" ? "riding" : "driving";
  const serviceExamples =
    vehicleKind === "motorcycle"
      ? "oil change, brake pads, tyres, chain, valve clearance, etc."
      : "oil change, brake pads, tyres, cambelt, clutch, etc.";
  // Petrol genuinely is the overwhelming default for a UK motorcycle
  // with no fuel-type wording at all - it is NOT for a car (diesel is
  // common too), so that reasoning would be actively misleading here.
  // fuelType is only ever used to decide whether a fuel item gets
  // skipped as "not this vehicle's fuel" (see parseReceiptFile below) -
  // for a car, nothing is skipped on fuel type alone, so an unclear
  // guess costs nothing either way.
  const fuelTypeFallback =
    vehicleKind === "motorcycle"
      ? `If there's truly no indication either way, use "petrol", since that's overwhelmingly the common case for a UK motorcycle receipt with no fuel-type wording at all.`
      : `If there's truly no indication either way, use "petrol" as a neutral placeholder - this only affects motorcycle receipts, so an unclear guess here never changes whether a car's fuel entry gets logged.`;
  // The logbook's own job names, so a service item comes back named the
  // way guessJobType/guessCarJobType can match exactly - each job type
  // carries its own reminder, which is why one job must stay one item.
  const jobNames = Object.values(vehicleKind === "motorcycle" ? JOB_LABELS : CAR_JOB_LABELS)
    .filter((label) => label !== "Other")
    .map((label) => `"${label}"`)
    .join(", ");

  return `You are extracting structured data from a photo that is claimed to be a UK ${noun}-related receipt or invoice. First, check whether the image genuinely looks like a receipt or invoice at all (a till receipt, an emailed/printed invoice, a garage work order, etc.) - not a random photo of something else. Then read it as JOBS, not lines: a garage invoice usually lists one job across many lines (labour, oil, filters, plugs, adjustments), and that is ONE item. A receipt only has several items when it covers genuinely separate things (for example, a service AND a pair of tyres, an MOT test AND a repair, or fuel AND a snack). Respond with ONLY a JSON object (no markdown, no explanation) matching this exact shape:
{
  "isReceipt": true or false - false if the image clearly isn't a receipt/invoice of any kind,
  "rejectionReason": if isReceipt is false, a short (max 15 words) plain explanation of why (e.g. "This looks like a photo of a motorcycle, not a receipt."), otherwise null,
  "lowConfidence": true or false - true if you are meaningfully unsure about the category, cost, date, or any other field you're returning on this receipt, because of poor image quality, ambiguous or contradictory wording, or genuinely illegible handwriting. false if you're reasonably confident in every item you're returning. When unsure whether you're unsure, prefer true - a second, more careful read is cheap; a wrong figure silently logged is not. Only relevant if isReceipt is true, otherwise false.,
  "summary": a single brief sentence (max ~20 words) confirming what this receipt/invoice actually is - the business or petrol station name if visible, the country if you can tell, and the date. Written for a human to quickly confirm "yes, that's the right receipt". If something isn't legible, say so briefly rather than guessing confidently. Only relevant if isReceipt is true, otherwise null.,
  "currency": the ISO currency code this receipt is priced in (e.g. "GBP", "EUR", "PLN"), based on symbols or text visible on the receipt - your best guess, default to "GBP" only if there is genuinely no clue at all. Only relevant if isReceipt is true, otherwise null.,
  "merchantName": the name of the business/garage/petrol station this receipt is from, if visible - otherwise null. Only relevant if isReceipt is true.,
  "address": the street address printed on the receipt, if visible (e.g. "14 High Street") - otherwise null. Only relevant if isReceipt is true.,
  "city": the town or city printed on the receipt, if visible - otherwise null. Only relevant if isReceipt is true.,
  "vehicleMakeOnReceipt": the ${noun}'s make/brand, ONLY if this specific receipt or invoice explicitly states which vehicle it is FOR (e.g. a garage invoice header reading "Vehicle: Honda CB500F", or a work order listing the customer's vehicle) - do NOT return a brand name that just happens to appear as the shop's own name, a parts manufacturer, or an unrelated product on the receipt (e.g. a shop called "Royal Enfield of Manchester", or a "Yamaha" branded oil filter bought for a different vehicle, do not count - only the vehicle the invoice is actually about). This is genuinely rare - most receipts (fuel, parts, tax, insurance) never state it at all. Otherwise null. Only relevant if isReceipt is true.,
  "vehicleModelOnReceipt": the specific model, ONLY if named alongside the make above in that same "this is the vehicle" context (e.g. "CB500F", "Meteor 350") - otherwise null. Only relevant if isReceipt is true.,
  "mileage": the ${noun}'s odometer reading, ONLY if the receipt shows one clearly labelled as such (e.g. "Mileage: 12,480", "Odometer", "Miles in", "Odo") - the number exactly as printed, as a plain number. Garage invoices often print it with the vehicle details near the top. Order numbers, invoice numbers, part/SKU codes, phone numbers, postcodes, prices and quantities are NOT mileage readings even when they're a few digits long. If there's no clearly labelled reading, null - a missing value is far better than a wrong one, since a fallback estimate is used instead. Only relevant if isReceipt is true.,
  "registration": a UK vehicle registration plate, ONLY if one is genuinely printed on this receipt (e.g. a garage work order listing the customer's reg, or a fuel receipt with a numberplate recognition line) - with no spaces (e.g. "AB12CDE" not "AB12 CDE"). Rare on most receipts - never guess or infer one. Otherwise null. Only relevant if isReceipt is true.,
  "total": the receipt's final total actually paid, as a plain number - null if not shown. Only relevant if isReceipt is true.,
  "vatAddedAtEnd": the VAT amount ADDED below the lines to reach the total, when the line prices are before VAT (e.g. "Net 199.50, VAT 39.90, Total 239.40" gives 39.90). 0 when the line prices already include VAT, even if the receipt prints the VAT it contains. null if unclear. Only relevant if isReceipt is true.,
  "items": [
    {
      "category": one of "service", "fuel", "mods", "bills", "labour", "unrelated",
      "date": the transaction date as YYYY-MM-DD (your best reading of the receipt; if genuinely illegible, use today's date),
      "cost": what was paid for THIS item, in whatever currency you identified above, as a plain number with no currency symbol: the sum of every line that belongs to it, including VAT. If the lines are priced before VAT and VAT is added at the bottom, include this item's share of that VAT, so the items add up to the receipt's total,
      "linesTotal": the plain sum of the line prices that belong to this item, exactly as printed on those lines, with nothing added for VAT shown further down - null if the receipt shows no per-line prices,
      "description": the item's name, max 6 words. For a ${noun} service or repair, use exactly one of these names when one fits: ${jobNames}. Otherwise a short plain-English name. Never the business's name or address,
      "details": for a "service" or "labour" item, what was done or fitted, as a short comma-separated list taken from the receipt's lines (max 20 words, e.g. "engine oil 10W-40, oil filter, air filter, spark plugs, chain adjusted"). null for other categories, or when the receipt names nothing beyond the job itself,
      "litres": if category is "fuel" AND you can genuinely read a litres figure, that number as a plain number - otherwise null. Do not guess a number here; a fuel entry with no readable litres is skipped entirely by the caller rather than logged with a made-up amount, so returning null when you're not confident is the correct, safe answer, not a failure.,
      "fuelType": if category is "fuel", your best read of the fuel type from wording on the receipt (e.g. "unleaded", "premium", "diesel", "super") - one of "petrol", "diesel", "other" (anything that isn't fuel for an engine, e.g. AdBlue). ${fuelTypeFallback} Otherwise null.
    }
  ]
}
Category guide:
- "service": ${noun} servicing or repair work, or parts and consumables for it (${serviceExamples}). One job is ONE item: every line that belongs to it - parts, oil, filters, plugs, fluids, small adjustments, checks, and the labour for that job - goes into that one item's cost and details. So a service invoice listing labour, engine oil, an oil filter, an air filter, spark plugs and a chain adjustment is ONE "Full service" item, not six. Make a separate item only for work that is a different job in the list of names above AND is charged as its own job (for example, new tyres or new brake pads fitted at the same visit as a service).
- "labour": workshop labour or diagnostic time that does NOT belong to any job on this receipt (e.g. a standalone "Diagnostic fee", or "2 hrs labour @ £75" with no job or parts named). Labour for a job on the receipt goes inside that job's item, never here.
- "fuel": a petrol or diesel fill-up
- "mods": accessories, gear, luggage, or electronics bought for the ${noun} or for ${ridingOrDriving} it (not fitted as a labour job)
- "bills": insurance, road tax (VED), or an MOT test. An MOT test fee is its own item, separate from any repairs done to pass it (those are "service").
- "unrelated": anything clearly NOT for the ${noun} or for ${ridingOrDriving} it - groceries, food and drink (including a snack bought with fuel), household and cleaning products for the home (e.g. toilet roll, anti-bacterial wipes, washing-up liquid), toiletries, medicine, everyday clothing, tobacco, lottery tickets, newspapers. Products made for vehicles (car shampoo, screenwash, de-icer, chain lube, polish) and general items a ${noun} owner plausibly bought for it (a padlock, cable ties, WD-40, a phone mount) are NOT unrelated - categorise them as usual. A supermarket receipt is often entirely unrelated: say so rather than forcing its items into another category.
If isReceipt is false, return an empty items array. If the receipt only really contains one job, return a single-item array rather than trying to invent a split. If you cannot confidently read a value on a genuine receipt, make your best reasonable estimate rather than leaving it out - every field must have a value, except merchantName/address/city/mileage/registration/details (genuinely null if not on the receipt) and litres (genuinely null if you can't read it - see above).`;
}

interface GeminiItem {
  category?: string;
  date?: string;
  cost?: number;
  description?: string;
  details?: string | null;
  linesTotal?: number | null;
  litres?: number | null;
  fuelType?: "petrol" | "diesel" | "other" | null;
  // Asked for once per receipt now (GeminiResponse.mileage/registration) -
  // still read per item first, in case a reply carries them here.
  mileageOnReceipt?: number | null;
  registrationOnReceipt?: string | null;
}

interface GeminiResponse {
  isReceipt?: boolean;
  rejectionReason?: string;
  lowConfidence?: boolean;
  summary?: string;
  currency?: string;
  merchantName?: string | null;
  address?: string | null;
  city?: string | null;
  vehicleMakeOnReceipt?: string | null;
  vehicleModelOnReceipt?: string | null;
  // One reading per receipt: asked per item, the model attached it to the
  // first item only and every other job from the same invoice came out
  // "no mileage on the receipt".
  mileage?: number | null;
  registration?: string | null;
  total?: number | null;
  vatAddedAtEnd?: number | null;
  items?: GeminiItem[];
}

// Item costs worked out here, not by the model: asked to share a VAT line
// between two jobs, it once gave an interim service £154.50 and rear pads
// £84.90 instead of £139.80 and £99.60 - the right total, split wrongly.
// The model only copies figures (each item's printed lines, the VAT added
// at the end, the total); this does the sums. VAT goes on every item
// except bills - an MOT fee is outside VAT, insurance is exempt and
// road tax isn't VAT at all. Returns null - keep the model's own costs -
// unless the result adds up to the printed total.
export function reconcileItemCosts(
  items: { category?: string; cost?: number; linesTotal?: number | null }[],
  total: number | null | undefined,
  vatAddedAtEnd: number | null | undefined
): number[] | null {
  if (typeof total !== "number" || !(total > 0) || items.length === 0) return null;
  if (!items.every((item) => typeof item.linesTotal === "number" && item.linesTotal >= 0)) return null;
  const vat = typeof vatAddedAtEnd === "number" && vatAddedAtEnd > 0 ? vatAddedAtEnd : 0;
  const vatBase = items.filter((item) => item.category !== "bills").reduce((sum, item) => sum + (item.linesTotal as number), 0);
  if (vat > 0 && !(vatBase > 0)) return null;
  const costs = items.map((item) => {
    const net = item.linesTotal as number;
    const share = vat > 0 && item.category !== "bills" ? (vat * net) / vatBase : 0;
    return Math.round((net + share) * 100) / 100;
  });
  const sum = costs.reduce((a, b) => a + b, 0);
  return Math.abs(sum - total) <= 0.02 * items.length ? costs : null;
}

const VALID_CATEGORIES = new Set(["service", "fuel", "mods", "bills", "labour"]);

export interface ParsedReceiptItem {
  fileName: string;
  category: "service" | "fuel" | "mods" | "bills" | "labour";
  date: string;
  costGbp: number;
  description: string;
  // What the job covered ("engine oil, oil filter, spark plugs"), so one
  // entry per job still records every part on the invoice.
  details?: string | null;
  litres: number | null;
  mileageOnReceipt: number | null;
  registrationOnReceipt: string | null;
  merchantName: string | null;
  address: string | null;
  city: string | null;
  vehicleMakeOnReceipt: string | null;
  vehicleModelOnReceipt: string | null;
  attachment: Attachment;
  currencyConversion?: CurrencyConversionInfo;
  forceReview: boolean;
  // Set when even the escalated (Pro) read was still unsure - a separate
  // signal from forceReview (which is currency-specific), so the review
  // queue can tell a human WHY an item needs their eyes rather than
  // lumping every reason into one caveat.
  aiLowConfidence: boolean;
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
      // Lines the AI read as not for the vehicle (a snack bought with
      // fuel) - dropped, the rest of the receipt still logged.
      skippedUnrelated: number;
    }
  | { ok: false; fileName: string; error: string; status: number };

// Shared by the primary (flash-lite) read and the low-confidence
// escalation (pro) re-read below - same request shape either way, only
// the model in the URL differs. Returns null on any failure (network,
// non-200, unparseable JSON) so the caller can fall back to whatever
// earlier result it already has rather than losing the whole scan.
async function callGeminiReceiptModel(
  model: string,
  apiKey: string,
  mimeTypeForGemini: string,
  base64: string,
  vehicleKind: VehicleKind
): Promise<GeminiResponse | null> {
  try {
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(vehicleKind) }, { inline_data: { mime_type: mimeTypeForGemini, data: base64 } }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }, GEMINI_VISION_TIMEOUT_MS);
    if (!res.ok) {
      logGeminiUsage("receiptScan", model, false);
      return null;
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      logGeminiUsage("receiptScan", model, false);
      return null;
    }

    const parsed = JSON.parse(rawText) as GeminiResponse;
    logGeminiUsage("receiptScan", model, true);
    return parsed;
  } catch {
    logGeminiUsage("receiptScan", model, false);
    return null;
  }
}

// Options for callers that aren't a signed-in account's own scan - the
// public sample-bike demo (api/demo/scan) reads a visitor's receipt
// without keeping it: store false skips the blob upload (the item's
// attachment is an empty placeholder), escalate false skips the
// dearer second read. Both default to the normal behaviour.
export interface ParseReceiptOptions {
  store?: boolean;
  escalate?: boolean;
}

export async function parseReceiptFile(file: File, apiKey: string, vehicle: ScanVehicle, options: ParseReceiptOptions = {}): Promise<ParseReceiptResult> {
  const store = options.store !== false;
  const escalate = options.escalate !== false;
  const fileName = file.name || "receipt.jpg";
  const vehicleKind = vehicleKindOf(vehicle);

  if (!ALLOWED_TYPES.has(file.type)) {
    return { ok: false, fileName, error: "Only JPG, PNG, or PDF files are supported for scanning.", status: 400 };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, fileName, error: "File is too large - 10MB maximum.", status: 400 };
  }

  const isPdf = file.type === "application/pdf";

  const originalBytes = Buffer.from(await file.arrayBuffer());
  // The declared MIME type above is just a client-supplied claim - confirm
  // the actual bytes match before this goes anywhere near Gemini or sharp,
  // same check the Vault's own upload route already applies.
  if (!matchesDeclaredFileType(originalBytes, file.type as SniffableFileType)) {
    return { ok: false, fileName, error: "This file's contents don't match its type - it may be corrupted or mislabelled.", status: 400 };
  }

  try {
    let base64: string;
    let mimeTypeForGemini: string;
    let uploadBuffer: Buffer;
    let uploadContentType: string;
    let uploadExtension: string;

    if (isPdf) {
      // Send PDF bytes directly to Gemini as a document - no rasterisation
      // needed since Gemini reads PDF natively. The original PDF is stored
      // as the attachment so the buyer can open the real invoice later.
      uploadBuffer = originalBytes;
      base64 = uploadBuffer.toString("base64");
      mimeTypeForGemini = "application/pdf";
      uploadContentType = "application/pdf";
      uploadExtension = "pdf";
    } else {
      // Images: compress/resize before sending to keep API payload small.
      uploadBuffer = await sharp(originalBytes)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      base64 = uploadBuffer.toString("base64");
      mimeTypeForGemini = "image/jpeg";
      uploadContentType = "image/jpeg";
      uploadExtension = "jpg";
    }

    let parsed = await callGeminiReceiptModel(GEMINI_MODEL, apiKey, mimeTypeForGemini, base64, vehicleKind);
    if (!parsed) {
      return { ok: false, fileName, error: "Could not read the receipt. Please try again or enter it manually.", status: 502 };
    }

    // The cheap pass wasn't confident - re-read the same receipt once
    // with the strongest model before this ever reaches a human. If the
    // escalated read comes back confident, it replaces the flash-lite
    // one outright (it's the better read); if it also fails or is still
    // unsure, keep going with what's already in hand rather than losing
    // the scan entirely - aiLowConfidence below is what actually routes
    // this to a human either way.
    let aiLowConfidence = parsed.isReceipt !== false && parsed.lowConfidence === true;
    if (aiLowConfidence && escalate) {
      const escalated = await callGeminiReceiptModel(GEMINI_ESCALATION_MODEL, apiKey, mimeTypeForGemini, base64, vehicleKind);
      if (escalated) {
        parsed = escalated;
        aiLowConfidence = escalated.isReceipt !== false && escalated.lowConfidence === true;
      }
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
    // A genuine receipt with nothing on it for the vehicle (a supermarket
    // shop) used to have its lines forced into "mods" and logged. Refused
    // before the photo is stored, naming what was read so the person can
    // see why.
    const unrelatedItems = rawItems.filter((item) => item.category === "unrelated");
    if (validItems.length === 0 && unrelatedItems.length > 0) {
      const seen = unrelatedItems
        .map((item) => (typeof item.description === "string" ? item.description.trim().toLowerCase() : ""))
        .filter(Boolean)
        .slice(0, 3);
      const noun = vehicleKind === "motorcycle" ? "motorcycle" : "car";
      return {
        ok: false,
        fileName,
        error: `Nothing on this receipt looks like it's for your ${noun}${seen.length > 0 ? ` (it shows ${seen.join(", ")})` : ""}, so nothing was logged. If it is, add it manually.`,
        status: 422,
      };
    }
    if (validItems.length === 0) {
      return { ok: false, fileName, error: "Could not work out what kind of expense this is. Please enter it manually.", status: 502 };
    }

    const summary = typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : null;
    const detectedCurrency = typeof parsed.currency === "string" ? parsed.currency.toUpperCase() : "GBP";
    const merchantName = typeof parsed.merchantName === "string" && parsed.merchantName.trim() ? parsed.merchantName.trim() : null;
    const address = typeof parsed.address === "string" && parsed.address.trim() ? parsed.address.trim() : null;
    const city = typeof parsed.city === "string" && parsed.city.trim() ? parsed.city.trim() : null;
    const vehicleMakeOnReceipt = typeof parsed.vehicleMakeOnReceipt === "string" && parsed.vehicleMakeOnReceipt.trim() ? parsed.vehicleMakeOnReceipt.trim() : null;
    const vehicleModelOnReceipt = typeof parsed.vehicleModelOnReceipt === "string" && parsed.vehicleModelOnReceipt.trim() ? parsed.vehicleModelOnReceipt.trim() : null;
    const receiptMileage = parsed.mileage;
    const receiptRegistration = parsed.registration;
    // Over every item the model read, unrelated ones included - they're
    // part of the printed total too.
    const reconciledCosts = reconcileItemCosts(rawItems, parsed.total, parsed.vatAddedAtEnd);

    // Uploaded once per file, shared as the attachment across every item
    // split out of this one receipt - they're all proof of the same
    // physical piece of paper.
    const blobName = store ? `${randomBytes(24).toString("base64url")}.${uploadExtension}` : "";
    if (store) {
      const container = await getAttachmentContainer();
      const blockBlobClient = container.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(uploadBuffer, { blobHTTPHeaders: { blobContentType: uploadContentType } });
    }
    const attachment: Attachment = { blobName, fileName, fileType: (isPdf ? "application/pdf" : "image/jpeg") as Attachment["fileType"], uploadedAt: new Date().toISOString() };
    const rates = await getExchangeRates();
    const currencySupported = (ALL_CURRENCIES as string[]).includes(detectedCurrency);

    const items: ParsedReceiptItem[] = [];
    let skippedBeforeProduction = 0;
    let skippedNonPetrol = 0;
    let skippedUnreadableLitres = 0;

    for (const item of validItems) {
      const category = item.category as "service" | "fuel" | "mods" | "bills" | "labour";
      const date = item.date ?? new Date().toISOString().slice(0, 10);

      if (category !== "mods" && isBeforeProduction(date, vehicle)) {
        skippedBeforeProduction++;
        continue;
      }

      // Motorcycles run on petrol - a diesel (or other non-fuel-for-an-
      // engine) receipt is refused outright rather than logged, since it
      // almost certainly belongs to a different vehicle entirely. Cars
      // run on either, so only "other" (genuinely not engine fuel, e.g.
      // AdBlue or screenwash) is refused for them - diesel is a normal,
      // valid car fuel entry.
      if (category === "fuel" && item.fuelType === "diesel" && vehicleKind === "motorcycle") {
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

      const rawCost = reconciledCosts ? reconciledCosts[rawItems.indexOf(item)] : typeof item.cost === "number" ? item.cost : 0;
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

      const mileageRead = item.mileageOnReceipt ?? receiptMileage;
      const registrationRead = item.registrationOnReceipt ?? receiptRegistration;
      items.push({
        fileName,
        category,
        date,
        costGbp,
        description: item.description ?? "",
        details: typeof item.details === "string" && item.details.trim() ? item.details.trim() : null,
        litres: category === "fuel" ? (item.litres as number) : null,
        mileageOnReceipt: typeof mileageRead === "number" && mileageRead > 0 ? Math.round(mileageRead) : null,
        registrationOnReceipt: typeof registrationRead === "string" && registrationRead.trim() ? registrationRead.toUpperCase().replace(/\s+/g, "") : null,
        merchantName,
        address,
        city,
        vehicleMakeOnReceipt,
        vehicleModelOnReceipt,
        attachment,
        currencyConversion,
        forceReview,
        aiLowConfidence,
      });
    }

    return { ok: true, fileName, summary, items, skippedBeforeProduction, skippedNonPetrol, skippedUnreadableLitres, skippedUnrelated: unrelatedItems.length };
  } catch (err) {
    return {
      ok: false,
      fileName,
      error: "Something went wrong reading the receipt. Please try again or enter it manually.",
      status: 500,
    };
  }
}





