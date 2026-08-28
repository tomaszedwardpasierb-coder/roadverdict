import { VERDICT_LABELS, VERDICT_SUMMARIES, type Verdict } from '@/lib/verdict';

interface VerdictResultProps {
  verdict: Verdict;
  range: { low: number; high: number };
  quotedPrice: number;
  brandLabel: string;
  regionLabel: string;
  communityStats: { sampleSize: number; low: number; high: number } | null;
  advice: { explanation: string; questionsToAsk: string[] } | null;
}

export function VerdictResult({
  verdict,
  range,
  quotedPrice,
  brandLabel,
  regionLabel,
  communityStats,
  advice,
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
      {advice && (
        <div className="field-note" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Why this looks the way it does</p>
          <p style={{ margin: '0 0 0.6rem' }}>{advice.explanation}</p>
          {advice.questionsToAsk.length > 0 && (
            <>
              <p style={{ fontWeight: 600, marginBottom: '0.3rem' }}>Worth asking the garage</p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {advice.questionsToAsk.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
