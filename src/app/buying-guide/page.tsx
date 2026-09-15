import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { BuyingGuideForm } from '@/components/BuyingGuideForm';
import { RelatedTools } from '@/components/RelatedTools';
import { getSession } from '@/lib/auth/session';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const dynamic = 'force-dynamic';

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
        text: 'Enter a motorcycle’s registration to get a free buyer checklist, its full official MOT test history, and an AI-written briefing - weighted by how old the bike actually is, not a generic list.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need an account?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. The checklist, MOT history, and briefing are all free with no account required.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I check the bike’s history in more depth?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. An optional paid Independent Vehicle Check (stolen marker, write-off history, outstanding finance, and a valuation) can be added on top of the free checklist.',
      },
    },
  ],
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Buying Guide', '/buying-guide');

export default async function BuyingGuidePage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Same defensive wrapping as Cost Calculator and Quote Checker: this
  // page previously had no Cosmos dependency, and getContainer() throws
  // unconditionally if Cosmos config is ever missing - a problem there
  // should degrade to "treat as anonymous", not take down a public,
  // no-account-needed tool for every visitor.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error("Buying guide: getSession() failed, continuing as anonymous:", err);
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
        <p>A buyer checklist weighted by how old the bike actually is - not a generic list.</p>
      </div>
      <BuyingGuideForm signedIn={!!session} />
      <p className="disclaimer">
        General inspection guidance, not a substitute for a professional pre-purchase check -
        especially on anything safety-critical like brakes or frame condition.
      </p>
      <RelatedTools current="/buying-guide" />
      <p style={{ maxWidth: 'none', marginTop: '1rem' }}>
        Want the full checklist, not just this tool? Read{' '}
        <Link href="/guides/buying-a-used-motorcycle">What to Check Before Buying a Used Motorcycle</Link>.
      </p>
      <section aria-labelledby="buying-guide-faq-heading">
        <h2 id="buying-guide-faq-heading">Questions about the Buying Guide</h2>
        <h3>What does the Buying Guide check?</h3>
        <p>
          Enter a motorcycle&apos;s registration to get a free buyer checklist, its full
          official MOT test history, and an AI-written briefing - weighted by how old the bike
          actually is, not a generic list.
        </p>
        <h3>Do I need an account?</h3>
        <p>No. The checklist, MOT history, and briefing are all free with no account required.</p>
        <h3>Can I check the bike&apos;s history in more depth?</h3>
        <p>
          Yes. An optional paid Independent Vehicle Check (stolen marker, write-off history,
          outstanding finance, and a valuation) can be added on top of the free checklist.
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
