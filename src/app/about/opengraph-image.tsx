// Place at: src/app/about/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "About · Independent · UK",
    "Who Runs RoadVerdict",
    "An independent UK logbook for motorcycles and cars, and why it exists."
  );
}
