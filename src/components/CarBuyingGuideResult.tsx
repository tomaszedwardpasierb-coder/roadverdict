import type { Checklist } from '@/lib/tracker/carBuyerChecklist';

interface CarBuyingGuideResultProps {
  checklist: Checklist;
  addendum: string;
  brandNotes: string[] | null;
  ageBandLabel: string;
  carClassLabel: string;
  brandLabel: string;
}

export function CarBuyingGuideResult({
  checklist,
  addendum,
  brandNotes,
  ageBandLabel,
  carClassLabel,
  brandLabel,
}: CarBuyingGuideResultProps) {
  return (
    <div className="verdict-wrap">
      <div className="checklist-card">
        <p className="verdict-factors">
          {brandLabel} · {carClassLabel} · {ageBandLabel}
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
              From owner-forum reports, not a manufacturer bulletin - treat as a lead to check, not a confirmed fault.
            </p>
          </>
        )}
      </div>

      <p className="no-verdict-note">
        No &quot;is the asking price fair&quot; verdict here yet - that needs real UK resale
        price research this checklist didn&apos;t require, and it isn&apos;t built until that
        research is real, not guessed.
      </p>

      <div className="insurance-cta">
        <p>Want a second opinion beyond a checklist? A pre-purchase inspection covers what you can&apos;t check yourself.</p>
        <a href="https://www.google.com/search?q=car+pre-purchase+inspection+UK" target="_blank" rel="noopener noreferrer" className="btn-primary insurance-cta__link">
          Search for a local inspector
        </a>
      </div>
    </div>
  );
}
