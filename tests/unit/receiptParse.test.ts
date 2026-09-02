import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sharpToBuffer: vi.fn(),
  getAttachmentContainer: vi.fn(),
  uploadData: vi.fn(),
  getExchangeRates: vi.fn(),
}));

vi.mock("sharp", () => ({
  default: () => ({
    rotate: () => ({
      resize: () => ({
        jpeg: () => ({ toBuffer: mocks.sharpToBuffer }),
      }),
    }),
  }),
}));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: mocks.getAttachmentContainer }));
vi.mock("@/lib/tracker/currencyRates", () => ({ getExchangeRates: mocks.getExchangeRates }));
// currency.ts and productionYearCheck.ts are deliberately NOT mocked -
// both pure, no I/O, and their real behaviour (including the
// mods-category carve-out from the production-year check) is exactly
// what several tests below are confirming.

import { parseReceiptFile } from "@/lib/tracker/receiptParse";

function geminiResponse(bodyText: string) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: bodyText }] } }] }) };
}
function fakeFile(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return {
    name: overrides.name ?? "receipt.jpg",
    type: overrides.type ?? "image/jpeg",
    size: overrides.size ?? 1024,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as File;
}
const bike = { id: "bike-1", year: 2018 } as any; // production year 2018, used by isBeforeProduction

const validGeminiPayload = {
  isReceipt: true,
  summary: "Halfords, 12 Jun 2025",
  currency: "GBP",
  merchantName: "Halfords",
  address: null,
  city: null,
  vehicleMakeOnReceipt: null,
  vehicleModelOnReceipt: null,
  items: [{ category: "mods", date: "2025-06-12", cost: 40, description: "Chain lube" }],
};

describe("parseReceiptFile", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.sharpToBuffer.mockResolvedValue(Buffer.from("fake-jpeg-bytes"));
    mocks.uploadData.mockResolvedValue(undefined);
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient: () => ({ uploadData: mocks.uploadData }) });
    mocks.getExchangeRates.mockResolvedValue({ rates: { EUR: 1.17 }, fetchedAt: "2025-06-01" });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("rejects a file type that is not JPG, PNG, or PDF", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const result = await parseReceiptFile(fakeFile({ type: "text/plain" }), "key", bike);
    expect(result).toEqual({ ok: false, fileName: "receipt.jpg", error: "Only JPG, PNG, or PDF files are supported for scanning.", status: 400 });
  });

  it("rejects a file over the 10MB limit", async () => {
    const result = await parseReceiptFile(fakeFile({ size: 11 * 1024 * 1024 }), "key", bike);
    expect(result.ok).toBe(false);
    expect((result as any).status).toBe(400);
  });

  it("fails soft with a 502 on a non-ok Gemini response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect(result).toEqual({ ok: false, fileName: "receipt.jpg", error: "Could not read the receipt. Please try again or enter it manually.", status: 502 });
  });

  it("fails soft with a 502 when the model's own text isn't valid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse("not json")));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect((result as any).status).toBe(502);
  });

  it("uses the model's own rejection reason when the image isn't a receipt at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      isReceipt: false, rejectionReason: "This looks like a photo of a motorcycle, not a receipt.",
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect(result).toEqual({ ok: false, fileName: "receipt.jpg", error: "This looks like a photo of a motorcycle, not a receipt.", status: 422 });
  });

  it("falls back to a generic not-a-receipt message when the model gives no reason", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ isReceipt: false }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect((result as any).error).toBe("This doesn't look like a receipt or invoice. Please log this entry manually instead.");
  });

  it("returns a 502 when no item has a recognised category at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      isReceipt: true, items: [{ category: "not-a-real-category", date: "2025-06-01", cost: 10 }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect((result as any).status).toBe(502);
    expect((result as any).error).toContain("Could not work out what kind of expense this is");
  });

  it("skips an item dated before the bike's production year, and counts it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      isReceipt: true, items: [{ category: "service", date: "2010-01-01", cost: 50, description: "Oil change" }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect(result).toMatchObject({ ok: true, items: [], skippedBeforeProduction: 1 });
  });

  // The explicit, deliberate carve-out: mods items are NOT checked
  // against the bike's production year at all - accessories can
  // predate the bike itself (bought for a previous one, then reused),
  // unlike a service or fuel receipt which genuinely can't.
  it("does not apply the production-year check to mods items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      isReceipt: true, items: [{ category: "mods", date: "2010-01-01", cost: 30, description: "Old luggage rack" }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect(result).toMatchObject({ ok: true, skippedBeforeProduction: 0 });
    expect((result as any).items).toHaveLength(1);
  });

  it("skips a diesel fuel item, and counts it separately from an unreadable-litres skip", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      isReceipt: true, items: [{ category: "fuel", date: "2025-06-01", cost: 20, fuelType: "diesel", litres: 10 }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect(result).toMatchObject({ ok: true, items: [], skippedNonPetrol: 1, skippedUnreadableLitres: 0 });
  });

  it("skips a non-fuel-for-an-engine item (fuelType 'other')", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      isReceipt: true, items: [{ category: "fuel", date: "2025-06-01", cost: 5, fuelType: "other", litres: 2 }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect(result).toMatchObject({ skippedNonPetrol: 1 });
  });

  // The documented fix for a real prior bug: an unreadable litres figure
  // used to silently default to 0, corrupting the mpg chain. It must be
  // skipped entirely instead, never logged with a fabricated amount.
  it("skips a fuel item with unreadable litres rather than defaulting to zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      isReceipt: true, items: [{ category: "fuel", date: "2025-06-01", cost: 20, fuelType: "petrol", litres: null }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect(result).toMatchObject({ ok: true, items: [], skippedUnreadableLitres: 1 });
  });

  it("skips a fuel item with a zero or negative litres figure the same way", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      isReceipt: true, items: [{ category: "fuel", date: "2025-06-01", cost: 20, fuelType: "petrol", litres: 0 }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect(result).toMatchObject({ skippedUnreadableLitres: 1 });
  });

  it("passes a GBP cost straight through with no currency conversion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validGeminiPayload))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    const item = (result as any).items[0];
    expect(item.costGbp).toBe(40);
    expect(item.currencyConversion).toBeUndefined();
    expect(item.forceReview).toBe(false);
  });

  it("converts a supported foreign currency using the real exchange rate when rates are available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      ...validGeminiPayload, currency: "EUR", items: [{ ...validGeminiPayload.items[0], cost: 46.8 }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    const item = (result as any).items[0];
    expect(item.costGbp).toBe(40); // 46.8 / 1.17
    expect(item.currencyConversion).toEqual({ originalCurrency: "EUR", originalAmount: 46.8, rate: 1.17, ratedAt: "2025-06-01" });
    expect(item.forceReview).toBe(false);
  });

  it("flags an unsupported currency for manual review instead of converting it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ ...validGeminiPayload, currency: "USD" }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    const item = (result as any).items[0];
    expect(item.forceReview).toBe(true);
    expect(item.currencyConversion).toBeUndefined();
  });

  it("flags a supported currency for manual review when exchange rates aren't available at all", async () => {
    mocks.getExchangeRates.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({ ...validGeminiPayload, currency: "EUR" }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect((result as any).items[0].forceReview).toBe(true);
  });

  it("normalises a registration to uppercase with no spaces", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      ...validGeminiPayload, items: [{ ...validGeminiPayload.items[0], registrationOnReceipt: "ab12 cde" }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect((result as any).items[0].registrationOnReceipt).toBe("AB12CDE");
  });

  it("treats a zero or negative mileage reading as unreadable, returning null rather than a bogus value", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      ...validGeminiPayload, items: [{ ...validGeminiPayload.items[0], mileageOnReceipt: -5 }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect((result as any).items[0].mileageOnReceipt).toBeNull();
  });

  it("rounds a genuine positive mileage reading", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      ...validGeminiPayload, items: [{ ...validGeminiPayload.items[0], mileageOnReceipt: 15234.6 }],
    }))));
    const result = await parseReceiptFile(fakeFile(), "key", bike);
    expect((result as any).items[0].mileageOnReceipt).toBe(15235);
  });

  // They're all proof of the same physical receipt - one upload shared
  // across every item split out of it, not a separate blob per item.
  it("uploads the photo exactly once and shares the same attachment across every item split from one receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
      isReceipt: true,
      items: [
        { category: "mods", date: "2025-06-01", cost: 20, description: "Padlock" },
        { category: "fuel", date: "2025-06-01", cost: 15, fuelType: "petrol", litres: 8 },
      ],
    }))));

    const result = await parseReceiptFile(fakeFile(), "key", bike);

    expect(mocks.uploadData).toHaveBeenCalledTimes(1);
    const items = (result as any).items;
    expect(items).toHaveLength(2);
    expect(items[0].attachment).toEqual(items[1].attachment);
  });

  it("returns a generic 500 if something throws unexpectedly, e.g. the blob upload failing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validGeminiPayload))));
    mocks.uploadData.mockRejectedValue(new Error("storage outage"));

    const result = await parseReceiptFile(fakeFile(), "key", bike);

    expect(result).toEqual({
      ok: false, fileName: "receipt.jpg",
      error: "Something went wrong reading the receipt. Please try again or enter it manually.",
      status: 500,
    });
  });
  // Stage 3 of the AI model strategy (AI-Models-for-Different-Tasks.docx):
  // the cheap flash-lite pass can flag its own uncertainty, in which case
  // the same receipt gets one re-read with the strongest model before
  // anything reaches a human.
  describe("low-confidence escalation", () => {
    it("makes only one Gemini call, and sets aiLowConfidence: false, when the model is confident", async () => {
      const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify(validGeminiPayload)));
      vi.stubGlobal("fetch", fetchMock);

      const result = await parseReceiptFile(fakeFile(), "key", bike);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((result as any).items[0].aiLowConfidence).toBe(false);
    });

    it("escalates to the pro model when the model reports low confidence, and uses the escalated read", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(geminiResponse(JSON.stringify({
          ...validGeminiPayload, lowConfidence: true,
          items: [{ ...validGeminiPayload.items[0], cost: 999 }],
        })))
        .mockResolvedValueOnce(geminiResponse(JSON.stringify({
          ...validGeminiPayload, lowConfidence: false,
          items: [{ ...validGeminiPayload.items[0], cost: 40 }],
        })));
      vi.stubGlobal("fetch", fetchMock);

      const result = await parseReceiptFile(fakeFile(), "key", bike);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const escalatedUrl = String(fetchMock.mock.calls[1][0]);
      expect(escalatedUrl).toContain("gemini-2.5-pro");
      const item = (result as any).items[0];
      // The escalated (confident) read replaced the flash-lite one outright.
      expect(item.costGbp).toBe(40);
      expect(item.aiLowConfidence).toBe(false);
    });

    it("falls back to the flash-lite read, still flagged low-confidence, when the escalation call itself fails", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(geminiResponse(JSON.stringify({ ...validGeminiPayload, lowConfidence: true })))
        .mockResolvedValueOnce({ ok: false });
      vi.stubGlobal("fetch", fetchMock);

      const result = await parseReceiptFile(fakeFile(), "key", bike);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((result as any).ok).toBe(true);
      expect((result as any).items[0].aiLowConfidence).toBe(true);
    });

    it("stays low-confidence when even the escalated read is still unsure", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(geminiResponse(JSON.stringify({ ...validGeminiPayload, lowConfidence: true })))
        .mockResolvedValueOnce(geminiResponse(JSON.stringify({ ...validGeminiPayload, lowConfidence: true })));
      vi.stubGlobal("fetch", fetchMock);

      const result = await parseReceiptFile(fakeFile(), "key", bike);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((result as any).items[0].aiLowConfidence).toBe(true);
    });

    it("never escalates when the model confidently says this isn't a receipt at all", async () => {
      const fetchMock = vi.fn().mockResolvedValue(geminiResponse(JSON.stringify({
        isReceipt: false, lowConfidence: true, rejectionReason: "Not a receipt.",
      })));
      vi.stubGlobal("fetch", fetchMock);

      const result = await parseReceiptFile(fakeFile(), "key", bike);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((result as any).ok).toBe(false);
    });
  });

  it('accepts a PDF, skips sharp, sends PDF bytes to Gemini with application/pdf mime type, and stores attachment as application/pdf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      geminiResponse(JSON.stringify({ ...validGeminiPayload, items: [{ category: 'service', date: '2025-06-12', cost: 80, description: 'Service' }] }))
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await parseReceiptFile(fakeFile({ type: 'application/pdf', name: 'invoice.pdf' }), 'key', bike);
    expect(result.ok).toBe(true);
    expect(mocks.sharpToBuffer).not.toHaveBeenCalled();
    const geminiCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('generativelanguage'));
    const body = JSON.parse(geminiCall![1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('application/pdf');
    expect(mocks.uploadData).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ blobHTTPHeaders: { blobContentType: 'application/pdf' } })
    );
    if (result.ok) {
      expect(result.items[0].attachment?.fileType).toBe('application/pdf');
    }
  });
});
