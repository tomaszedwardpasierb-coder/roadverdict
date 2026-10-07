// Place at: src/app/guides/motorcycle-road-tax/opengraph-image.tsx
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export default function Image() {
  return renderOgImage(
    "Free Guide · Motorcycles",
    "Motorcycle Road Tax by Engine Size",
    "The official UK rates, monthly payments, electric bikes and buying used."
  );
}
