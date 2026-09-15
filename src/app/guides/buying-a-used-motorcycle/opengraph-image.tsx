// Place at: src/app/guides/buying-a-used-motorcycle/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free Guide · Motorcycles",
    "What to Check Before Buying a Used Motorcycle",
    "The paperwork, the mechanical checks, and the questions to ask - before you hand over any money."
  );
}
