// Place at: src/app/ImpersonationBanner.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ImpersonationBanner({ email }: { email: string }) {
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  async function handleExit() {
    setExiting(true);
    try {
      await fetch('/api/tomasz/impersonate', { method: 'DELETE' });
    } finally {
      router.push('/tomasz');
      router.refresh();
    }
  }

  return (
    <div
      style={{
        background: 'var(--verdict-red)',
        color: '#fff',
        padding: '0.5rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        fontSize: '0.85rem',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      }}
    >
      <span>Viewing as <strong>{email}</strong> - admin impersonation active</span>
      <button
        type="button"
        onClick={handleExit}
        disabled={exiting}
        style={{
          background: '#fff',
          color: 'var(--verdict-red)',
          border: 'none',
          borderRadius: '4px',
          padding: '0.25rem 0.7rem',
          fontWeight: 600,
          fontSize: '0.8rem',
          cursor: exiting ? 'default' : 'pointer',
        }}
      >
        {exiting ? 'Exiting…' : 'Exit impersonation'}
      </button>
    </div>
  );
}
