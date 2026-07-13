import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What RoadVerdict collects, why, and how to exercise your rights.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <article>
      <h1>Privacy</h1>
      <p>
        <em>
          Draft placeholder — replace with final copy before real users arrive. Kept here so
          the page and its route exist from day one, per the SEO/security/compliance guide.
        </em>
      </p>

      <h2>What the quote checker collects</h2>
      <p>
        The bike size, the job, and the price you were quoted — nothing that identifies you.
        We don&apos;t ask for your name, email, or registration number to use the checker, and
        we don&apos;t log your IP address against your answers.
      </p>

      <h2>Why</h2>
      <p>
        Anonymised answers build the price benchmark the checker relies on. This is a
        legitimate-interest basis, not consent — there&apos;s nothing to opt into because
        nothing personal is collected in the first place.
      </p>

      <h2>Who else sees anything</h2>
      <p>
        [List third parties once they exist: hosting (Azure, UK South region), any analytics,
        payment processor, email provider. None are wired up in this prototype yet.]
      </p>

      <h2>Your rights</h2>
      <p>
        [Add the access/correction/deletion/export process and a contact address before
        launch — see the compliance guide for what this needs to cover.]
      </p>
    </article>
  );
}
