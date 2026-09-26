// Place at: src/app/motorcycles/costs/[slug]/page.tsx
//
// One page per job in PRICE_GUIDES.motorcycle, generated at build time - an
// unknown slug is a 404, never a page rendered on demand.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PriceGuidePage } from '@/components/seo/PriceGuidePage';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { PRICE_GUIDES, findPriceGuide, priceGuidePath } from '@/lib/seo/priceGuides';

export const dynamicParams = false;

export function generateStaticParams() {
  return PRICE_GUIDES.motorcycle.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const guide = findPriceGuide('motorcycle', slug);
  if (!guide) return {};
  return pageMetadata({ title: guide.title, description: guide.description, path: priceGuidePath(guide) });
}

export default async function MotorcyclePriceGuide(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const guide = findPriceGuide('motorcycle', slug);
  if (!guide) notFound();
  return <PriceGuidePage guide={guide} />;
}
