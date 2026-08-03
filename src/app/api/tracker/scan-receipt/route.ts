// Place at: src/app/api/tracker/scan-receipt/route.ts
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { getSession } from "@/lib/auth/session";
import { getAttachmentContainer } from "@/lib/blobStorage";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

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
// A PDF can still be attached manually exactly as before.

const PROMPT = `You are extracting structured data from a photo of a UK motorcycle-related receipt or invoice. Read the image and respond with ONLY a JSON object (no markdown, no explanation) matching this exact shape:
{
  "category": one of "service", "fuel", "mods", "bills",
  "date": the transaction date as YYYY-MM-DD (your best reading of the receipt; if genuinely illegible, use today's date),
  "cost": the total amount paid, as a plain number with no currency symbol,
  "description": a short (max 6 words) plain-English description of what this receipt is for,
  "litres": if category is "fuel", the number of litres as a plain number, otherwise null
}
Category guide:
- "service": motorcycle servicing, repairs, or parts fitted as a labour job (oil change, brake pads, tyres, chain, valve clearance, etc.)
- "fuel": a petrol or diesel fill-up
- "mods": accessories, gear, luggage, or electronics bought (not fitted as a labour job)
- "bills": insurance, road tax (VED), or an MOT test
If you cannot confidently read a value, make your best reasonable estimate rather than leaving it out - every field must have a value.`;

interface GeminiExtraction {
  category?: string;
  date?: string;
  cost?: number;
  description?: string;
  litres?: number | null;
}

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

    let extracted: GeminiExtraction;
    try {
      extracted = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Could not read the receipt. Please try again or enter it manually." }, { status: 502 });
    }

    const validCategories = ["service", "fuel", "mods", "bills"];
    if (!extracted.category || !validCategories.includes(extracted.category)) {
      return NextResponse.json({ error: "Could not work out what kind of expense this is. Please enter it manually." }, { status: 502 });
    }

    // Upload the same compressed image as this record's attachment, so
    // scanning a receipt and manually uploading one end up in exactly the
    // same storage path with the same proof attached either way.
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

    return NextResponse.json({
      category: extracted.category,
      date: extracted.date ?? new Date().toISOString().slice(0, 10),
      cost: typeof extracted.cost === "number" ? extracted.cost : 0,
      description: extracted.description ?? "",
      litres: typeof extracted.litres === "number" ? extracted.litres : null,
      attachment,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Something went wrong scanning the receipt. Please try again or enter it manually.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
