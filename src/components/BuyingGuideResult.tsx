import type { Checklist } from '@/lib/buyerChecklist';

interface BuyingGuideResultProps {
  checklist: Checklist;
  addendum: string;
  brandNotes: string[] | null;
  ageBandLabel: string;
  bikeClassLabel: string;
  brandLabel: string;
}

export function BuyingGuideResult({
  checklist,
  addendum,
  brandNotes,
  ageBandLabel,
  bikeClassLabel,
  brandLabel,
}: BuyingGuideResultProps) {
  return (
    <div className="verdict-wrap">
      <div className="checklist-card">
        <p className="verdict-factors">
          {brandLabel} · {bikeClassLabel} · {ageBandLabel}
        </p>
        <p className="checklist-emphasis">{checklist.emphasis}</p>

        <h3 className="checklist-heading">What to check</h3>
        <ul className="checklist-list">
          {checklist.inspectionPoints.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>

        <h3 className="checklist-heading">Questions to ask the seller</h3>
        <ul className="checklist-list">
          {checklist.questionsForSeller.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>

        <p className="checklist-addendum">{addendum}</p>

        {brandNotes && (
          <>
            <h3 className="checklist-heading">Specific to {brandLabel}</h3>
            <ul className="checklist-list">
              {brandNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            <p className="brand-notes-caveat">
              From owner-forum reports, not a manufacturer bulletin — treat as a lead to check, not a confirmed fault.
            </p>
          </>
        )}
      </div>

      <p className="no-verdict-note">
        No &quot;is the asking price fair&quot; verdict here yet — that needs real UK resale
        price research this checklist didn&apos;t require, and it isn&apos;t built until that
        research is real, not guessed.
      </p>

      <div className="insurance-cta">
        <p>Want a second opinion beyond a checklist? A pre-purchase inspection covers what you can&apos;t check yourself.</p>
        {/* Referral slot — currently a dead link. Needs an account with a
            pre-purchase inspection provider or affiliate programme before
            this does anything. */}
        <a href="#" className="submit-button insurance-cta__link">
          Find a pre-purchase inspection
        </a>
      </div>
    </div>
  );
}
