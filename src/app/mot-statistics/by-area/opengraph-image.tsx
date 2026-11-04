// Place at: src/app/mot-statistics/by-area/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";
import { MOT_AREA_STATISTICS as A } from "@/lib/mot/motAreaStatistics";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

const worst = A.areas[0];
const best = A.areas[A.areas.length - 1];
const rate = (a: { tests: number; failedFirstTime: number }) => ((100 * a.failedFirstTime) / a.tests).toFixed(1);

export default function Image() {
  return renderOgImage(
    "DVSA data · Cars",
    `MOT Fail Rates by Area ${A.year}`,
    `Highest: ${worst.name}, ${rate(worst)}%. Lowest: ${best.name}, ${rate(best)}%. All ${A.areas.length} postcode areas ranked.`
  );
}
