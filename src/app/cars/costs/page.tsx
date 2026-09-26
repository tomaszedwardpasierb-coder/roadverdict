// Place at: src/app/cars/costs/page.tsx
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { PriceGuideHub } from '@/components/seo/PriceGuideHub';

export const metadata: Metadata = pageMetadata({
  title: 'Car Service & Repair Costs UK: Price Guides by Job',
  description:
    'What common car jobs cost in the UK - full and interim services, oil changes, brake pads, tyres and the MOT - from named sources, by car size.',
  path: '/cars/costs',
});

export default function CarPriceGuidesPage() {
  return <PriceGuideHub vehicle="car" />;
}
