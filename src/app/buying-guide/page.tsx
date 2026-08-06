import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { BuyingGuideForm } from '@/components/BuyingGuideForm';

export const metadata: Metadata = {
  title: 'What to check before you buy a used motorcycle',
  description:
    'Get a buyer checklist for a used motorcycle - inspection points and questions to ask the seller, weighted by how old the bike is.',
  alternates: { canonical: '/buying-guide' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict buying guide',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
  description:
    'A buyer checklist for a used UK motorcycle - inspection points and seller questions, weighted by the bike\'s age.',
};

export default function BuyingGuidePage() {
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
        <h1>What should you check before buying it?</h1>
        <p>A buyer checklist weighted by how old the bike actually is - not a generic list.</p>
      </div>
      <BuyingGuideForm />
      <p className="disclaimer">
        General inspection guidance, not a substitute for a professional pre-purchase check -
        especially on anything safety-critical like brakes or frame condition.
      </p>
    </>
  );
}
