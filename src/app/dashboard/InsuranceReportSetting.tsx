// Place at: src/app/dashboard/InsuranceReportSetting.tsx
'use client';

import { useTrackerFormSubmit } from './useTrackerFormSubmit';

// Off by default (see BikeDoc.includeInsuranceInReport) - insurance is
// owner-specific, not bike-specific, so it's left out of the buyer-facing
// report unless the owner deliberately opts back in. Only one toggle for
// the whole bike, not a checkbox per entry - an instalment plan can mean
// 11-12 insurance rows a year, and asking someone to tick each one
// individually is exactly the repetitive friction lazy materialisation
// was built to avoid elsewhere in this app.
export function InsuranceReportSetting({ includeInsuranceInReport }: { includeInsuranceInReport: boolean }) {
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  async function handleToggle(next: boolean) {
    // Only the turning-ON direction gets a confirmation - switching it
    // off can't accidentally work against the owner, so there's nothing
    // to double-check there.
    if (next) {
      const confirmed = confirm(
        "A future buyer will have their own insurance costs - showing yours could make your bike look pricier to run than it will actually be for them. Show anyway?"
      );
      if (!confirmed) return;
    }
    await submit({ includeInsuranceInReport: next }, 'PATCH');
  }

  return (
    <div className="field-checkbox" style={{ marginBottom: '1rem' }}>
      <label>
        <input
          type="checkbox"
          checked={includeInsuranceInReport}
          onChange={(e) => handleToggle(e.target.checked)}
          disabled={submitting}
        />
        Show insurance history in my buyer report
      </label>
      <p className="field-note">
        Off by default - insurance depends on who&apos;s holding the policy, not the bike, so a future buyer&apos;s
        own premium will be different regardless of what you&apos;ve paid. Road tax and MOT are always shown,
        since those are tied to the bike itself.
      </p>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
