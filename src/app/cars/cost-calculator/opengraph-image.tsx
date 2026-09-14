// Place at: src/app/cars/cost-calculator/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free Cost Calculator · Cars",
    "What Will This Car Really Cost?",
    "Estimated fuel, insurance, servicing and tax costs before you commit to buying - no account needed."
  );
}
