// Place at: src/app/motorcycles/costs/page.tsx
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { PriceGuideHub } from '@/components/seo/PriceGuideHub';

export const metadata: Metadata = pageMetadata({
  title: 'Motorcycle Service & Repair Costs UK: Price Guides',
  description:
    'What common motorcycle jobs cost in the UK - full and basic services, tyres, brake pads, chain and sprockets and the MOT - from named sources, by engine size.',
  path: '/motorcycles/costs',
});

export default function MotorcyclePriceGuidesPage() {
  return <PriceGuideHub vehicle="motorcycle" />;
}
