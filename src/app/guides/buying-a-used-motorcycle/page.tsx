// Place at: src/app/guides/buying-a-used-motorcycle/page.tsx
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';
import { AffiliateLine } from '@/components/AffiliateLine';
import { sportsbikeshopLinks } from '@/lib/affiliates';

export const metadata: Metadata = pageMetadata({
  title: 'Buying a Used Motorcycle: Checks & Paperwork',
  description:
    'Buying a motorcycle from a private seller? The UK checklist: V5C and free MOT history check, what to inspect, questions to ask, and the paperwork on the day.',
  path: '/guides/buying-a-used-motorcycle',
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Buying a Used Motorcycle', '/guides/buying-a-used-motorcycle');

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What paperwork do I need when buying a motorcycle privately?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The seller gives you the green new keeper slip from the V5C and tells DVLA about the sale. Tax doesn’t transfer, so you tax it yourself before you ride away, and you need your own insurance first. Write a receipt with the date, price, registration, VIN, and both names and addresses, signed by you both.',
      },
    },
    {
      '@type': 'Question',
      name: 'What paperwork should a used motorcycle have?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The V5C logbook showing the seller as the registered keeper, an MOT certificate if the bike is over three years old, and ideally a documented service history - receipts, a stamped book, or a digital record.',
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
      name: 'What are the biggest red flags when buying a used motorcycle?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A seller who won’t let you inspect the bike in daylight or won’t start it from cold, a VIN/frame number that doesn’t match the V5C, mismatched paint or gaps around the tank and fairings suggesting crash repair, and any pressure to pay a deposit before you’ve seen the bike in person.',
      },
    },
  ],
};

export default function BuyingAUsedMotorcyclePage() {
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
      <h1>What to Check Before Buying a Used Motorcycle</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        Buying a used motorcycle privately means there&apos;s no dealer warranty and no cooling-off
        period once you&apos;ve paid - what you check before handing over money is the only real
        protection you have. This is the checklist worth actually going through, not a generic
        list of &quot;check the tyres.&quot;
      </p>

      <h2>The paperwork, first</h2>
      <p style={{ maxWidth: 'none' }}>
        Before looking at the bike itself, check the documents match it:
      </p>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>The V5C logbook.</strong> The registration, make, model, colour, and VIN/frame
          number on the V5C must match the bike in front of you exactly. The seller&apos;s name
          and address should be the current registered keeper - if it isn&apos;t, ask why, since a
          private seller who isn&apos;t the registered keeper is a genuine red flag, not just an
          inconvenience.
        </li>
        <li>
          <strong>MOT history.</strong> Any bike over three years old needs a valid MOT. Beyond
          just checking it&apos;s current, the full test history - a free MOT history check by
          registration, on GOV.UK or in RoadVerdict&apos;s Buying Guide - shows advisories and past
          mileage readings. A pattern of the same advisory repeated test after test suggests
          something that&apos;s been ignored, not fixed.
        </li>
        <li>
          <strong>Service history.</strong> Receipts, a stamped service book, or a digital record
          all count. No history at all isn&apos;t automatically disqualifying on an older,
          cheaper bike, but it does mean you&apos;re buying on the bike&apos;s current condition
          alone, with nothing to fall back on if something goes wrong soon after.
        </li>
      </ul>

      <h2>Checking the bike itself</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>VIN/frame number.</strong> Confirm it matches the V5C and hasn&apos;t been
          tampered with - stamped digits that look re-punched, uneven, or sit in a panel that
          looks disturbed are worth walking away over, not negotiating past.
        </li>
        <li>
          <strong>Frame and fairing alignment.</strong> Stand back and sight down the bike from
          front and rear - a frame that&apos;s been straightened after a crash often shows as
          panels or the tank not sitting quite square, even when everything looks fine up close.
        </li>
        <li>
          <strong>Tyres.</strong> Check the date code (a four-digit code on the sidewall, week and
          year of manufacture) as well as tread depth - a tyre with plenty of tread but that&apos;s
          eight years old has perished rubber, whatever the depth gauge says.
        </li>
        <li>
          <strong>Chain and sprockets.</strong> A dry, rusty, or badly worn chain and hooked
          (shark-fin shaped) sprocket teeth point to a bike that&apos;s been neglected mechanically,
          not just cosmetically - worth checking even on a bike that otherwise looks immaculate.
        </li>
        <li>
          <strong>Forks and shock.</strong> Look for oil weeping down the fork legs, and press down
          on the bars to check the suspension returns smoothly rather than clunking or staying
          compressed.
        </li>
        <li>
          <strong>Starting from cold.</strong> Ask to start the bike before it&apos;s been warmed
          up - a bike that&apos;s suspiciously already warm when you arrive may be hiding a
          cold-start problem.
        </li>
        <li>
          <strong>Mileage versus condition.</strong> Worn pegs, a shiny worn patch on the seat, and
          a tank that&apos;s dulled from years of boot contact should roughly match the claimed
          mileage - a low reading on a visibly well-used bike is worth questioning directly.
        </li>
      </ul>

      <h2>Questions worth asking the seller directly</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>Why are you selling it?</li>
        <li>Has it ever been dropped, crashed, or had bodywork replaced?</li>
        <li>Is there any outstanding finance on it?</li>
        <li>Has it always been kept undercover, or often left outside?</li>
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
          bike is sold. Tax it yourself before you ride away - it takes minutes online with the
          11-digit reference number on the new keeper slip.
        </li>
        <li>
          <strong>Insurance first.</strong> You need your own insurance in place before you ride
          it home. Most insurers can start cover the same day.
        </li>
        <li>
          <strong>A written receipt.</strong> The date, the price, the registration, the VIN
          /frame number, and both names and addresses, signed by you both. &quot;Sold as seen&quot;
          doesn&apos;t let a seller off for describing the bike wrongly.
        </li>
        <li>
          <strong>Pay in a way that leaves a record.</strong> A bank transfer at the handover is
          safest. Never pay a deposit on a bike you haven&apos;t seen in person.
        </li>
        <li>
          <strong>Keep its history going.</strong> Put the receipt, the old MOTs and the service
          paperwork together - or 
          <Link href="/login?redirect=%2Fdashboard%3FaddVehicle%3Dbike">photograph them into a free RoadVerdict logbook</Link>
          {' '}- so the bike&apos;s history carries on with you, ready for when you sell it.
        </li>
      </ul>

      <h2>The last-mile check</h2>
      <p style={{ maxWidth: 'none' }}>
        A visual inspection can&apos;t tell you about outstanding finance, a stolen marker, or
        whether the bike&apos;s been written off and repaired - those need a real records check,
        not a walk-around. Run the registration through{' '}
        <Link href="/buying-guide">RoadVerdict&apos;s free Buying Guide</Link> first for the MOT
        history and an AI-written briefing, then add the full{' '}
        <Link href="/buying-guide">Independent Vehicle Check</Link> if anything above made you
        want the deeper certainty before you pay.
      </p>
      <AffiliateLine lead="Bought it? Keep it yours:" links={sportsbikeshopLinks(['disc-locks', 'security-chains'], 'guides')} />

      <p className="disclaimer" style={{ maxWidth: 'none' }}>
        General buying guidance, not a substitute for a professional pre-purchase inspection -
        especially for anything safety-critical like brakes, forks, or frame condition.
      </p>
    </div>
  );
}
