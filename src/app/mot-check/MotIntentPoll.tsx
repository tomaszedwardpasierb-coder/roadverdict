// Place at: src/app/mot-check/MotIntentPoll.tsx
//
// One question on a free MOT check result (4 Nov 2026 decision): is this
// the visitor's own vehicle, or one they're thinking of buying? Buyers are
// the market for the paid history check, owners for the logbook - the
// answers, counted as anonymous funnel steps (mot_poll_mine/_buying), say
// which one the MOT check really brings in. Each answer then points to the
// part of the page that fits it. One answer per vehicle per browser tab,
// so a reload isn't counted twice.
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './mot-check.module.css';

type Answer = 'mine' | 'buying';

function storageKey(registration: string): string {
  return `mot-poll::${registration}`;
}

function count(answer: Answer) {
  const body = JSON.stringify({ step: answer === 'mine' ? 'mot_poll_mine' : 'mot_poll_buying' });
  try {
    if (!navigator.sendBeacon?.('/api/funnel', body)) {
      void fetch('/api/funnel', { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  } catch {
    // Counting must never get in the visitor's way.
  }
}

export function MotIntentPoll({ registration, historyHref, hasReminder }: { registration: string; historyHref: string; hasReminder: boolean }) {
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey(registration));
      if (saved === 'mine' || saved === 'buying') setAnswer(saved);
    } catch {
      // No storage (private mode): the question just shows again.
    }
  }, [registration]);

  function choose(a: Answer) {
    setAnswer(a);
    count(a);
    try {
      sessionStorage.setItem(storageKey(registration), a);
    } catch {
      // See above.
    }
  }

  return (
    <section className={styles.poll} aria-labelledby="poll-heading">
      <h2 id="poll-heading" className={styles.pollQuestion}>
        Is this your own vehicle, or one you’re thinking of buying?
      </h2>
      {answer === null ? (
        <div className={styles.saveActions}>
          <button type="button" className={styles.secondary} onClick={() => choose('mine')}>
            It’s mine
          </button>
          <button type="button" className={styles.secondary} onClick={() => choose('buying')}>
            Thinking of buying it
          </button>
        </div>
      ) : answer === 'mine' ? (
        <p className={styles.pollAnswer}>
          Thanks.{' '}
          {hasReminder ? (
            <>
              <a href="#mot-reminder">Set the MOT reminder</a> above, or save it to a free logbook further down.
            </>
          ) : (
            <>You can save it to a free logbook further down, with a reminder before the next MOT.</>
          )}
        </p>
      ) : (
        <p className={styles.pollAnswer}>
          Thanks. The MOT record can’t show outstanding finance, theft or write-off records:{' '}
          <Link href={historyHref}>the full history check does</Link>.
        </p>
      )}
    </section>
  );
}
