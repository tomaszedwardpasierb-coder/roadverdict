// Place at: src/app/dashboard/CarExcludeFromReportToggle.tsx
// Car mirror of ExcludeFromReportToggle.tsx - only difference is the
// PATCH endpoint (useTrackerFormSubmit is reused directly, genuinely
// vehicle-neutral, endpoint passed in by the caller).
'use client';

import { useTrackerFormSubmit } from './useTrackerFormSubmit';

export function CarExcludeFromReportToggle({
  fieldName,
  included,
  checkboxLabel,
  confirmMessage,
  noteText,
}: {
  fieldName: 'includeInsuranceInReport' | 'includeFinanceInReport';
  included: boolean;
  checkboxLabel: string;
  confirmMessage: string;
  noteText: string;
}) {
  const { submit, submitting, error } = useTrackerFormSubmit('/api/cars/car');

  async function handleToggle(next: boolean) {
    if (next) {
      if (!confirm(confirmMessage)) return;
    }
    await submit({ [fieldName]: next }, 'PATCH');
  }

  return (
    <div className="field-checkbox" style={{ marginBottom: '1rem' }}>
      <label>
        <input
          type="checkbox"
          checked={included}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={submitting}
        />
        {checkboxLabel}
      </label>
      <p className="field-note">{noteText}</p>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
