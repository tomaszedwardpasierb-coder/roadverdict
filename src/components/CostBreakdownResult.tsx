import type { AnnualCostBreakdown } from '@/lib/costCalculator';

interface CostBreakdownResultProps {
  breakdown: AnnualCostBreakdown;
  brandLabel: string;
  regionLabel: string;
  advice: { explanation: string; watchOutFor: string[] } | null;
}

const LINE_LABELS: { key: keyof AnnualCostBreakdown; label: string }[] = [
  { key: 'servicing', label: 'Servicing' },
  { key: 'tyres', label: 'Tyres' },
  { key: 'mot', label: 'MOT' },
  { key: 'tax', label: 'Road tax (VED)' },
  { key: 'fuel', label: 'Fuel' },
];

export function CostBreakdownResult({
  breakdown,
  brandLabel,
  regionLabel,
  advice,
}: CostBreakdownResultProps) {
  return (
    <div className="verdict-wrap">
      <div className="receipt">
        <div className="receipt__header">True annual cost</div>
        {LINE_LABELS.map(({ key, label }) => (
          <div className="receipt__line" key={key}>
            <span>{label}</span>
            <span>£{breakdown[key]}</span>
          </div>
        ))}
        <div className="receipt__line receipt__line--insurance">
          <span>Insurance</span>
          <span>not included</span>
        </div>
        <hr className="ticket__divider" />
        <div className="receipt__line receipt__line--total">
          <span>Total (excl. insurance)</span>
          <span>£{breakdown.total}</span>
        </div>
      </div>
      <p className="verdict-factors">
        Adjusted for {brandLabel} · {regionLabel}
      </p>
      <div className="insurance-cta">
        <p>
          Insurance isn&apos;t included above on purpose - it depends on you (age, licence,
          no-claims, postcode), not just the bike, so a generic estimate here would be more
          misleading than useful.
        </p>
        {/* Affiliate slot — currently a dead link. Join Awin (or another UK insurance
            affiliate programme) and swap this href for the real tracked link once approved.
            This is the account you actually need to create for this feature, not for
            anything else on the site. */}
        <a href="#" className="submit-button insurance-cta__link">
          Compare insurance quotes
        </a>
      </div>
      {advice && (
        <div className="field-note" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Where this actually goes</p>
          <p style={{ margin: '0 0 0.6rem' }}>{advice.explanation}</p>
          {advice.watchOutFor.length > 0 && (
            <>
              <p style={{ fontWeight: 600, marginBottom: '0.3rem' }}>Worth knowing</p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {advice.watchOutFor.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
