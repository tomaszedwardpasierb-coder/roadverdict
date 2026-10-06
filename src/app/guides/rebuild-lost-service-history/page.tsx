// Place at: src/app/guides/rebuild-lost-service-history/page.tsx
//
// The second of SEO_STRATEGY.md's "documented-history guides": piecing a
// lost history back together. Motorcycles and cars together, with the
// differences in their own section - the sources (MOT history, garages,
// dealer records, inbox) are the same for both.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = pageMetadata({
  title: 'Lost Service History? How to Rebuild It (UK)',
  description:
    'Lost the service book or receipts? How to rebuild a motorcycle or car service history from the MOT history, garages, dealer digital records, your emails and DVLA.',
  path: '/guides/rebuild-lost-service-history',
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Rebuilding a Lost Service History', '/guides/rebuild-lost-service-history');

const FAQ = [
  {
    q: 'Can I get my service history from the DVLA?',
    a: 'No. DVLA holds registration and keeper records, not servicing. For the servicing itself, ask the garages and a franchised dealer for the make, and use the free MOT history for the mileage timeline.',
  },
  {
    q: 'How far back does the online MOT history go?',
    a: 'For most vehicles tested in England, Scotland and Wales, back to 2005 - with the date, the mileage and any advisories from each test.',
  },
  {
    q: 'Can a garage re-stamp a lost service book?',
    a: 'A garage can record work it actually did and still has a record of. Stamps for work nobody can evidence are misleading, and experienced buyers spot them.',
  },
  {
    q: 'Is a vehicle worth less without service history?',
    a: 'Usually, yes - buyers pay more for a history they can check and less for uncertainty. Rebuilding even part of it, and servicing the vehicle now with an itemised invoice, narrows the gap.',
  },
] as const;

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function RebuildLostServiceHistoryPage() {
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
      <h1>How to Rebuild a Lost Service History</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        Lost service books and binned receipts are common, and the history usually isn&apos;t gone -
        it&apos;s scattered. Most of it can be pieced back together in an afternoon, in roughly this
        order. It works the same way for a motorcycle or a car; the differences are at the end.
      </p>

      <h2>1. Start with the MOT history</h2>
      <p style={{ maxWidth: 'none' }}>
        Check the MOT history free on GOV.UK by registration. For most vehicles tested in England,
        Scotland and Wales it goes back to 2005, with the date, the mileage and any advisories from each
        test. That gives you the mileage timeline the rest of the history has to fit, and shows which
        years you need to fill. A vehicle under three years old won&apos;t have had an MOT yet, and
        Northern Ireland runs its own MOT system.
      </p>

      <h2>2. Ask the garages</h2>
      <p style={{ maxWidth: 'none' }}>
        A garage that has worked on the vehicle can usually reprint an invoice from its system by
        registration - businesses keep their records for years for their accounts. Ask each one for
        every visit: the date, the mileage and what was done. If you can&apos;t remember which garages,
        steps 4 and 5 usually tell you.
      </p>

      <h2>3. Ask a franchised dealer for the digital record</h2>
      <p style={{ maxWidth: 'none' }}>
        Many newer cars, and some motorcycles, have their servicing logged by the manufacturer against
        the VIN instead of in a paper book. A franchised dealer for the make can usually look it up and
        print it - some charge a small fee. It normally only shows work done by the dealer network, so
        independent garages&apos; invoices still matter.
      </p>

      <h2>4. Search your inbox and bank statements</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>Emails.</strong> Search for &quot;invoice&quot;, &quot;service&quot;,
          &quot;MOT&quot;, &quot;booking&quot; and garage names - many garages email invoices and
          booking confirmations.
        </li>
        <li>
          <strong>Bank and card statements.</strong> They show where and when you paid, which tells you
          which garages to ask.
        </li>
        <li>
          <strong>Online parts orders.</strong> If you do your own servicing, a parts retailer&apos;s
          order history shows dates and part numbers - good evidence of what went on and when.
        </li>
      </ul>

      <h2>5. Ask the previous owner</h2>
      <p style={{ maxWidth: 'none' }}>
        If you bought the vehicle recently, the seller may still have receipts or the garages&apos;
        details - the original advert and your messages often mention them. If the vehicle is
        registered to you, DVLA can also send its keeper history (form V888, a small fee, by post),
        which helps you match the gaps to changes of owner.
      </p>

      <h2>What not to do</h2>
      <p style={{ maxWidth: 'none' }}>
        Don&apos;t get a replacement service book stamped for work nobody can evidence. A book full of
        fresh stamps in the same ink is a red flag to any experienced buyer, and calling it a full
        history when it isn&apos;t can come back on you after a sale. A replacement book is fine for
        recording services from now on.
      </p>

      <h2>If gaps remain</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>Get a full service now, with an itemised invoice.</strong> It won&apos;t fill the past,
          but it documents the vehicle&apos;s condition today and starts a clean record.
        </li>
        <li>
          <strong>Before selling, consider an independent inspection.</strong> A report from a
          qualified inspector can reassure a buyer where paperwork can&apos;t.
        </li>
        <li>
          <strong>Describe it honestly,</strong> for example &quot;part service history, fully
          documented since 2024&quot;.
        </li>
      </ul>

      <h2>Motorcycles and cars: what differs</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>Motorcycles.</strong> More riders service their own bikes, so parts receipts and order
          histories carry more of the story. On many bikes the valve clearance check is the service a
          buyer looks for evidence of - if you can&apos;t find it and it&apos;s due by the manual,
          that&apos;s worth knowing before a buyer asks.
        </li>
        <li>
          <strong>Cars.</strong> Dealer digital records are more common on cars. On an engine with a
          cambelt, evidence of the last change matters most - if it can&apos;t be found, budget for
          having it done rather than guessing.
        </li>
      </ul>

      <h2>Keep it from now on</h2>
      <p style={{ maxWidth: 'none' }}>
        The easiest history to prove is the one you never lost. Photograph each receipt the day you get
        it - in a free RoadVerdict logbook it&apos;s read and filed for you, and the MOT history comes in
        by registration, so the next time someone asks, it&apos;s one link.{' '}
        <Link href="/login?redirect=%2Fdashboard">Start a free logbook</Link>, or read{' '}
        <Link href="/guides/proving-service-history">how to prove your service history when you sell</Link>.
      </p>

      <h2>Common questions</h2>
      {FAQ.map((f) => (
        <div key={f.q} style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.3rem' }}>{f.q}</h3>
          <p style={{ maxWidth: 'none', margin: 0 }}>{f.a}</p>
        </div>
      ))}

      <p className="disclaimer" style={{ maxWidth: 'none' }}>
        General guidance for UK owners, not legal advice.
      </p>
    </div>
  );
}
