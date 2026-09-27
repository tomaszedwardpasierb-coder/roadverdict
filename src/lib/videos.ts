// Place at: src/lib/videos.ts
//
// The videos shown on /videos, newest first. Each one lives in the
// "videos" container in Azure Blob Storage and is streamed from
// /api/video/<slug> (see lib/videoStream.ts) - only a blob named here
// can ever be served, whatever slug a request asks for.
export interface SiteVideo {
  // The video's address: /api/video/<slug>, and /videos#<slug>.
  slug: string;
  blobName: string;
  title: string;
  paragraphs: string[];
  // The file's own frame size, so the player keeps its shape while the
  // video loads.
  width: number;
  height: number;
  publishedAt: string;
}

export const VIDEOS: SiteVideo[] = [
  {
    slug: "ai-assistant",
    blobName: "Roadverdict's AI short video.mp4",
    title: "Log your history just by talking to it",
    paragraphs: [
      "Say what you did in your own words - “filled up with 12 litres for £21”, “new chain and sprockets, £180” - and the AI turns it into a proper logbook entry. Check it, tap Log it, done.",
      "Got a receipt? Snap a photo and the AI reads it and fills in the details for you.",
      "Want to know something? Just ask: how much have I spent on fuel this year? When's my next MOT? When did I last change the oil? It answers from your own logbook, in seconds.",
      "Logging by chat is part of RoadVerdict Pro.",
    ],
    width: 1920,
    height: 1200,
    publishedAt: "2026-09-28",
  },
];

export function findVideo(slug: string): SiteVideo | null {
  return VIDEOS.find((v) => v.slug === slug) ?? null;
}
