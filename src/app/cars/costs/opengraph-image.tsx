// Place at: src/app/cars/costs/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Price Guides · Cars · UK",
    "Car Service & Repair Costs",
    "Typical UK prices for common car jobs by car size, from named sources, with what drives the price."
  );
}
