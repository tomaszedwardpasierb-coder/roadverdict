// Place at: src/app/mot-check/MotReminderForm.tsx
//
// "Email me before this MOT is due" under the MOT status on a free MOT
// check result (see lib/mot/motReminders.ts). No account: the reminder
// only starts once the address's owner confirms it from the email this
// sends, so a mistyped address gets one email and nothing more.
'use client';

import { useState, type FormEvent } from 'react';
import styles from './mot-check.module.css';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'sent' } | { kind: 'already' } | { kind: 'error'; message: string };

const FAILED = 'Something went wrong. Please try again.';

// `when` is the sentence's start, worked out on the server: "On 12 February
// 2027, 4 weeks before," or, for an MOT due sooner than that, "Within a day,".
export function MotReminderForm({ registration, when }: { registration: string; when: string }) {
  const [email, setEmail] = useState('');
  // Never seen by people (see the API route): only form-filling bots type here.
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/mot-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, registration, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string; error?: string };
      if (res.ok) setState({ kind: data.status === 'already' ? 'already' : 'sent' });
      else setState({ kind: 'error', message: data.error ?? FAILED });
    } catch {
      setState({ kind: 'error', message: FAILED });
    }
  }

  if (state.kind === 'sent') {
    return (
      <p className={styles.reminderDone} role="status">
        Nearly done: we’ve emailed {email} a link to confirm. Nothing more is sent until you do.
      </p>
    );
  }
  if (state.kind === 'already') {
    return (
      <p className={styles.reminderDone} role="status">
        You already have an MOT reminder for {registration} at that address.
      </p>
    );
  }

  return (
    <form id="mot-reminder" className={styles.reminder} onSubmit={submit}>
      <label htmlFor="reminder-email" className={styles.reminderTitle}>
        Email me before this MOT is due
      </label>
      <p className={styles.reminderNote}>
        {when} with what its last MOT flagged and what to check before the test. No account needed, and every email has a
        link to stop them.
      </p>
      <div className={styles.formRow}>
        <input
          id="reminder-email"
          type="email"
          className={styles.emailInput}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <button type="submit" className={styles.primary} disabled={state.kind === 'sending'}>
          {state.kind === 'sending' ? 'Sending…' : 'Remind me'}
        </button>
      </div>
      <div className={styles.hp} aria-hidden="true">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      {state.kind === 'error' ? (
        <p className={styles.reminderError} role="alert">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
