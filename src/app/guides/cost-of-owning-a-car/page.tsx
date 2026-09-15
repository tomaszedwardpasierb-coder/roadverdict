// Place at: src/app/guides/cost-of-owning-a-car/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = {
  title: 'The Real Cost of Owning a Car in the UK',
  description:
    'What a car actually costs beyond the purchase price - fuel, insurance, tax, servicing, tyres, and depreciation, and how to get a real number for a specific car.',
  alternates: { canonical: '/guides/cost-of-owning-a-car' },
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Cost of Owning a Car', '/guides/cost-of-owning-a-car');

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are the ongoing costs of owning a car, beyond fuel?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Insurance, annual road tax (VED), servicing and consumables (oil, tyres, brake pads, and a cambelt or timing chain on some engines), the MOT once the car is over three years old, and city charges like ULEZ or a Clean Air Zone if you regularly drive into one.',
      },
    },
    {
      '@type': 'Question',
      name: 'Are electric cars cheaper to run than petrol or diesel?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Usually cheaper per mile on energy cost and lower on servicing (fewer moving parts, no cambelt, less brake wear from regenerative braking), but the picture depends heavily on whether you can charge at home versus relying on public charging, which costs meaningfully more per mile.',
      },
    },
    {
      '@type': 'Question',
      name: 'How can I find out what my specific car actually costs?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'General estimates only go so far. RoadVerdict’s free Cost Calculator gives an estimate for a specific car, and logging real fuel and service costs in the free tracker turns that into your car’s actual number, not just a category average.',
      },
    },
  ],
};

export default function CostOfOwningACarPage() {
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
      <h1>The Real Cost of Owning a Car in the UK</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        The purchase price is the number everyone budgets for. It&apos;s also the smallest
        recurring cost you&apos;ll actually pay - everything below keeps costing money for as
        long as you own the car, and most of it is easy to underestimate before you&apos;ve lived
        with a car for a full year.
      </p>

      <h2>Fuel or electricity</h2>
      <p style={{ maxWidth: 'none' }}>
        The manufacturer&apos;s figure is a lab result, not what you&apos;ll actually get - real-world
        economy depends on engine size, driving style, and how much of your driving is motorway
        versus stop-start town traffic. For an electric or plug-in hybrid car, the real number
        also depends heavily on whether you&apos;re charging at home overnight or relying on public
        charging, which costs meaningfully more per mile.
      </p>

      <h2>Insurance</h2>
      <p style={{ maxWidth: 'none' }}>
        Driven by the car&apos;s insurance group, your age and experience, where you keep it
        overnight, and your claims/conviction history. Two similarly priced cars can sit in very
        different insurance groups depending on engine size, performance, and repair cost.
      </p>

      <h2>Road tax (VED)</h2>
      <p style={{ maxWidth: 'none' }}>
        Banded by CO2 emissions for the first year, then a standard rate after - with the notable
        exception that fully electric cars, previously exempt, are now brought into VED too.
        Worth checking current rates for the specific car rather than assuming an older figure
        still applies, since this is one of the areas that changes with policy.
      </p>

      <h2>Servicing and consumables</h2>
      <p style={{ maxWidth: 'none' }}>
        Oil changes, brake pads and discs, and tyres are the recurring basics. If the engine uses
        a cambelt rather than a timing chain, that&apos;s a real interval-based cost that arrives
        without warning if it&apos;s not tracked - and failing to replace it in time can cause serious
        engine damage, turning a moderate maintenance cost into a much larger repair bill.
      </p>

      <h2>MOT</h2>
      <p style={{ maxWidth: 'none' }}>
        Required annually once a car is three years old. The test fee itself is modest, but
        it&apos;s also the moment anything you&apos;ve been putting off - tyres, brakes, exhaust
        - gets forced into the open, often as a lump cost you didn&apos;t plan for that month.
      </p>

      <h2>City charges</h2>
      <p style={{ maxWidth: 'none' }}>
        Worth factoring in if you regularly drive into London or another city with a Clean Air
        Zone - ULEZ and CAZ charges apply to vehicles that don&apos;t meet the relevant emissions
        standard, and for a regular commute these add up to a real ongoing cost, not a one-off.
      </p>

      <h2>Depreciation</h2>
      <p style={{ maxWidth: 'none' }}>
        The cost nobody pays monthly but everyone pays eventually - the gap between what you paid
        and what you&apos;ll get when you sell. A well-documented service history narrows that gap
        more than almost anything else, since it&apos;s the one thing a buyer can&apos;t verify
        just by looking at the car.
      </p>

      <h2>Get a real number, not a general estimate</h2>
      <p style={{ maxWidth: 'none' }}>
        Everything above explains the categories - it can&apos;t tell you what your specific car
        actually costs. RoadVerdict&apos;s free <Link href="/cars/cost-calculator">Cost
        Calculator</Link> gives an estimate for a specific make, model, and engine size - petrol,
        diesel, hybrid, or electric - and logging real fuel and service costs in the free tracker
        turns that estimate into your car&apos;s actual number over time, not just a category
        average.
      </p>

      <p className="disclaimer" style={{ maxWidth: 'none' }}>
        General guidance on cost categories, not a quote for any specific car - costs vary
        significantly by make, model, fuel type, region, and how the car is actually used.
      </p>
    </div>
  );
}
