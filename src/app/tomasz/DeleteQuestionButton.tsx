// Place at: src/app/tomasz/DeleteQuestionButton.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';
export function DeleteQuestionButton({ id }: { id: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  async function handleClick() {
    if (!window.confirm('Delete this logged question? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await fetch(`/api/tomasz/assistant-questions/${id}`, { method: 'DELETE' });
      router.refresh();
    } catch {
      setDeleting(false);
    }
  }
  return (
    <button
      type="button"
      className={`${styles.button} ${styles.buttonDanger} ${styles.buttonSmall}`}
      onClick={handleClick}
      disabled={deleting}
    >
      {deleting ? '\u2026' : 'Delete'}
    </button>
  );
}
