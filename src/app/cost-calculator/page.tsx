import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CostCalculatorForm } from '@/components/CostCalculatorForm';

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

export default function CostCalculatorPage() {
  const nonce = headers().get('x-nonce') ?? undefined;

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="hero">
        <h1>What does this bike actually cost you a year?</h1>
        <p>Servicing, tyres, MOT, tax, and fuel - one honest number, benchmarked against typical UK prices.</p>
      </div>
      <CostCalculatorForm />
      <p className="disclaimer">
        This is an estimate built from typical UK prices for your bike&apos;s size, make, and
        region - not a quote, and not a substitute for checking your own riding costs.
      </p>
    </>
  );
}
