// Place at: src/app/guides/cost-of-owning-a-motorcycle/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = {
  title: 'The Real Cost of Owning a Motorcycle in the UK',
  description:
    'What a motorcycle actually costs beyond the purchase price - fuel, insurance, tax, servicing, tyres, and depreciation, and how to get a real number for a specific bike.',
  alternates: { canonical: '/guides/cost-of-owning-a-motorcycle' },
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Cost of Owning a Motorcycle', '/guides/cost-of-owning-a-motorcycle');

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are the ongoing costs of owning a motorcycle, beyond fuel?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Insurance, annual road tax (VED), servicing and consumables (oil, tyres, chain and sprockets, brake pads), the MOT once the bike is over three years old, and riding kit - helmet, gloves, and protective clothing all wear out and need replacing over time.',
      },
    },
    {
      '@type': 'Question',
      name: 'Are motorcycles cheaper to run than cars?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Usually yes on fuel and often on insurance and tax, but the gap is narrower than it first looks once consumables (tyres, chain and sprockets) and riding kit are counted - these wear faster and cost more, proportionally, than the equivalent car parts.',
      },
    },
    {
      '@type': 'Question',
      name: 'How can I find out what my specific motorcycle actually costs?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'General estimates only go so far. RoadVerdict’s free Cost Calculator gives an estimate for a specific bike, and logging real fuel and service costs in the free tracker turns that into your bike’s actual number, not just a category average.',
      },
    },
  ],
};

export default function CostOfOwningAMotorcyclePage() {
  return (
    <div className="hero">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h1>The Real Cost of Owning a Motorcycle in the UK</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        The purchase price is the number everyone budgets for. It&apos;s also the smallest
        recurring cost you&apos;ll actually pay - everything below keeps costing money for as
        long as you own the bike, and most of it is easy to underestimate before you&apos;ve
        lived with a bike for a full year.
      </p>

      <h2>Fuel</h2>
      <p style={{ maxWidth: 'none' }}>
        The number on a spec sheet is a lab figure, not what you&apos;ll actually get - real-world
        fuel economy depends on engine size, riding style, and how much of your riding is
        motorway versus town. A smaller, single-cylinder commuter bike will use meaningfully less
        fuel than a larger multi-cylinder bike covering the same miles.
      </p>

      <h2>Insurance</h2>
      <p style={{ maxWidth: 'none' }}>
        Driven by engine size, bike value, where you keep it overnight, your riding experience,
        and your claims/conviction history. A powerful sports bike and a small commuter bike from
        the same rider can carry very different premiums for exactly the same annual mileage.
      </p>

      <h2>Road tax (VED)</h2>
      <p style={{ maxWidth: 'none' }}>
        Motorcycle VED is banded by engine size and is generally low compared to cars - but
        it&apos;s still a real annual cost, and it&apos;s one of the few here that&apos;s fixed
        and predictable rather than variable.
      </p>

      <h2>Servicing and consumables</h2>
      <p style={{ maxWidth: 'none' }}>
        This is where motorcycle ownership costs surprise people who&apos;ve only budgeted like a
        car owner. Chains and sprockets wear and need replacing periodically, tyres wear faster
        than a car&apos;s (a sportier bike ridden hard can go through a rear tyre in a fraction of
        a car tyre&apos;s life), and brake pads see more use proportionally. None of this is
        optional maintenance - it&apos;s the cost of the bike actually being safe to ride.
      </p>

      <h2>MOT</h2>
      <p style={{ maxWidth: 'none' }}>
        Required annually once a bike is three years old. The test fee itself is modest, but
        it&apos;s also the moment anything you&apos;ve been putting off - tyres, brakes, lighting
        - gets forced into the open, often as a lump cost you didn&apos;t plan for that month.
      </p>

      <h2>Riding kit</h2>
      <p style={{ maxWidth: 'none' }}>
        Easy to forget when budgeting for the bike itself: a helmet, gloves, and protective
        clothing aren&apos;t one-time costs. A helmet has a genuine usable lifespan and needs
        replacing after any real impact regardless of visible damage, and kit generally wears out
        with regular use the same way any other protective equipment does.
      </p>

      <h2>Depreciation</h2>
      <p style={{ maxWidth: 'none' }}>
        The cost nobody pays monthly but everyone pays eventually - the gap between what you paid
        and what you&apos;ll get when you sell. A well-documented service history narrows that gap
        more than almost anything else, since it&apos;s the one thing a buyer can&apos;t verify
        just by looking at the bike.
      </p>

      <h2>Get a real number, not a general estimate</h2>
      <p style={{ maxWidth: 'none' }}>
        Everything above explains the categories - it can&apos;t tell you what your specific bike
        actually costs. RoadVerdict&apos;s free{' '}
        <Link href="/cost-calculator">Cost Calculator</Link> gives an estimate for a specific
        make, model, and engine size, and logging real fuel and service costs in the free tracker
        turns that estimate into your bike&apos;s actual number over time, not just a category
        average.
      </p>

      <p className="disclaimer" style={{ maxWidth: 'none' }}>
        General guidance on cost categories, not a quote for any specific bike - costs vary
        significantly by make, model, engine size, region, and how the bike is actually used.
      </p>
    </div>
  );
}
