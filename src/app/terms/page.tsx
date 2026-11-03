// Place at: src/app/terms/page.tsx
//
// Terms of service, in plain English, from standard UK consumer terms
// (decided 19 Oct 2026: a template, no solicitor wait; reviewed and
// approved by the owner on 3 Nov 2026). The website checkouts quote
// section 6 above Stripe's Pay button (lib/payments/checkoutTerms.ts),
// so change both together.
import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { PRO_ANNUAL_PRICE, PRO_MONTHLY_PRICE, PRO_TRIAL_DAYS, EXTRA_VEHICLE_MONTHLY_PRICE } from '@/lib/proPlan';
import { TRADER } from '@/lib/legal';
import styles from '../privacy/privacy.module.css';

const UPDATED = '3 November 2026';
// The days a bought history check can be looked up again free - see
// VDI_PURCHASE_RETRIEVAL_WINDOW_MS in lib/tracker/vdiPurchase.ts.
const RELOOKUP_DAYS = 42;

export const metadata: Metadata = pageMetadata({
  title: 'Terms of Service',
  description:
    'The terms for using RoadVerdict: accounts, RoadVerdict Pro, full history checks, refunds and your right to cancel, your content, and our responsibilities.',
  path: '/terms',
});

const SECTIONS = [
  { id: 'about', label: 'About these terms' },
  { id: 'what-it-is', label: 'What RoadVerdict is, and isn’t' },
  { id: 'account', label: 'Your account' },
  { id: 'pro', label: 'The free plan and RoadVerdict Pro' },
  { id: 'history-checks', label: 'Full history checks' },
  { id: 'cancelling', label: 'Your right to cancel and refunds' },
  { id: 'your-content', label: 'Your content' },
  { id: 'sharing', label: 'Sharing and transferring' },
  { id: 'ai', label: 'AI features' },
  { id: 'fair-use', label: 'Using RoadVerdict fairly' },
  { id: 'third-parties', label: 'Other people’s data and links' },
  { id: 'responsibility', label: 'Our responsibility to you' },
  { id: 'changes', label: 'Changes to RoadVerdict and to these terms' },
  { id: 'ending', label: 'Ending your account' },
  { id: 'law', label: 'Law and disputes' },
  { id: 'contact', label: 'Contact' },
];

export default function TermsPage() {
  return (
    <div className={styles.wrapper}>
      <h1 className={styles.title}>Terms of Service</h1>
      <span className={styles.updated}>Last updated: {UPDATED}</span>
      <p className={styles.intro}>
        The terms for using RoadVerdict, in plain English. They don&apos;t take away any of your legal rights as a
        consumer.
      </p>

      <nav className={styles.toc}>
        <p>On this page</p>
        <ol>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.label}</a>
            </li>
          ))}
        </ol>
      </nav>

      <section id="about" className={styles.section}>
        <h2>1. About these terms</h2>
        <p>
          These terms apply when you use RoadVerdict: the website roadverdict.co.uk and the RoadVerdict app. By
          creating an account or buying anything, you agree to them. Please read them with our{' '}
          <Link href="/privacy">privacy policy</Link>, which explains what we do with your data.
        </p>
        <p>
          RoadVerdict is run by {TRADER}. You can contact us at{' '}
          <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>; we aim to reply within two working days.
        </p>
      </section>

      <section id="what-it-is" className={styles.section}>
        <h2>2. What RoadVerdict is, and isn&apos;t</h2>
        <p>
          RoadVerdict helps you keep a logbook for your car or motorcycle (receipts, servicing, fuel, reminders and
          documents), check a vehicle&apos;s MOT history, and buy history checks before you buy a vehicle.
        </p>
        <p>
          <strong>It&apos;s guidance, not a professional inspection or advice.</strong> MOT explanations, typical prices,
          quote checks, scores and AI-written summaries are general information - they can&apos;t see the vehicle in front
          of you. Always have a vehicle inspected by a qualified mechanic before you rely on it for safety or a purchase.
        </p>
      </section>

      <section id="account" className={styles.section}>
        <h2>3. Your account</h2>
        <ul>
          <li>
            You must be <strong>16 or over</strong> and live in the UK to create an account. If you&apos;re under 18, you
            need a parent&apos;s or guardian&apos;s permission before buying anything.
          </li>
          <li>One account is for one person. Keep your sign-in secure; you can turn on two-factor sign-in in Settings.</li>
          <li>
            You&apos;re responsible for what happens on your account, unless someone gets into it because we failed to
            keep it secure.
          </li>
        </ul>
      </section>

      <section id="pro" className={styles.section}>
        <h2>4. The free plan and RoadVerdict Pro</h2>
        <p>
          <strong>The free plan</strong> is free for as long as we offer it. It has limits that we show on the website
          and in the app - for example, one vehicle.
        </p>
        <p>
          <strong>RoadVerdict Pro</strong> is a subscription that adds the features listed at{' '}
          <Link href="/pro">roadverdict.co.uk/pro</Link>.
        </p>
        <ul>
          <li>
            <strong>Price:</strong> {PRO_MONTHLY_PRICE} a month or {PRO_ANNUAL_PRICE} a year, unless a different price is
            shown when you buy. Extra vehicles bought on the website cost {EXTRA_VEHICLE_MONTHLY_PRICE} a month each.
          </li>
          <li>
            <strong>Where you buy decides who bills you.</strong> Pro bought on our website is billed by us through our
            payment provider, Stripe. Pro bought in the app is billed by Google Play (or the App Store on iPhone) under
            that store&apos;s terms, and you manage or cancel it in the store, not with us.
          </li>
          <li>
            <strong>Renewal:</strong> Pro renews automatically at the end of each month or year until you cancel. You&apos;re
            told the price before you buy.
          </li>
          {PRO_TRIAL_DAYS > 0 ? (
            <li>
              <strong>Free trial (website only, when offered):</strong> {PRO_TRIAL_DAYS} days, one per account. We&apos;ll
              email you before it ends, and you won&apos;t be charged if you cancel before then.
            </li>
          ) : null}
          <li>
            <strong>Cancelling:</strong> you can cancel at any time - on the website from the Pro page, in the app from
            Google Play or the App Store. Pro keeps working until the end of the period you&apos;ve paid for; then your
            account moves to the free plan and your records stay yours.
          </li>
          <li>
            <strong>Price changes:</strong> we&apos;ll tell you at least 30 days before a new price applies to you, so you
            can cancel first.
          </li>
        </ul>
      </section>

      <section id="history-checks" className={styles.section}>
        <h2>5. Full history checks</h2>
        <p>
          A full history check reports what our data provider (Vehicle Data Global Ltd, using sources such as DVLA, DVSA
          and the Police National Computer) holds about a registration - for example stolen markers, write-off records,
          outstanding finance, keepers and plate changes.
        </p>
        <ul>
          <li>
            <strong>Price:</strong> shown before you pay. It can differ between the website and the app, and between
            free and Pro accounts.
          </li>
          <li>
            <strong>One check is for one registration.</strong> You can look that registration up again free for{' '}
            {RELOOKUP_DAYS} days after buying.
          </li>
          <li>
            <strong>Pro includes one free check every 4 weeks.</strong> It doesn&apos;t build up if you don&apos;t use it.
          </li>
          <li>
            <strong>If the check fails</strong> because the data service doesn&apos;t answer, you can run it again at no
            cost. If it still can&apos;t run, we&apos;ll refund you.
          </li>
          <li>
            <strong>Limits:</strong> the report is only as complete as the records it draws on. A clean report doesn&apos;t
            guarantee a vehicle is problem-free, and it isn&apos;t an inspection.
          </li>
        </ul>
      </section>

      <section id="cancelling" className={styles.section}>
        <h2>6. Your right to cancel and refunds</h2>
        <ul>
          <li>
            <strong>History checks:</strong> when you buy a check, you ask us to run it straight away and agree that you
            lose the 14-day right to cancel once it has run. If the report isn&apos;t as described or doesn&apos;t work,
            you&apos;re still entitled to a repair, a replacement or a refund under the Consumer Rights Act 2015.
          </li>
          <li>
            <strong>Pro bought on our website:</strong> if you cancel within 14 days of your first payment (not counting a
            free trial), we&apos;ll refund that payment in full - email us. After that, cancelling stops future payments,
            but payments already made aren&apos;t refunded, except where the law requires.
          </li>
          <li>
            <strong>Anything bought in an app store:</strong> refunds are handled by Google Play or the App Store under
            their policies, so ask them first. If you have a problem with what we provided, email us too and we&apos;ll
            help.
          </li>
        </ul>
      </section>

      <section id="your-content" className={styles.section}>
        <h2>7. Your content</h2>
        <p>
          Everything you add - receipts, photos, documents, entries and notes - stays <strong>yours</strong>. You give us
          permission to store and process it only to run RoadVerdict for you: for example, reading a receipt so it can be
          logged, or showing your history on a link you choose to share.
        </p>
        <ul>
          <li>
            Only upload things you have the right to use, and don&apos;t upload other people&apos;s personal details unless
            you&apos;re allowed to.
          </li>
          <li>Documents in the Vault are encrypted, and only you can open them.</li>
          <li>
            You can export your records at any time. Deleting your account erases them as our privacy policy describes.
          </li>
        </ul>
      </section>

      <section id="sharing" className={styles.section}>
        <h2>8. Sharing and transferring</h2>
        <ul>
          <li>
            <strong>Shareable links</strong> show the history you choose to whoever has the link, until it expires or you
            remove it.
          </li>
          <li>
            <strong>Transferring a vehicle</strong> moves its records to the new owner&apos;s account once they accept.
            After that, the records are theirs.
          </li>
        </ul>
      </section>

      <section id="ai" className={styles.section}>
        <h2>9. AI features</h2>
        <p>
          Some features use AI: reading receipts, drafting entries from what you say, answering questions and writing
          summaries. <strong>AI can get things wrong.</strong> Check anything important, such as a figure or a date,
          before relying on it - and never rely on it for safety decisions.
        </p>
      </section>

      <section id="fair-use" className={styles.section}>
        <h2>10. Using RoadVerdict fairly</h2>
        <p>Please don&apos;t:</p>
        <ul>
          <li>use automated tools to look up registrations or copy our data;</li>
          <li>resell our data or reports;</li>
          <li>get around our limits or payments;</li>
          <li>interfere with the service or with other people&apos;s accounts;</li>
          <li>use RoadVerdict for anything unlawful.</li>
        </ul>
        <p>
          We may limit, suspend or close an account that does these things. Unless it&apos;s urgent, we&apos;ll tell you
          why first.
        </p>
      </section>

      <section id="third-parties" className={styles.section}>
        <h2>11. Other people&apos;s data and links</h2>
        <ul>
          <li>
            MOT data comes from DVSA and contains public sector information licensed under the Open Government Licence
            v3.0. DVSA doesn&apos;t endorse RoadVerdict.
          </li>
          <li>History check data comes from our data provider (section 5).</li>
          <li>
            Some links are affiliate links: we may earn a small commission if you buy through them, at no cost to you. We
            label them.
          </li>
          <li>We&apos;re not responsible for other websites we link to.</li>
        </ul>
      </section>

      <section id="responsibility" className={styles.section}>
        <h2>12. Our responsibility to you</h2>
        <ul>
          <li>
            If we don&apos;t keep to these terms, we&apos;re responsible for loss or damage you suffer that is a{' '}
            <strong>foreseeable</strong> result of that - but not for loss that isn&apos;t foreseeable.
          </li>
          <li>
            RoadVerdict is for <strong>private use</strong>. We aren&apos;t responsible for business losses, such as lost
            profit or business interruption.
          </li>
          <li>
            <strong>Nothing in these terms limits our liability</strong> for death or personal injury caused by our
            negligence, for fraud, or for anything else the law doesn&apos;t allow us to limit - including your rights under
            the Consumer Rights Act 2015.
          </li>
        </ul>
      </section>

      <section id="changes" className={styles.section}>
        <h2>13. Changes to RoadVerdict and to these terms</h2>
        <p>
          We keep improving RoadVerdict, so features can change. If a change takes away something you&apos;ve paid for,
          we&apos;ll tell you, and you can cancel and get a refund for any period you&apos;ve paid for but not had.
        </p>
        <p>We may update these terms. If a change matters to you, we&apos;ll email you before it takes effect.</p>
      </section>

      <section id="ending" className={styles.section}>
        <h2>14. Ending your account</h2>
        <p>
          You can delete your account at any time in Settings. As our privacy policy explains, deletion happens 30 days
          after you ask, and you can change your mind before then. Cancel any app-store subscription in the store too,
          or it will keep charging.
        </p>
      </section>

      <section id="law" className={styles.section}>
        <h2>15. Law and disputes</h2>
        <p>
          These terms are governed by the law of England and Wales. You can bring a claim in the courts of England and
          Wales - or, if you live in Scotland or Northern Ireland, in the courts there. If something goes wrong, please
          email us first; most problems are quickest to fix that way.
        </p>
      </section>

      <section id="contact" className={styles.section}>
        <h2>16. Contact</h2>
        <p>
          <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a> - {TRADER}.
        </p>
      </section>
    </div>
  );
}
