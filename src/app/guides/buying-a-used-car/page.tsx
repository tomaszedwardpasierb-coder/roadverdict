// Place at: src/app/guides/buying-a-used-car/page.tsx
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = pageMetadata({
  title: 'Buying a Used Car: Checks & Paperwork (UK)',
  description:
    'How to check a used car when buying it: V5C, free MOT history check, what to inspect, questions to ask the seller, and the paperwork for a private sale in the UK.',
  path: '/guides/buying-a-used-car',
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Buying a Used Car', '/guides/buying-a-used-car');

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What paperwork do I need when buying a car privately?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The seller gives you the green new keeper slip from the V5C and tells DVLA about the sale. Tax doesn’t transfer, so you tax it yourself before you drive away, and you need your own insurance first. Write a receipt with the date, price, registration, VIN, and both names and addresses, signed by you both.',
      },
    },
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
          just checking it&apos;s current, the full test history - a free MOT history check by
          registration, on GOV.UK or in RoadVerdict&apos;s Buying Guide - shows advisories and past
          mileage readings. A pattern of the same advisory repeated test after test suggests
          something that&apos;s been ignored, not fixed.
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

      <h2>Buying privately: the paperwork on the day</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>The new keeper slip.</strong> The seller gives you the green &quot;new keeper&quot;
          slip from the V5C and tells DVLA about the sale - online is quickest. Your own V5C then
          arrives by post in your name.
        </li>
        <li>
          <strong>Tax doesn&apos;t come with it.</strong> Vehicle tax no longer transfers when a
          car is sold. Tax it yourself before you drive away - it takes minutes online with the
          reference number on the green new keeper slip.
        </li>
        <li>
          <strong>Insurance first.</strong> You need your own insurance in place before you drive
          it home. Most insurers can start cover the same day.
        </li>
        <li>
          <strong>A written receipt.</strong> The date, the price, the registration, the VIN
          , and both names and addresses, signed by you both. &quot;Sold as seen&quot;
          doesn&apos;t let a seller off for describing the car wrongly.
        </li>
        <li>
          <strong>Pay in a way that leaves a record.</strong> A bank transfer at the handover is
          safest. Never pay a deposit on a car you haven&apos;t seen in person.
        </li>
        <li>
          <strong>Keep its history going.</strong> Put the receipt, the old MOTs and the service
          paperwork together - or 
          <Link href="/login?redirect=%2Fdashboard%3FaddVehicle%3Dcar">photograph them into a free RoadVerdict logbook</Link>
          {' '}- so the car&apos;s history carries on with you, ready for when you sell it.
        </li>
      </ul>

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
