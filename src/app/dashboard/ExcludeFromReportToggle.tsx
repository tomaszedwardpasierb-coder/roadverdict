// Place at: src/app/dashboard/ExcludeFromReportToggle.tsx
'use client';

import { useTrackerFormSubmit } from './useTrackerFormSubmit';

// One toggle per owner-specific bill category (insurance, finance),
// each off by default (see BikeDoc.includeInsuranceInReport /
// includeFinanceInReport) - not a checkbox per entry, since an
// instalment plan can mean 11-12 rows a year for one category alone,
// and asking someone to tick each one individually is exactly the
// repetitive friction lazy materialisation was built to avoid
// elsewhere in this app. Two independent instances of this same
// component (one per category) rather than one shared flag - someone
// may reasonably want to show one but not the other.
export function ExcludeFromReportToggle({
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
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  async function handleToggle(next: boolean) {
    // Only the turning-ON direction gets a confirmation - switching it
    // off can't accidentally work against the owner, so there's nothing
    // to double-check there.
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
