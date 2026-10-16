// Place at: src/app/cars/costs/[slug]/opengraph-image.tsx
//
// One share image per price guide, built from the guide's own question, so a
// shared link to "how much does a full service cost?" shows that question.
import { OG_IMAGE_CONTENT_TYPE, OG_IMAGE_SIZE, renderOgImage } from "@/lib/og/ogImage";
import { PRICE_GUIDES, findPriceGuide } from "@/lib/seo/priceGuides";

export const size = OG_IMAGE_SIZE;
export const contentType = OG_IMAGE_CONTENT_TYPE;

export function generateStaticParams() {
  return PRICE_GUIDES.car.map((g) => ({ slug: g.slug }));
}

export default async function Image(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const guide = findPriceGuide("car", slug);
  return renderOgImage(
    "Price Guide · Cars · UK",
    guide?.h1 ?? "Cars Price Guide",
    "Typical UK prices by car size, from named sources, with what drives the price and how to check a quote."
  );
}
