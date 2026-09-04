// Place at: src/app/tomasz/AssistantQuestionsTable.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './adminShell.module.css';
import { DeleteQuestionButton } from './DeleteQuestionButton';
import type { AssistantQuestionLogDoc } from '@/lib/tracker/assistantQuestionLog';

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AssistantQuestionsTable({ questions }: { questions: AssistantQuestionLogDoc[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = questions.length > 0 && selected.size === questions.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(questions.map((q) => q.id)));
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected question${selected.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/tomasz/assistant-questions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not delete selected questions.');
        setDeleting(false);
        return;
      }
      setSelected(new Set());
      router.refresh();
    } catch {
      setError('Could not reach the server.');
      setDeleting(false);
    }
  }

  if (questions.length === 0) {
    return <p className={styles.warnNote}>No questions logged yet.</p>;
  }

  return (
    <>
      <div style={{ marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <button
          type="button"
          className={`${styles.button} ${styles.buttonDanger} ${styles.buttonSmall}`}
          onClick={handleBulkDelete}
          disabled={selected.size === 0 || deleting}
        >
          {deleting ? 'Deleting…' : `Delete selected (${selected.size})`}
        </button>
        {error && <span style={{ color: 'var(--admin-danger)', fontSize: '0.78rem' }}>{error}</span>}
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
            <th>Asked</th>
            <th>Question</th>
            <th>Asked by</th>
            <th>Result</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.has(q.id)}
                  onChange={() => toggle(q.id)}
                  aria-label={`Select question asked ${fmtDate(q.askedAt)}`}
                />
              </td>
              <td>{fmtDate(q.askedAt)}</td>
              <td>{q.question}</td>
              <td>{q.email ?? (q.signedIn ? 'Signed in (no email captured)' : 'Anonymous')}</td>
              <td style={q.hadError ? { color: 'var(--admin-danger)' } : undefined}>{q.hadError ? 'Error' : 'Answered'}</td>
              <td><DeleteQuestionButton id={q.id} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
