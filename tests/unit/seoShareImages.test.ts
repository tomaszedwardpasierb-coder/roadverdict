// Every public page sets its own share tags, and a page that does loses the parent's share image - so each
// listed page needs its own opengraph-image.tsx (found 16 Oct 2026: 18 pages had none, so their shared links
// previewed with no picture). Also keeps price-guide titles and descriptions inside what Google shows.
import { existsSync } from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import sitemap from "@/app/sitemap";
import { PRICE_GUIDES, priceGuidePath } from "@/lib/seo/priceGuides";

const APP = path.join(process.cwd(), "src/app");
const guidePaths = new Set(Object.values(PRICE_GUIDES).flat().map(priceGuidePath));

// Where a path's share image lives: its own folder, or the [slug] folder for a generated price guide.
function imageFile(pathname: string): string {
  if (pathname === "/") return path.join(APP, "opengraph-image.tsx");
  const dir = guidePaths.has(pathname) ? path.join(APP, path.dirname(pathname), "[slug]") : path.join(APP, pathname);
  return path.join(dir, "opengraph-image.tsx");
}

describe("share images", () => {
  const paths = sitemap().map((e) => e.url.replace("https://roadverdict.co.uk", "") || "/");

  it("every page in the sitemap has its own share image", () => {
    const missing = paths.filter((p) => !existsSync(imageFile(p)));
    expect(missing, `No opengraph-image.tsx for: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("price guide titles and descriptions", () => {
  const guides = Object.entries(PRICE_GUIDES).flatMap(([vehicle, list]) => list.map((g) => ({ vehicle, ...g })));

  it("descriptions fit what Google shows (70 to 160 characters)", () => {
    for (const g of guides) {
      expect(g.description.length, `${g.vehicle}/${g.slug} description`).toBeGreaterThanOrEqual(70);
      expect(g.description.length, `${g.vehicle}/${g.slug} description`).toBeLessThanOrEqual(160);
    }
  });

  it("titles stay within 70 characters once ' | RoadVerdict' is added", () => {
    for (const g of guides) {
      expect(g.title.length + " | RoadVerdict".length, `${g.vehicle}/${g.slug} title`).toBeLessThanOrEqual(70);
    }
  });
});
