// Place at: src/app/api/video/promo/route.ts
//
// Streams the promo video (shown on /about) from Azure Blob Storage -
// see lib/videoStream.ts.
import { NextRequest } from "next/server";
import { streamVideoBlob } from "@/lib/videoStream";

const BLOB_NAME = "vide promocyjne.mp4";

export async function GET(request: NextRequest) {
  return streamVideoBlob(request, BLOB_NAME);
}
