// Place at: tests/api/video-slug-route.test.ts
// The shared streaming itself (ranges, 416s, missing streams) is covered
// through /api/video/promo in video-promo-route.test.ts; this covers what
// the slug route adds - only a listed video can be streamed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  fromConnectionString: vi.fn(),
  getContainerClient: vi.fn(),
  getBlobClient: vi.fn(),
  getProperties: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: { fromConnectionString: mocks.fromConnectionString },
}));

import { GET } from "@/app/api/video/[slug]/route";
import { VIDEOS } from "@/lib/videos";

function call(slug: string, headers?: Record<string, string>) {
  return GET(new NextRequest(`http://localhost/api/video/${encodeURIComponent(slug)}`, { headers }), {
    params: Promise.resolve({ slug }),
  });
}

function fakeStream(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
}

describe("GET /api/video/[slug]", () => {
  const originalConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    process.env.AZURE_STORAGE_CONNECTION_STRING = "conn";
    mocks.fromConnectionString.mockReturnValue({ getContainerClient: mocks.getContainerClient });
    mocks.getContainerClient.mockReturnValue({ getBlobClient: mocks.getBlobClient });
    mocks.getBlobClient.mockReturnValue({ getProperties: mocks.getProperties, download: mocks.download });
    mocks.getProperties.mockResolvedValue({ contentLength: 1000, contentType: "video/mp4" });
    mocks.download.mockResolvedValue({ readableStreamBody: fakeStream() });
  });

  afterEach(() => {
    if (originalConnectionString === undefined) delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    else process.env.AZURE_STORAGE_CONNECTION_STRING = originalConnectionString;
  });

  it("streams a listed video's own blob from the videos container", async () => {
    const response = await call("ai-assistant");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(mocks.getContainerClient).toHaveBeenCalledWith("videos");
    expect(mocks.getBlobClient).toHaveBeenCalledWith("Roadverdict's AI short video.mp4");
  });

  it("serves byte ranges so the player can seek", async () => {
    const response = await call("ai-assistant", { range: "bytes=100-199" });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 100-199/1000");
    expect(mocks.download).toHaveBeenCalledWith(100, 100);
  });

  it.each(["not-a-video", "vide promocyjne.mp4", "Video1.mp4", "../secrets"])(
    "answers 404 for %s without touching storage - only listed videos can be streamed",
    async (slug) => {
      const response = await call(slug);
      expect(response.status).toBe(404);
      expect(mocks.fromConnectionString).not.toHaveBeenCalled();
    }
  );
});

describe("the video list", () => {
  it("gives every video a unique slug that is safe in a URL and an anchor", () => {
    const slugs = VIDEOS.map((v) => v.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("never gives a video the promo route's name, which would hide it behind that route", () => {
    expect(VIDEOS.map((v) => v.slug)).not.toContain("promo");
  });
});
