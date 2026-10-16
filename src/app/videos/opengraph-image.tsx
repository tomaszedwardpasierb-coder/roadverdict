// Place at: src/app/videos/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Videos · Motorcycles & Cars",
    "RoadVerdict in Short Videos",
    "Quote checks, receipt scanning and what it all really costs, in under a minute."
  );
}
