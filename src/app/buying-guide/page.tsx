import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import Link from 'next/link';
import { Fragment } from 'react';
import { REPORT_PRICING_FAQ } from '@/lib/seo/reportPricingCopy';
import { BuyingGuideFormForViewer } from '@/components/viewer/BuyingGuideFormsForViewer';
import { RelatedTools } from '@/components/RelatedTools';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = pageMetadata({
  title: 'Free Motorcycle History Check: MOT & Mileage (UK)',
  description:
    "Free motorcycle history check by registration: the full MOT history with the mileage at every test, plus a buyer checklist for the bike's age. No account needed.",
  path: '/buying-guide',
});

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
        text: 'Yes. An optional paid Independent Vehicle Check (stolen marker, write-off history and outstanding finance) can be added on top of the free checklist.',
      },
    },
    ...REPORT_PRICING_FAQ.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  ],
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Buying Guide', '/buying-guide');

// Static on purpose - see middleware.ts's CACHEABLE_PUBLIC_PATHS. A signed-in
// visitor's signed-in state and own-vehicle prefill are resolved client-side
// by the ...ForViewer form wrapper; the server-rendered HTML is the
// anonymous version every visitor and search crawler gets. The JSON-LD
// blocks need no CSP nonce: they're data, never executed.
export default function BuyingGuidePage() {
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
        <h1>Free motorcycle history check</h1>
        <p>
          Enter the registration for the full MOT history, the mileage at every test, and a buyer
          checklist weighted by how old the bike actually is - not a generic list.
        </p>
      </div>
      <BuyingGuideFormForViewer />
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
          Yes. An optional paid Independent Vehicle Check (stolen marker, write-off history
          and outstanding finance) can be added on top of the free checklist.
        </p>
        {REPORT_PRICING_FAQ.map((f) => (
          <Fragment key={f.question}>
            <h3>{f.question}</h3>
            <p>{f.answer}</p>
          </Fragment>
        ))}
      </section>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}
