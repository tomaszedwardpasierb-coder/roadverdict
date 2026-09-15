// Place at: src/app/guides/buying-a-used-car/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = {
  title: 'What to Check Before Buying a Used Car',
  description:
    'A real UK buyer checklist: paperwork, mechanical checks, and the questions to ask before you hand over any money for a used car.',
  alternates: { canonical: '/guides/buying-a-used-car' },
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Buying a Used Car', '/guides/buying-a-used-car');

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What paperwork should a used car have?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The V5C logbook showing the seller as the registered keeper, an MOT certificate if the car is over three years old, and ideally a documented service history - receipts, a stamped book, or a digital record.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is a free HPI-style check enough, or should I pay for one?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A free registration lookup shows official MOT and tax history, which is a genuinely useful first check. It won’t tell you about outstanding finance, a stolen marker, or a write-off record - for those you need a paid vehicle-history check.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are the biggest red flags when buying a used car?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A seller who won’t let you inspect the car in daylight, a VIN that doesn’t match the V5C, mismatched paint or panel gaps suggesting crash repair, an engine warning light cleared just before viewing, and any pressure to pay a deposit before you’ve seen the car in person.',
      },
    },
  ],
};

export default function BuyingAUsedCarPage() {
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
      <h1>What to Check Before Buying a Used Car</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        Buying a used car privately means there&apos;s no dealer warranty and no cooling-off
        period once you&apos;ve paid - what you check before handing over money is the only real
        protection you have. This is the checklist worth actually going through, not a generic
        list of &quot;check the tyres.&quot;
      </p>

      <h2>The paperwork, first</h2>
      <p style={{ maxWidth: 'none' }}>
        Before looking at the car itself, check the documents match it:
      </p>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>The V5C logbook.</strong> The registration, make, model, colour, and VIN on the
          V5C must match the car in front of you exactly. The seller&apos;s name and address
          should be the current registered keeper - if it isn&apos;t, ask why, since a private
          seller who isn&apos;t the registered keeper is a genuine red flag, not just an
          inconvenience.
        </li>
        <li>
          <strong>MOT history.</strong> Any car over three years old needs a valid MOT. Beyond
          just checking it&apos;s current, the full test history (free to look up by registration)
          shows advisories and past mileage readings - a pattern of the same advisory repeated
          test after test suggests something that&apos;s been ignored, not fixed.
        </li>
        <li>
          <strong>Service history.</strong> Receipts, a stamped service book, or a digital record
          all count. No history at all isn&apos;t automatically disqualifying on an older,
          cheaper car, but it does mean you&apos;re buying on the car&apos;s current condition
          alone, with nothing to fall back on if something goes wrong soon after.
        </li>
      </ul>

      <h2>Checking the car itself</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>VIN plate.</strong> Confirm it matches the V5C and hasn&apos;t been tampered
          with - a plate that looks re-riveted, sits crookedly, or has digits that don&apos;t
          quite align is worth walking away over, not negotiating past.
        </li>
        <li>
          <strong>Panel gaps and paint.</strong> Sight down each side of the car in good light -
          uneven gaps between panels, or a slightly different shade of paint on one panel, both
          point to accident repair even when the bodywork looks fine at a glance.
        </li>
        <li>
          <strong>Tyres.</strong> Check the date code (a four-digit code on the sidewall, week and
          year of manufacture) as well as tread depth - a tyre with plenty of tread but that&apos;s
          eight years old has perished rubber, whatever the depth gauge says. Uneven wear across
          the tread can also point to an alignment or suspension problem.
        </li>
        <li>
          <strong>Underbody and sills.</strong> Rust on the sills, subframe, or around suspension
          mounting points is a much bigger problem than surface rust on a wheel arch - it&apos;s
          worth a look underneath with a torch, not just a glance at the paintwork.
        </li>
        <li>
          <strong>Cambelt or timing chain history.</strong> If the engine uses a cambelt, check
          when it was last replaced - it&apos;s an interval-based part that fails without warning,
          and a car approaching or past its due interval with no record of replacement is a real
          near-term cost, not a hypothetical one.
        </li>
        <li>
          <strong>Warning lights and electrics.</strong> Start the car cold if possible, and check
          every warning light illuminates briefly then clears - one that stays on, or one that&apos;s
          suspiciously absent entirely (a bulb removed rather than the fault fixed), both matter.
        </li>
        <li>
          <strong>Mileage versus condition.</strong> Worn pedal rubbers, a shiny worn driver&apos;s
          seat bolster, and general interior wear should roughly match the claimed mileage - a low
          reading on a visibly well-used interior is worth questioning directly.
        </li>
      </ul>

      <h2>Questions worth asking the seller directly</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>Why are you selling it?</li>
        <li>Has it ever been in an accident or had bodywork repaired?</li>
        <li>Is there any outstanding finance on it?</li>
        <li>Has it always been kept on a driveway, or often parked on the street?</li>
        <li>Do you have the original keys, and how many?</li>
      </ul>
      <p style={{ maxWidth: 'none' }}>
        A seller who answers these quickly and consistently, with paperwork to back it up, is a
        much better sign than the price alone.
      </p>

      <h2>The last-mile check</h2>
      <p style={{ maxWidth: 'none' }}>
        A visual inspection can&apos;t tell you about outstanding finance, a stolen marker, or
        whether the car&apos;s been written off and repaired - those need a real records check,
        not a walk-around. Run the registration through{' '}
        <Link href="/cars/buying-guide">RoadVerdict&apos;s free Buying Guide</Link> first for the
        MOT history, an estimated valuation, and an AI-written briefing, then add the full{' '}
        <Link href="/cars/buying-guide">Independent Vehicle Check</Link> if anything above made
        you want the deeper certainty before you pay.
      </p>

      <p className="disclaimer" style={{ maxWidth: 'none' }}>
        General buying guidance, not a substitute for a professional pre-purchase inspection -
        especially for anything safety-critical like brakes, tyres, or structural condition.
      </p>
    </div>
  );
}
