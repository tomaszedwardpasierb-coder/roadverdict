import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { QuoteForm } from '@/components/QuoteForm';
export const metadata: Metadata = {
  title: 'Is your motorcycle service quote fair?',
  description:
    'Enter your bike, the job, and what you were quoted. Get an instant fair, high, or worth-a-second-opinion verdict benchmarked against typical UK prices.',
  alternates: { canonical: '/' },
};
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict quote checker',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'GBP',
  },
  description:
    'Check whether a UK motorcycle service or repair quote is fair, high, or worth a second opinion, benchmarked against typical prices.',
};
export default function HomePage() {
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
        <h1>Is your service quote fair?</h1>
        <p>Three quick questions. One honest answer, benchmarked against typical UK prices.</p>
      </div>
      <QuoteForm />
      <p className="disclaimer">
        RoadVerdict compares your quote against typical price ranges for the same job on a
        similar bike. It&apos;s guidance, not a professional inspection or a guarantee any
        individual garage&apos;s price is unreasonable - a &quot;high&quot; verdict can still
        have a good reason behind it.
      </p>
    </>
  );
}
