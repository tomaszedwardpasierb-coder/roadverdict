// Place at: src/app/quote-checker/page.tsx
//
// Formerly the homepage (/) - moved here when /track's content was
// promoted to the site root. See src/app/page.tsx.
import type { Metadata } from 'next';
import { QuoteFormForViewer } from '@/components/viewer/ViewerForms';
import { RelatedTools } from '@/components/RelatedTools';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

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

// Marks up the FAQ section rendered below, in the exact same wording -
// Google's FAQPage guidelines require the structured data to match content
// that's actually visible on the page, not a hidden duplicate of it.
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How does the Quote Checker work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Enter your bike’s details, the job, and the price you were quoted. RoadVerdict compares it against typical UK price ranges for that job and engine size, and gives you a Fair, High, or Worth a Second Opinion verdict.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is the Quote Checker free?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, completely free, with no account needed.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is this the same as a professional inspection?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. It’s guidance benchmarked against typical prices, not a professional inspection or a guarantee that any individual garage’s price is unreasonable.',
      },
    },
  ],
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Quote Checker', '/quote-checker');

// Static on purpose - see middleware.ts's CACHEABLE_PUBLIC_PATHS. A signed-in
// visitor's signed-in state and own-vehicle prefill are resolved client-side
// by the ...ForViewer form wrapper; the server-rendered HTML is the
// anonymous version every visitor and search crawler gets. The JSON-LD
// blocks need no CSP nonce: they're data, never executed.
export default function QuoteCheckerPage() {
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
        <h1>Is your motorcycle service quote fair?</h1>
        <p>Three quick questions. One honest answer, benchmarked against typical UK prices.</p>
      </div>
      <QuoteFormForViewer />
      <p className="disclaimer">
        RoadVerdict compares your quote against typical price ranges for the same job on a
        similar bike. It&apos;s guidance, not a professional inspection or a guarantee any
        individual garage&apos;s price is unreasonable - a &quot;high&quot; verdict can still
        have a good reason behind it.
      </p>
      <RelatedTools current="/quote-checker" />
      <section aria-labelledby="quote-checker-faq-heading">
        <h2 id="quote-checker-faq-heading">Questions about the Quote Checker</h2>
        <h3>How does the Quote Checker work?</h3>
        <p>
          Enter your bike&apos;s details, the job, and the price you were quoted. RoadVerdict
          compares it against typical UK price ranges for that job and engine size, and gives
          you a Fair, High, or Worth a Second Opinion verdict.
        </p>
        <h3>Is the Quote Checker free?</h3>
        <p>Yes, completely free, with no account needed.</p>
        <h3>Is this the same as a professional inspection?</h3>
        <p>
          No. It&apos;s guidance benchmarked against typical prices, not a professional
          inspection or a guarantee that any individual garage&apos;s price is unreasonable.
        </p>
      </section>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}
