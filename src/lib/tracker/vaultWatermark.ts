// Place at: src/lib/tracker/vaultWatermark.ts
//
// Generated fresh on every download, never persisted - the spec is
// explicit this is cosmetic, not DRM: a faint, diagonal
// email+timestamp stamp discourages casual sharing and makes clear a
// downloaded copy is traceable, without pretending to be real
// protection. pdf-lib is a new dependency (nothing in this app has ever
// opened/rewritten a PDF's internal structure before - see
// upload-attachment/route.ts's own comment, PDFs were always stored and
// streamed back as opaque blobs). sharp is already a dependency
// (resize/rotate elsewhere) - .composite() for a text overlay is new
// usage of it, not a new package.
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import sharp from "sharp";

export async function watermarkPdf(original: Buffer, stampText: string): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(original);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(stampText, {
      x: width / 6,
      y: height / 2,
      size: 16,
      font,
      color: rgb(0.6, 0.6, 0.6),
      opacity: 0.35,
      rotate: degrees(45),
    });
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}

function escapeSvgText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function watermarkImage(original: Buffer, stampText: string, contentType: "image/jpeg" | "image/png"): Promise<Buffer> {
  const image = sharp(original);
  const metadata = await image.metadata();
  const width = metadata.width ?? 800;
  const height = metadata.height ?? 600;

  const fontSize = Math.max(14, Math.round(width / 25));
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="50%" font-size="${fontSize}" font-family="sans-serif" fill="rgba(120,120,120,0.35)"
          text-anchor="middle" dominant-baseline="middle"
          transform="rotate(-30 ${width / 2} ${height / 2})">${escapeSvgText(stampText)}</text>
  </svg>`;

  const composited = image.composite([{ input: Buffer.from(svg), gravity: "center" }]);
  const outputBuffer = contentType === "image/png" ? await composited.png().toBuffer() : await composited.jpeg().toBuffer();
  return outputBuffer;
}
