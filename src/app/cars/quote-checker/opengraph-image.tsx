// Place at: src/app/cars/quote-checker/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free Quote Checker · Cars",
    "Is Your Service Quote Fair?",
    "Enter your car, the job, and what you were quoted - get an instant verdict benchmarked against typical UK prices."
  );
}
