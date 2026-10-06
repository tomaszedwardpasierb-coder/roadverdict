// Place at: src/app/guides/proving-service-history/page.tsx
//
// One of SEO_STRATEGY.md's "documented-history guides": selling with a
// history a buyer can actually check. Covers motorcycles and cars together,
// with the places they differ called out, since the evidence itself
// (invoices, stamps, MOT history) is the same kind of thing for both.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = pageMetadata({
  title: 'How to Prove Service History When Selling (UK)',
  description:
    'Selling a motorcycle or car? What counts as service history, what buyers check, how to show receipts, stamps and MOT history - and what never to share.',
  path: '/guides/proving-service-history',
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Proving Service History', '/guides/proving-service-history');

const FAQ = [
  {
    q: 'What counts as a full service history?',
    a: 'Every service the manufacturer recommends, done at the right time or mileage, with evidence for each one - ideally itemised invoices, a stamped book or a digital record. If any services are missing, it’s a part service history.',
  },
  {
    q: 'Does the MOT history count as service history?',
    a: 'No - an MOT checks the vehicle is roadworthy on the day; it doesn’t service it. But the official mileage recorded at each test is useful evidence that backs up the mileages on your service invoices.',
  },
  {
    q: 'How do I prove service history if I service my own motorcycle or car?',
    a: 'Keep the receipts for the parts and oil, note the date, mileage and what you did each time, and photograph the odometer. Describe it honestly as owner-serviced with receipts.',
  },
  {
    q: 'Should I send a buyer a photo of the V5C?',
    a: 'Not before the sale. Let them check it in person, and never put the 11-digit document reference number in an advert or a photo.',
  },
] as const;

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function ProvingServiceHistoryPage() {
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
      <h1>How to Prove Your Service History When You Sell</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        A documented history is one of the few things that lets you ask more than the next seller -
        and one of the first things a buyer asks about. &quot;Full service history&quot; in an advert
        means nothing until the buyer can check it, so the job isn&apos;t just having the paperwork,
        it&apos;s making it quick to verify. This applies to motorcycles and cars alike; where they
        differ, it&apos;s called out below.
      </p>

      <h2>What counts as proof (strongest first)</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>Itemised garage invoices.</strong> The date, the mileage, the registration, what was
          done, and the garage&apos;s name and contact details. This is the strongest evidence because a
          buyer can check it - they can ring the garage.
        </li>
        <li>
          <strong>A stamped service book.</strong> Useful, but a stamp on its own is easy to fake, so
          buyers trust it far more when there&apos;s a matching invoice behind each stamp.
        </li>
        <li>
          <strong>A manufacturer&apos;s digital service record.</strong> Many newer cars - and some
          motorcycles - have their servicing logged by the manufacturer instead of in a paper book. A
          franchised dealer for the make can look it up by the VIN and print it. It usually only shows
          work done by the dealer network, so keep independent garages&apos; invoices too.
        </li>
        <li>
          <strong>The MOT history.</strong> It isn&apos;t service history, but it&apos;s official and
          free to check by registration on GOV.UK, and the mileage recorded at each test backs up the
          mileages on your invoices.
        </li>
        <li>
          <strong>Your own receipts, if you do the work yourself.</strong> Receipts for the parts and
          oil, plus a dated note of the mileage and what you did - and a photo of the odometer if you
          can. Honest DIY records are worth far more than nothing; just call it &quot;owner-serviced,
          with receipts&quot;, not a full service history.
        </li>
      </ul>

      <h2>What a buyer checks - so check it first</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>The intervals.</strong> A service at roughly every interval in the owner&apos;s
          manual, by time or mileage, whichever comes first. Two years without a service is still a gap
          on a vehicle that hardly moved.
        </li>
        <li>
          <strong>Mileage that only goes up.</strong> The mileage on each invoice should sit between
          the MOT readings either side of it. A reading that goes backwards - even a garage&apos;s typo -
          will be questioned, so have the explanation ready.
        </li>
        <li>
          <strong>The right vehicle.</strong> The registration or VIN on each invoice should match.
          Invoices with no registration on them prove very little.
        </li>
        <li>
          <strong>On a motorcycle:</strong> the valve clearance check, often the most expensive routine
          service, is the one buyers look for - along with brake fluid changes, chain and sprockets, and
          tyre dates.
        </li>
        <li>
          <strong>On a car:</strong> if the engine has a cambelt (timing belt), proof it was changed
          when due is usually the first thing a buyer asks for.
        </li>
      </ul>

      <h2>How to present it</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>Put everything in date order, oldest first, so it reads as one story.</li>
        <li>
          Write a one-page summary - date, mileage, what was done, who did it. Buyers read that first
          and dip into the paperwork to check it.
        </li>
        <li>
          Photograph every receipt and page, so a remote buyer gets one answer instead of thirty
          messages.
        </li>
        <li>
          Be specific in the advert: &quot;serviced every year, 9 invoices, last at 18,240 miles in
          March 2026&quot; says far more than &quot;FSH&quot;.
        </li>
        <li>
          Hand the originals over with the vehicle. The history belongs with it, and the next owner
          will need it when they sell.
        </li>
      </ul>

      <h2>What not to share</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>The V5C&apos;s document reference number.</strong> The 11-digit number is used for
          things like taxing the vehicle - keep it out of adverts and photos, and show the buyer the V5C
          in person instead.
        </li>
        <li>
          <strong>Previous owners&apos; names and addresses.</strong> Older invoices often have them.
          Cover or blur them before you photograph or share anything.
        </li>
        <li>
          <strong>Your own address,</strong> until you&apos;ve actually agreed a viewing.
        </li>
      </ul>

      <h2>Be straight about the gaps</h2>
      <p style={{ maxWidth: 'none' }}>
        If a year is missing, say so. Describing a vehicle as having a full service history when it
        doesn&apos;t is the kind of thing that comes back after a sale - and a buyer can spot most gaps
        from the free MOT history anyway. If the last service is getting old, a fresh one with an
        itemised invoice before you advertise puts the most recent part of the story on a strong
        footing. If the paperwork is lost rather than missing,{' '}
        <Link href="/guides/rebuild-lost-service-history">here&apos;s how to rebuild a lost service history</Link>.
      </p>

      <h2>Keeping it in one place</h2>
      <p style={{ maxWidth: 'none' }}>
        This is what RoadVerdict&apos;s free logbook is built for: photograph a receipt and it&apos;s read
        and filed for you, the MOT history comes in by registration, and when you sell you can send a
        buyer one link to the whole history. If they want to see a particular receipt, they can ask -
        and you decide whether to share it.{' '}
        <Link href="/login?redirect=%2Fdashboard">Start a free logbook</Link>
      </p>

      <h2>Common questions</h2>
      {FAQ.map((f) => (
        <div key={f.q} style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.3rem' }}>{f.q}</h3>
          <p style={{ maxWidth: 'none', margin: 0 }}>{f.a}</p>
        </div>
      ))}

      <p className="disclaimer" style={{ maxWidth: 'none' }}>
        General guidance for private sellers in the UK, not legal advice.
      </p>
    </div>
  );
}
