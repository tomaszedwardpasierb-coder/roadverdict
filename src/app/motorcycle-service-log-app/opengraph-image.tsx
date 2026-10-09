// Place at: src/app/motorcycle-service-log-app/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "For Riders · Free to Start",
    "A Motorcycle Service Log That Fills Itself In",
    "Services, chain, tyres and MOT history in one place, with receipts read for you."
  );
}
