// Place at: src/app/dashboard/useTrackerFormSubmit.ts
'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Shared submit/loading/error handling for every tracker form. Each form
// still owns its own field state and JSX - this just removes the
// identical fetch/try-catch/finally boilerplate that was duplicated
// across AddBikeForm, SetRegionForm, LogServiceForm, and LogFuelForm.
export function useTrackerFormSubmit(endpoint: string) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state, deliberately - a caller that needs the raw response
  // right after `await submit(...)` resolves (e.g. a newly created
  // record's id) would otherwise read a stale value, since a state
  // update from inside submit() isn't visible in the caller's own
  // closure until the next render. A ref's .current is already correct
  // by the time the awaited call returns. submit()'s own return type is
  // untouched - still plain Promise<boolean> - so every existing caller
  // that doesn't use this keeps working exactly as before.
  const lastResponse = useRef<unknown>(null);

  async function submit(body: unknown, method: 'POST' | 'PATCH' | 'DELETE' = 'POST'): Promise<boolean> {
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
      lastResponse.current = data;
      router.refresh();
      return true;
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, submitting, error, lastResponse };
}
