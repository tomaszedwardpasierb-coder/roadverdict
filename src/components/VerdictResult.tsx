import { VERDICT_LABELS, VERDICT_SUMMARIES, type Verdict } from '@/lib/verdict';

interface VerdictResultProps {
  verdict: Verdict;
  range: { low: number; high: number };
  quotedPrice: number;
  brandLabel: string;
  regionLabel: string;
  communityStats: { sampleSize: number; low: number; high: number } | null;
}

export function VerdictResult({
  verdict,
  range,
  quotedPrice,
  brandLabel,
  regionLabel,
  communityStats,
}: VerdictResultProps) {
  return (
    <div className="verdict-wrap" aria-live="polite">
      <div className={`stamp stamp--${verdict}`}>
        <span className="stamp__word">{VERDICT_LABELS[verdict]}</span>
        <span className="stamp__range">
          typical £{range.low}–£{range.high}
        </span>
      </div>
      <p className="verdict-summary">
        You were quoted £{quotedPrice.toFixed(0)}. {VERDICT_SUMMARIES[verdict]}
      </p>
      <p className="verdict-factors">
        Adjusted for {brandLabel} · {regionLabel}
      </p>
      {communityStats && (
        <p className="community-stats">
          {communityStats.sampleSize} riders on RoadVerdict reported quotes for this job on a
          similar bike between £{communityStats.low}–£{communityStats.high} recently. Self-reported,
          not used to calculate the verdict above.
        </p>
      )}
    </div>
  );
}
