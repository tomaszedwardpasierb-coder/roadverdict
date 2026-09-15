// Place at: src/app/guides/cost-of-owning-a-car/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free Guide · Cars",
    "The Real Cost of Owning a Car in the UK",
    "Fuel, insurance, tax, servicing and depreciation - the full picture, not just the price on the forecourt."
  );
}
