// Place at: src/app/terms/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Terms",
    "Terms of Service",
    "Accounts, RoadVerdict Pro, history checks, refunds and your right to cancel - in plain English."
  );
}
