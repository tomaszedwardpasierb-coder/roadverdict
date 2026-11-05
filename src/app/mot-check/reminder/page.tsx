// Place at: src/app/mot-check/reminder/page.tsx
//
// Where the MOT reminder's email links land (see lib/mot/motReminders.ts):
// the result of confirming one (?status=...), and the unsubscribe link
// (?unsubscribe=<key>&t=<token>), which asks before stopping anything - a
// link checker opening the email must never unsubscribe anyone. Never
// indexed.
import type { Metadata } from 'next';
import Link from 'next/link';
import { findMotReminderForUnsubscribe, reminderDate } from '@/lib/mot/motReminders';
import styles from '../mot-check.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'MOT reminder',
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ status?: string; vrm?: string; due?: string; unsubscribe?: string; t?: string }>;

function ukDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }).format(new Date(iso));
}

function validDate(iso: string | undefined): string | null {
  return iso && !Number.isNaN(Date.parse(iso)) ? iso : null;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className={`hero ${styles.page}`}>
      <h1>{title}</h1>
      {children}
      <p className={styles.lead}>
        <Link href="/mot-check">Check another vehicle’s MOT history</Link>
      </p>
    </div>
  );
}

export default async function MotReminderPage(props: { searchParams: SearchParams }) {
  const { status, vrm, due, unsubscribe, t } = await props.searchParams;

  if (unsubscribe) {
    const found = await findMotReminderForUnsubscribe(unsubscribe, t ?? '');
    if (!found.ok) {
      return (
        <Panel title="Nothing to stop">
          <p className={styles.lead}>These MOT reminders have already been stopped, or the link isn’t complete.</p>
        </Panel>
      );
    }
    return (
      <Panel title="Stop MOT reminders?">
        <p className={styles.lead}>
          You won’t get any more MOT reminders for <strong>{found.registration}</strong>, and we’ll delete your email address
          from them.
        </p>
        <form action="/api/mot-reminder/unsubscribe" method="post" className={styles.form}>
          <input type="hidden" name="r" value={unsubscribe} />
          <input type="hidden" name="t" value={t ?? ''} />
          <button type="submit" className={styles.primary}>
            Stop reminders
          </button>
        </form>
      </Panel>
    );
  }

  const dueDate = validDate(due);
  if (status === 'confirmed' && vrm) {
    // An MOT due in under 4 weeks gets its reminder from the next morning's run.
    const remindOn = dueDate ? reminderDate(dueDate) : null;
    return (
      <Panel title="Your MOT reminder is on">
        <p className={styles.lead}>
          {dueDate && remindOn && remindOn.getTime() > Date.now() ? (
            <>
              We’ll email you on {ukDate(remindOn.toISOString())}, 4 weeks before the MOT on <strong>{vrm}</strong> runs
              out on {ukDate(dueDate)}
            </>
          ) : dueDate ? (
            <>
              The MOT on <strong>{vrm}</strong> runs out on {ukDate(dueDate)}, in under 4 weeks, so we’ll email you within a
              day
            </>
          ) : (
            <>
              We’ll email you 4 weeks before the MOT on <strong>{vrm}</strong> runs out
            </>
          )}
          , with what its last MOT flagged and what to check before the test. Then the same before each MOT after that.
          Every email has a link to stop them.
        </p>
      </Panel>
    );
  }
  if (status === 'unsubscribed') {
    return (
      <Panel title="MOT reminders stopped">
        <p className={styles.lead}>You won’t get any more MOT reminders for that vehicle, and your email address has been deleted from them.</p>
      </Panel>
    );
  }
  if (status === 'error') {
    return (
      <Panel title="Something went wrong">
        <p className={styles.lead}>Please open the link from your email again in a few minutes.</p>
      </Panel>
    );
  }
  return (
    <Panel title="That link has expired">
      <p className={styles.lead}>
        Confirmation links last 7 days. Check the vehicle again on the free MOT check and ask for the reminder there.
      </p>
    </Panel>
  );
}
