// Place at: src/app/dashboard/useTrackerFormSubmit.ts
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Shared submit/loading/error handling for every tracker form. Each form
// still owns its own field state and JSX - this just removes the
// identical fetch/try-catch/finally boilerplate that was duplicated
// across AddBikeForm, SetRegionForm, LogServiceForm, and LogFuelForm.
export function useTrackerFormSubmit(endpoint: string) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<boolean> {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? 'Something went wrong. Try again.');
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error };
}
