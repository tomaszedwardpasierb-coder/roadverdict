// Place at: src/app/api/video/promo/route.ts
//
// Streams the promo video from Azure Blob Storage without requiring
// public blob access. The video is served from your own domain,
// so embed it as /api/video/promo in any <video> tag.

import { NextRequest, NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";

const CONTAINER = "videos";
const BLOB_NAME = "vide promocyjne.mp4";

// Handles the three shapes a real Range header can take: "start-end",
// "start-" (open-ended, to the end of the file), and "-suffixLength" (the
// last N bytes) - and rejects anything that parses to NaN, is negative,
// or has start > end, rather than passing an invalid value straight into
// the storage SDK's own download() call.
function parseRangeHeader(rangeHeader: string, contentLength: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startStr, endStr] = match;

  let start: number;
  let end: number;
  if (startStr === "" && endStr !== "") {
    // Suffix range: the last N bytes of the file.
    const suffixLength = parseInt(endStr, 10);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, contentLength - suffixLength);
    end = contentLength - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === "" ? contentLength - 1 : parseInt(endStr, 10);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < 0 || start > end) return null;
  if (start >= contentLength) return null;

  return { start, end: Math.min(end, contentLength - 1) };
}

export async function GET(request: NextRequest) {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    return new NextResponse("Storage not configured", { status: 503 });
  }

  try {
    const blobService = BlobServiceClient.fromConnectionString(connectionString);
    const container = blobService.getContainerClient(CONTAINER);
    const blob = container.getBlobClient(BLOB_NAME);

    const properties = await blob.getProperties();
    const contentLength = properties.contentLength ?? 0;
    const contentType = properties.contentType || "video/mp4";

    // Support range requests so the browser can seek in the video
    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      const parsed = parseRangeHeader(rangeHeader, contentLength);
      if (!parsed) {
        // A malformed or unsatisfiable Range header (NaN from an unusual
        // shape, or bounds outside the real file) previously fell straight
        // through to blob.download(NaN, NaN), which threw and was reported
        // as a generic 404 "Video not found" - masking a request-parsing
        // problem as a missing-resource one. 416 is the correct status for
        // "the range itself doesn't make sense", per RFC 7233.
        return new NextResponse("Range not satisfiable", {
          status: 416,
          headers: { "Content-Range": `bytes */${contentLength}` },
        });
      }
      const { start, end } = parsed;
      const chunkSize = end - start + 1;

      const download = await blob.download(start, chunkSize);
      const stream = download.readableStreamBody;
      if (!stream) return new NextResponse("Stream unavailable", { status: 500 });

      return new NextResponse(stream as unknown as ReadableStream, {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${contentLength}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Cache-Control": "public, max-age=86400",
        },
      });
    }

    // Full file request
    const download = await blob.download();
    const stream = download.readableStreamBody;
    if (!stream) return new NextResponse("Stream unavailable", { status: 500 });

    return new NextResponse(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(contentLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("Video stream error:", err);
    return new NextResponse("Video not found", { status: 404 });
  }
}
