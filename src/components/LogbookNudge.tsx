// Place at: src/components/LogbookNudge.tsx
//
// One quiet line under a free tool's result, for a signed-out visitor: the
// verdict they just got is the moment to offer a logbook. The sign-in link
// carries src=tool, so the sign-up funnel (/tomasz) counts the accounts
// that start here. Plain text and a link - no banner, no pop-up. Plain
// markup with no hooks, so it works in server and client components alike.
import Link from 'next/link';

type Kind = 'bike' | 'car';
type Topic = 'quote' | 'cost';

export function LogbookNudge({ kind, topic, signedIn }: { kind: Kind; topic: Topic; signedIn: boolean }) {
  if (signedIn) return null;
  const noun = kind === 'bike' ? 'bike' : 'car';
  const href = `/login?redirect=${encodeURIComponent(`/dashboard?addVehicle=${kind}`)}&src=tool`;
  return (
    <p className="rv-logbook-nudge">
      {topic === 'quote'
        ? `Paid for this job? Keep it with your ${noun}'s history in a free logbook, with reminders for what's due next. `
        : `Want the real figure, from your own fill-ups and bills? Track your ${noun} in a free logbook. `}
      <Link href={href}>{topic === 'quote' ? 'Start your logbook' : 'Start tracking'}</Link>
    </p>
  );
}
