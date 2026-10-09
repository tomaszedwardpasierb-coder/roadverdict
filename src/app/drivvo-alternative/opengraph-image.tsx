// Place at: src/app/drivvo-alternative/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Honest Comparison · Motorcycles & Cars",
    "A Drivvo and Fuelio Alternative Built for the UK",
    "MOT history and road tax by registration, receipts read for you, UK prices."
  );
}
