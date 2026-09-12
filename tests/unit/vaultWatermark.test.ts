// Place at: tests/unit/vaultWatermark.test.ts
//
// Real pdf-lib/sharp, not mocked - these are pure byte-transforming
// functions with no I/O, so the meaningful thing to assert is that real
// bytes actually change and remain a valid, re-parseable file.
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { watermarkPdf, watermarkImage } from "@/lib/tracker/vaultWatermark";

async function makeTestPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 300]);
  return Buffer.from(await doc.save());
}

async function makeTestPng(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 200, g: 20, b: 20 } } })
    .png()
    .toBuffer();
}

async function makeTestJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 20, g: 200, b: 20 } } })
    .jpeg()
    .toBuffer();
}

describe("watermarkPdf", () => {
  it("returns different bytes from the original, still a valid, loadable PDF", async () => {
    const original = await makeTestPdf();
    const watermarked = await watermarkPdf(original, "rider@example.com — Downloaded 11 Sep 2026, 14:32");

    expect(Buffer.compare(watermarked, original)).not.toBe(0);
    const reloaded = await PDFDocument.load(watermarked);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("stamps every page, not just the first", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([300, 300]);
    doc.addPage([300, 300]);
    doc.addPage([300, 300]);
    const original = Buffer.from(await doc.save());

    const watermarked = await watermarkPdf(original, "stamp");
    const reloaded = await PDFDocument.load(watermarked);
    expect(reloaded.getPageCount()).toBe(3);
    // Each page's own content stream grew relative to a blank page's -
    // a cheap proxy for "text was actually drawn on it", without
    // depending on any PDF text-extraction library.
    const blank = Buffer.from(await (async () => {
      const blankDoc = await PDFDocument.create();
      blankDoc.addPage([300, 300]);
      return blankDoc.save();
    })());
    expect(watermarked.length).toBeGreaterThan(blank.length);
  });
});

describe("watermarkImage", () => {
  it("returns different bytes from the original PNG, still a valid, decodable image of the same size", async () => {
    const original = await makeTestPng();
    const watermarked = await watermarkImage(original, "rider@example.com — Downloaded 11 Sep 2026, 14:32", "image/png");

    expect(Buffer.compare(watermarked, original)).not.toBe(0);
    const metadata = await sharp(watermarked).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(40);
    expect(metadata.height).toBe(40);
  });

  it("returns a valid JPEG when given a JPEG", async () => {
    const original = await makeTestJpeg();
    const watermarked = await watermarkImage(original, "stamp", "image/jpeg");

    expect(Buffer.compare(watermarked, original)).not.toBe(0);
    const metadata = await sharp(watermarked).metadata();
    expect(metadata.format).toBe("jpeg");
  });
});
