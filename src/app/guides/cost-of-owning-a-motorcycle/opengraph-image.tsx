// Place at: src/app/guides/cost-of-owning-a-motorcycle/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free Guide · Motorcycles",
    "The Real Cost of Owning a Motorcycle in the UK",
    "Fuel, insurance, tax, servicing and depreciation - the full picture, not just the price on the forecourt."
  );
}
