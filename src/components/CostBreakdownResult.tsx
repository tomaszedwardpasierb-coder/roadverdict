import type { AnnualCostBreakdown } from '@/lib/costCalculator';

interface CostBreakdownResultProps {
  breakdown: AnnualCostBreakdown;
  brandLabel: string;
  regionLabel: string;
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
          Insurance isn&apos;t included above on purpose — it depends on you (age, licence,
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
    </div>
  );
}
