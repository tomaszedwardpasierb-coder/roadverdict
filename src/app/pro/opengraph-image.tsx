// Place at: src/app/pro/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "RoadVerdict Pro",
    "Everything Unlocked",
    "Exact reminder dates, batch receipt scanning, full reports and a vehicle history report every 4 weeks. The first 14 days are free."
  );
}
