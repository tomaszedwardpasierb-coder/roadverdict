// Place at: src/app/cars/buying-guide/page.tsx
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CarBuyingGuideForm } from '@/components/CarBuyingGuideForm';
import { CarRelatedTools } from '@/components/CarRelatedTools';
import { getSession } from '@/lib/auth/session';
import { isPro } from '@/lib/subscriptions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'What to check before you buy a used car',
  description:
    'Get a buyer checklist for a used car - inspection points and questions to ask the seller, weighted by how old the car is.',
  alternates: { canonical: '/cars/buying-guide' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict car buying guide',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
  description:
    "A buyer checklist for a used UK car - inspection points and seller questions, weighted by the car's age.",
};

export default async function CarBuyingGuidePage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Same defensive wrapping as the motorcycle buying-guide page: this
  // page previously had no Cosmos dependency, and getContainer() throws
  // unconditionally if Cosmos config is ever missing - a problem there
  // should degrade to "treat as anonymous", not take down a public,
  // no-account-needed tool for every visitor.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error("Car buying guide: getSession() failed, continuing as anonymous:", err);
  }
  const userIsPro = session ? await isPro(session.email) : false;

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
        <p>A buyer checklist weighted by how old the car actually is - not a generic list.</p>
      </div>
      <CarBuyingGuideForm signedIn={!!session} isPro={userIsPro} />
      <p className="disclaimer">
        General inspection guidance, not a substitute for a professional pre-purchase check -
        especially on anything safety-critical like brakes or structural condition.
      </p>
      <CarRelatedTools current="/cars/buying-guide" />
    </>
  );
}
