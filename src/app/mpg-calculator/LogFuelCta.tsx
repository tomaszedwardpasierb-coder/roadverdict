// Place at: src/app/mpg-calculator/LogFuelCta.tsx
'use client';

import Link from 'next/link';
import { useViewer } from '@/components/viewer/useViewer';
import styles from './page.module.css';

const LOGIN_REDIRECT = (kind: 'bike' | 'car') => `/login?redirect=${encodeURIComponent(`/dashboard?addVehicle=${kind}`)}`;

// The page is static, so what a signed-in visitor sees here arrives after
// it loads (see useViewer). Signed out, it's the case for logging fuel at
// all; signed in, their fuel log already does this for every tank, so it
// just points there.
export function LogFuelCta() {
  const viewer = useViewer();

  if (viewer.signedIn) {
    return (
      <section className={`tracker-cta ${styles.cta}`} aria-labelledby="log-fuel-cta">
        <h2 id="log-fuel-cta">Your fuel log already does this</h2>
        <p>Every full tank you log is worked out like this for you - your average, your last tank and what each mile costs, in your Fuel tab.</p>
        <div className={styles.ctaButtons}>
          <Link href="/dashboard?tab=fuel" className="btn-primary">
            Open your Fuel tab
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={`tracker-cta ${styles.cta}`} aria-labelledby="log-fuel-cta">
      <h2 id="log-fuel-cta">Let RoadVerdict do this for every tank</h2>
      <p>
        Log a fill-up in seconds and your real MPG is worked out from every full tank, with your fuel spend and cost per mile
        alongside. When you sell, the whole history goes with the vehicle.
      </p>
      <div className={styles.ctaButtons}>
        <Link href={LOGIN_REDIRECT('bike')} className="btn-primary">
          Start logging your motorcycle
        </Link>
        <Link href={LOGIN_REDIRECT('car')} className="btn-secondary">
          Start logging your car
        </Link>
      </div>
    </section>
  );
}
