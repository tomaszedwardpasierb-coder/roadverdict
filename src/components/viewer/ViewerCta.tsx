// Place at: src/components/viewer/ViewerCta.tsx
'use client';

import Link from 'next/link';
import { useViewer } from './useViewer';

type Kind = 'bike' | 'car';

const LOGIN_REDIRECT = (kind: Kind) => `/login?redirect=${encodeURIComponent(`/dashboard?addVehicle=${kind}`)}`;

// The /motorcycles and /cars pages are static now, so the call-to-action
// that used to be resolved on the server per visitor is resolved here. The
// server-rendered default is the signed-out one - what every anonymous
// visitor (and every search crawler) sees, with no flash.
//
// addVehicle=<kind> is kept even for a returning owner (hasVehicle true) -
// /dashboard uses it to force that vehicle view, so someone with both a
// bike and a car lands on the one this page is about rather than whichever
// kind their activeVehicleKind cookie happened to remember.
export function ViewerCtaLink({ kind, className, children }: { kind: Kind; className: string; children?: React.ReactNode }) {
  const viewer = useViewer();
  const hasVehicle = kind === 'bike' ? viewer.hasBike : viewer.hasCar;
  const href = viewer.signedIn ? `/dashboard?addVehicle=${kind}` : LOGIN_REDIRECT(kind);
  const label = !viewer.signedIn
    ? `Start tracking your ${kind} free`
    : hasVehicle
      ? 'Go to your dashboard'
      : `Add your ${kind}`;
  return (
    <Link href={href} className={className}>
      {label}
      {children}
    </Link>
  );
}

// The link to the OTHER vehicle kind's page: signed out, that's the public
// marketing page for it; signed in, it's the dashboard's add-vehicle flow
// for that kind (see the note above on why plain "/" would be wrong).
export function ViewerSwitchKindLink({ target, className, children }: { target: Kind; className: string; children: React.ReactNode }) {
  const viewer = useViewer();
  const publicHref = target === 'car' ? '/cars' : '/motorcycles';
  const href = viewer.signedIn ? `/dashboard?addVehicle=${target}` : publicHref;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
