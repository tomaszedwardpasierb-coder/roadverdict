// Place at: src/app/api/video/promo/route.ts
//
// Streams the promo video from Azure Blob Storage without requiring
// public blob access. The video is served from your own domain,
// so embed it as /api/video/promo in any <video> tag.

import { NextRequest, NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";

const CONTAINER = "videos";
const BLOB_NAME = "vide promocyjne.mp4";

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
      const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : contentLength - 1;
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
