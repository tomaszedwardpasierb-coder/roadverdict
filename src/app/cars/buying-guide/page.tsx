// Place at: src/app/cars/buying-guide/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { CarBuyingGuideForm } from '@/components/CarBuyingGuideForm';
import { CarRelatedTools } from '@/components/CarRelatedTools';
import { getSession } from '@/lib/auth/session';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

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

// Marks up the FAQ section rendered below, in the same wording - Google's
// FAQPage guidelines require structured data to match visible page content.
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What does the Buying Guide check?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Enter a car’s registration to get a free buyer checklist, its full official MOT test history, an estimated valuation, and an AI-written briefing - weighted by how old the car actually is, not a generic list.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need an account?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. The checklist, MOT history, valuation, and briefing are all free with no account required.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I check the car’s history in more depth?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. An optional paid Independent Vehicle Check (stolen marker, write-off history, and outstanding finance) can be added on top of the free checklist.',
      },
    },
  ],
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Buying Guide', '/cars/buying-guide');

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

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        nonce={nonce}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="hero">
        <h1>What should you check before buying it?</h1>
        <p>A buyer checklist weighted by how old the car actually is - not a generic list.</p>
      </div>
      <CarBuyingGuideForm signedIn={!!session} />
      <p className="disclaimer">
        General inspection guidance, not a substitute for a professional pre-purchase check -
        especially on anything safety-critical like brakes or structural condition.
      </p>
      <CarRelatedTools current="/cars/buying-guide" />
      <p style={{ maxWidth: 'none', marginTop: '1rem' }}>
        Want the full checklist, not just this tool? Read{' '}
        <Link href="/guides/buying-a-used-car">What to Check Before Buying a Used Car</Link>.
      </p>
      <section aria-labelledby="buying-guide-faq-heading">
        <h2 id="buying-guide-faq-heading">Questions about the Buying Guide</h2>
        <h3>What does the Buying Guide check?</h3>
        <p>
          Enter a car&apos;s registration to get a free buyer checklist, its full official MOT
          test history, an estimated valuation, and an AI-written briefing - weighted by how old
          the car actually is, not a generic list.
        </p>
        <h3>Do I need an account?</h3>
        <p>
          No. The checklist, MOT history, valuation, and briefing are all free with no account
          required.
        </p>
        <h3>Can I check the car&apos;s history in more depth?</h3>
        <p>
          Yes. An optional paid Independent Vehicle Check (stolen marker, write-off history, and
          outstanding finance) can be added on top of the free checklist.
        </p>
      </section>
      <script
        type="application/ld+json"
        nonce={nonce}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}
