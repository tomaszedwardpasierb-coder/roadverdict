// Place at: src/app/tomasz/DeleteAccountButton.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';

// The one irreversible action in this panel - a plain window.confirm
// (what every other admin action here uses) isn't enough friction for
// something that permanently deletes an account and everything tied to
// it. Requires typing the exact email back, the same confirmation
// pattern a real "delete my account" flow would use.
export function DeleteAccountButton({ email }: { email: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const typed = window.prompt(
      `This permanently deletes ${email} and everything tied to it - every bike, every logged record, every share link. This cannot be undone.\n\nType the account's email to confirm:`
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== email.toLowerCase()) {
      window.alert("That didn't match - nothing was deleted.");
      return;
    }

    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/accounts/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, confirmEmail: typed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not delete this account.');
        setDeleting(false);
        return;
      }
      router.refresh();
    } catch {
      setError('Could not reach the server.');
      setDeleting(false);
    }
  }

  return (
    <span>
      <button
        type="button"
        className={`${styles.button} ${styles.buttonSmall}`}
        style={{ background: 'var(--admin-danger)', color: '#fff' }}
        onClick={handleClick}
        disabled={deleting}
      >
        {deleting ? '…' : 'Delete'}
      </button>
      {error && <span style={{ color: 'var(--admin-danger)', fontSize: '0.72rem', marginLeft: '0.4rem' }}>{error}</span>}
    </span>
  );
}
