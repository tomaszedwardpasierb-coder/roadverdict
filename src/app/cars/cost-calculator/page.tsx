// Place at: src/app/cars/cost-calculator/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { CarCostCalculatorFormForViewer } from '@/components/viewer/ViewerForms';
import { CarRelatedTools } from '@/components/CarRelatedTools';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = {
  title: 'True cost of owning your car',
  description:
    'Work out the true annual cost of owning your car - servicing, tyres, MOT, road tax, and fuel - benchmarked against typical UK prices.',
  alternates: { canonical: '/cars/cost-calculator' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict car cost calculator',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
  description:
    'Estimate the true annual cost of owning a car in the UK, covering servicing, tyres, MOT, road tax, and fuel.',
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Cost Calculator', '/cars/cost-calculator');

// Static on purpose - see middleware.ts's CACHEABLE_PUBLIC_PATHS. A signed-in
// visitor's signed-in state and own-vehicle prefill are resolved client-side
// by the ...ForViewer form wrapper; the server-rendered HTML is the
// anonymous version every visitor and search crawler gets. The JSON-LD
// blocks need no CSP nonce: they're data, never executed.
export default function CarCostCalculatorPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="hero">
        <h1>What does this car actually cost you a year?</h1>
        <p>Servicing, tyres, MOT, tax, and fuel - one honest number, benchmarked against typical UK prices.</p>
      </div>
      <CarCostCalculatorFormForViewer />
      <p className="disclaimer">
        This is an estimate built from typical UK prices for your car&apos;s size, fuel type,
        and region - not a quote, and not a substitute for checking your own running costs.
        Fully electric cars aren&apos;t supported yet - not enough sourced UK price data.
      </p>
      <CarRelatedTools current="/cars/cost-calculator" />
      <p style={{ maxWidth: 'none', marginTop: '1rem' }}>
        Want to understand every cost category, not just this estimate? Read{' '}
        <Link href="/guides/cost-of-owning-a-car">The Real Cost of Owning a Car in the UK</Link>.
      </p>
    </>
  );
}
