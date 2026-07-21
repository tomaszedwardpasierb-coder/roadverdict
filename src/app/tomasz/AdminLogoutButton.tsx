// Place at: src/app/tomasz/AdminLogoutButton.tsx
'use client';

import { useRouter } from 'next/navigation';

export function AdminLogoutButton() {
  const router = useRouter();
  async function handleClick() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/tomasz/login');
  }
  return (
    <button type="button" className="submit-button" onClick={handleClick}>
      Sign out
    </button>
  );
}
