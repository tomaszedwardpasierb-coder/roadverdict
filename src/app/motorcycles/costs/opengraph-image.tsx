// Place at: src/app/motorcycles/costs/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Price Guides · Motorcycles · UK",
    "Motorcycle Service & Repair Costs",
    "Typical UK prices for common motorcycle jobs by engine size, from named sources, with what drives the price."
  );
}
