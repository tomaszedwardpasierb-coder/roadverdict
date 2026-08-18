// Place at: src/app/quote-checker/page.tsx
//
// Formerly the homepage (/) - moved here when /track's content was
// promoted to the site root. See src/app/page.tsx.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { QuoteForm } from '@/components/QuoteForm';
import { getSession } from '@/lib/auth/session';
import { getPrimaryBike } from '@/lib/tracker/bike';
import { BRAND_OPTIONS } from '@/lib/priceData';
import { getBikeClassForCC, slugifyMake } from '@/lib/motorcycleModels';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Is your motorcycle service quote fair?',
  description:
    'Enter your bike, the job, and what you were quoted. Get an instant fair, high, or worth-a-second-opinion verdict benchmarked against typical UK prices.',
  alternates: { canonical: '/quote-checker' },
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

export default async function QuoteCheckerPage() {
  const nonce = headers().get('x-nonce') ?? undefined;

  // Same defensive wrapping as Cost Calculator: this page previously
  // had no Cosmos dependency, and getContainer() throws unconditionally
  // if Cosmos config is ever missing - a problem there should degrade
  // to "treat as anonymous", not take down a public, no-account-needed
  // tool for every visitor.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error("Quote checker: getSession() failed, continuing as anonymous:", err);
  }
  const bike = session ? await getPrimaryBike(session.email).catch(() => null) : null;

  let initialBrand: string | undefined;
  let initialBikeClass: 'small' | 'medium' | 'large' | undefined;
  if (bike) {
    const slug = slugifyMake(bike.make);
    initialBrand = BRAND_OPTIONS.some((b) => b.value === slug) ? slug : 'other';
    initialBikeClass = getBikeClassForCC(bike.engineCC);
  }

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
      <QuoteForm signedIn={!!session} initialBrand={initialBrand} initialBikeClass={initialBikeClass} />
      <p className="disclaimer">
        RoadVerdict compares your quote against typical price ranges for the same job on a
        similar bike. It&apos;s guidance, not a professional inspection or a guarantee any
        individual garage&apos;s price is unreasonable - a &quot;high&quot; verdict can still
        have a good reason behind it.
      </p>
    </>
  );
}
