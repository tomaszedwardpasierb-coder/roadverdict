// Place at: src/app/dashboard/ResetDemoButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ResetDemoButton() {
  const router = useRouter();
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (!confirm('Reset the demo account? This deletes anything added or changed and restores the original 10-year dataset.')) {
      return;
    }
    setResetting(true);
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      if (res.ok) {
        router.refresh();
      } else {
        alert('Could not reset the demo right now. Please try again.');
      }
    } catch {
      alert('Could not reach the server.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <button type="button" className="submit-button" onClick={handleReset} disabled={resetting} style={{ width: '100%' }}>
      {resetting ? 'Resetting…' : '↺ Reset Demo'}
    </button>
  );
}
