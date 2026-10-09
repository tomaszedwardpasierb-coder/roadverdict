// Place at: src/app/vehicle-smart-alternative/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Honest Comparison · Motorcycles & Cars",
    "Looking for a Vehicle Smart Alternative?",
    "Vehicle Smart checks any vehicle. RoadVerdict keeps your own vehicle's full history."
  );
}
