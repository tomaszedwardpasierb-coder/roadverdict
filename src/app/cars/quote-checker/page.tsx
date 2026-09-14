// Place at: src/app/cars/quote-checker/page.tsx
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CarQuoteForm } from '@/components/CarQuoteForm';
import { getSession } from '@/lib/auth/session';
import { getPrimaryCar } from '@/lib/tracker/car';
import { CAR_BRAND_OPTIONS, slugifyCarMake, type CarBenchmarkClass } from '@/lib/carPriceData';
import { CarRelatedTools } from '@/components/CarRelatedTools';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Is your car service quote fair?',
  description:
    'Enter your car, the job, and what you were quoted. Get an instant fair, high, or worth-a-second-opinion verdict benchmarked against typical UK prices.',
  alternates: { canonical: '/cars/quote-checker' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict car quote checker',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
  description:
    'Check whether a UK car service or repair quote is fair, high, or worth a second opinion, benchmarked against typical prices.',
};

// Marks up the FAQ section rendered below, in the same wording - Google's
// FAQPage guidelines require structured data to match visible page content.
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How does the Quote Checker work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Enter your car’s details, the job, and the price you were quoted. RoadVerdict compares it against typical UK price ranges for that job and engine size, and gives you a Fair, High, or Worth a Second Opinion verdict.',
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

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Quote Checker', '/cars/quote-checker');

function classFromEngineLitres(engineLitres: number): CarBenchmarkClass {
  if (engineLitres <= 1.2) return 'small';
  if (engineLitres <= 2.0) return 'medium';
  return 'large';
}

export default async function CarQuoteCheckerPage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Same defensive wrapping as every other public tool page: a Cosmos
  // problem should degrade this to "treat as anonymous," not take down a
  // public, no-account-needed tool for every visitor.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error('Car quote checker: getSession() failed, continuing as anonymous:', err);
  }
  const car = session ? await getPrimaryCar(session.email).catch(() => null) : null;

  let initialBrand: string | undefined;
  let initialCarClass: CarBenchmarkClass | undefined;
  if (car) {
    const slug = slugifyCarMake(car.make);
    initialBrand = CAR_BRAND_OPTIONS.some((b) => b.value === slug) ? slug : 'other';
    if (car.fuelType !== 'electric' && car.engineLitres) {
      initialCarClass = classFromEngineLitres(car.engineLitres);
    }
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
        <h1>Is your car service quote fair?</h1>
        <p>Four quick questions. One honest answer, benchmarked against typical UK prices.</p>
      </div>
      <CarQuoteForm signedIn={!!session} initialBrand={initialBrand} initialCarClass={initialCarClass} />
      <p className="disclaimer">
        RoadVerdict compares your quote against typical price ranges for the same job on a
        similar-sized car. It&apos;s guidance, not a professional inspection or a guarantee any
        individual garage&apos;s price is unreasonable - a &quot;high&quot; verdict can still
        have a good reason behind it. Electric cars aren&apos;t supported yet - not enough
        sourced UK price data.
      </p>
      <CarRelatedTools current="/cars/quote-checker" />
      <section aria-labelledby="quote-checker-faq-heading">
        <h2 id="quote-checker-faq-heading">Questions about the Quote Checker</h2>
        <h3>How does the Quote Checker work?</h3>
        <p>
          Enter your car&apos;s details, the job, and the price you were quoted. RoadVerdict
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
        nonce={nonce}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}
