import type { Metadata } from 'next';
import Link from 'next/link';
import { CostCalculatorFormForViewer } from '@/components/viewer/ViewerForms';
import { RelatedTools } from '@/components/RelatedTools';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = {
  title: 'True cost of owning your motorcycle',
  description:
    'Work out the true annual cost of owning your motorcycle - servicing, tyres, MOT, road tax, and fuel - benchmarked against typical UK prices.',
  alternates: { canonical: '/cost-calculator' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict cost calculator',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
  description:
    'Estimate the true annual cost of owning a motorcycle in the UK, covering servicing, tyres, MOT, road tax, and fuel.',
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Cost Calculator', '/cost-calculator');

// Static on purpose - see middleware.ts's CACHEABLE_PUBLIC_PATHS. A signed-in
// visitor's signed-in state and own-vehicle prefill are resolved client-side
// by the ...ForViewer form wrapper; the server-rendered HTML is the
// anonymous version every visitor and search crawler gets. The JSON-LD
// blocks need no CSP nonce: they're data, never executed.
export default function CostCalculatorPage() {
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
        <h1>What does this bike actually cost you a year?</h1>
        <p>Servicing, tyres, MOT, tax, and fuel - one honest number, benchmarked against typical UK prices.</p>
      </div>
      <CostCalculatorFormForViewer />
      <p className="disclaimer">
        This is an estimate built from typical UK prices for your bike&apos;s size, make, and
        region - not a quote, and not a substitute for checking your own riding costs.
      </p>
      <RelatedTools current="/cost-calculator" />
      <p style={{ maxWidth: 'none', marginTop: '1rem' }}>
        Want to understand every cost category, not just this estimate? Read{' '}
        <Link href="/guides/cost-of-owning-a-motorcycle">The Real Cost of Owning a Motorcycle in the UK</Link>.
      </p>
    </>
  );
}
