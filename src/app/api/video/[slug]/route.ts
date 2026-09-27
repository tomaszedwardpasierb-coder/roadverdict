// Place at: src/app/api/video/[slug]/route.ts
//
// Streams one of the videos listed in lib/videos.ts from Azure Blob
// Storage (see lib/videoStream.ts). A slug that isn't in that list is a
// 404 - a request can't name an arbitrary blob. /api/video/promo is its
// own route, and takes precedence over this one.
import { NextRequest, NextResponse } from "next/server";
import { streamVideoBlob } from "@/lib/videoStream";
import { findVideo } from "@/lib/videos";

export async function GET(request: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const video = findVideo(slug);
  if (!video) return new NextResponse("Video not found", { status: 404 });
  return streamVideoBlob(request, video.blobName);
}
