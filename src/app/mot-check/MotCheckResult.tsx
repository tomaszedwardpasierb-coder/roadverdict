// Place at: src/app/mot-check/MotCheckResult.tsx
//
// What the free MOT check shows for one vehicle: its MOT status, the
// RoadVerdict MOT score with its reasons, the mileage at each test, and
// every test with each defect explained (and costed where our price
// tables cover it). Rendered on the server from a MotRecord - no state,
// no client code - so it can be tested with any record.
import Link from 'next/link';
import { explainDefect, SEVERITY, CATEGORIES } from '@/lib/mot/motDefects';
import { computeMotScore, BAND_LABEL, SCORE_RULES } from '@/lib/mot/motScore';
import type { MotRecord, MotVehicleKind } from '@/lib/mot/motRecord';
import styles from './mot-check.module.css';

function ukDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }).format(new Date(iso));
}

function miles(n: number): string {
  return `${n.toLocaleString('en-GB')} miles`;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

function saveHref(kind: MotVehicleKind, registration: string): string {
  return `/login?redirect=${encodeURIComponent(`/dashboard?addVehicle=${kind}&vrm=${registration}`)}`;
}

export function MotCheckResult({ record, now = new Date() }: { record: MotRecord; now?: Date }) {
  const score = computeMotScore(record, now);
  const due = record.motDueDate ? new Date(record.motDueDate) : null;
  const valid = due !== null && due.getTime() >= now.getTime();
  const vehicleName = [titleCase(record.make), record.model.toUpperCase()].filter(Boolean).join(' ') || record.registration;
  const facts = [record.colour && titleCase(record.colour), record.fuelType && titleCase(record.fuelType)].filter(Boolean).join(' · ');
  // Oldest first, one per day: a fail and its same-day retest share a reading.
  const readings = [...record.tests]
    .reverse()
    .filter((t) => t.mileage !== null)
    .filter((t, i, all) => i === all.length - 1 || all[i + 1].date.slice(0, 10) !== t.date.slice(0, 10));

  return (
    <div className={styles.result}>
      <section className={styles.card} aria-labelledby="vehicle-heading">
        <p className={styles.plate} aria-label={`Registration ${record.registration}`}>{record.registration}</p>
        <h2 id="vehicle-heading" className={styles.vehicle}>{vehicleName}</h2>
        {facts ? <p className={styles.muted}>{facts}</p> : null}
        <p className={valid ? styles.statusOk : styles.statusBad}>
          {due === null
            ? 'MOT status not available'
            : record.tests.length === 0
              ? `No MOT yet - the first is due by ${ukDate(record.motDueDate!)}`
              : valid
                ? `MOT valid until ${ukDate(record.motDueDate!)}`
                : `MOT expired on ${ukDate(record.motDueDate!)}`}
        </p>
      </section>

      {score ? (
        <section className={styles.card} aria-labelledby="score-heading">
          <h2 id="score-heading" className={styles.cardTitle}>RoadVerdict MOT score</h2>
          <p className={`${styles.score} ${styles[`band_${score.band.replace('-', '_')}`]}`}>
            <span className={styles.scoreNumber}>{score.score}</span>
            <span className={styles.scoreOutOf}>/100</span>
            <span className={styles.scoreBand}>{BAND_LABEL[score.band]}</span>
          </p>
          <ul className={styles.reasons}>
            {score.reasons.map((r) => (
              <li key={r.text}>
                <span>{r.text}</span>
                <span className={r.points < 0 ? styles.minus : styles.plus}>{r.points < 0 ? r.points : '✓'}</span>
              </li>
            ))}
          </ul>
          <details className={styles.rules}>
            <summary>How the score works</summary>
            <p>
              It sums up what the MOT record shows - it isn’t a prediction of future repairs or a
              mechanical inspection. Every vehicle starts at 100:
            </p>
            <ul>
              {SCORE_RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}

      {readings.length >= 2 ? (
        <section className={styles.card} aria-labelledby="mileage-heading">
          <h2 id="mileage-heading" className={styles.cardTitle}>Mileage at each MOT</h2>
          <ol className={styles.mileage}>
            {readings.map((t, i) => {
              const down = i > 0 && t.mileage! < readings[i - 1].mileage!;
              return (
                <li key={t.date} className={down ? styles.mileageDown : undefined}>
                  <span>{ukDate(t.date)}</span>
                  <span>{miles(t.mileage!)}</span>
                  {down ? <span className={styles.flag}>Went down - ask the seller why</span> : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      <section aria-labelledby="tests-heading">
        <h2 id="tests-heading" className={styles.sectionTitle}>
          {record.tests.length === 0 ? 'No MOT tests yet' : `Every MOT test (${record.tests.length})`}
        </h2>
        {record.tests.map((t) => (
          <article key={`${t.date}-${t.passed}`} className={styles.test}>
            <header className={styles.testHead}>
              <span className={t.passed ? styles.pass : styles.fail}>{t.passed ? 'Pass' : 'Fail'}</span>
              <span className={styles.testDate}>{ukDate(t.date)}</span>
              {t.mileage !== null ? <span className={styles.muted}>{miles(t.mileage)}</span> : null}
            </header>
            {t.defects.length === 0 ? (
              <p className={styles.muted}>No defects or advisories recorded.</p>
            ) : (
              <ul className={styles.defects}>
                {t.defects.map((d, i) => {
                  const e = explainDefect(d, record.kind);
                  return (
                    <li key={i} className={styles.defect}>
                      <p className={styles.defectHead}>
                        <span className={`${styles.chip} ${styles[`sev_${e.severity}`]}`}>{SEVERITY[e.severity].label}</span>
                        <span className={styles.official}>{d.text}</span>
                      </p>
                      <p className={styles.explain}>
                        <strong>{CATEGORIES[e.category].name}.</strong> {CATEGORIES[e.category].explain}
                      </p>
                      <p className={styles.severityNote}>{SEVERITY[e.severity].meaning}</p>
                      {e.cost ? (
                        <p className={styles.cost}>
                          {e.cost.line}. <Link href={e.cost.guideHref}>Where this comes from</Link> ·{' '}
                          <Link href={e.cost.quoteHref}>Got a quote? Check it</Link>
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        ))}
      </section>

      <section className={styles.save} aria-labelledby="save-heading">
        <h2 id="save-heading" className={styles.cardTitle}>Is this your {record.kind === 'bike' ? 'motorcycle' : record.kind === 'car' ? 'car' : 'vehicle'}?</h2>
        <p>
          Save it to a free logbook: its MOT history comes in automatically, you get a reminder
          before the next MOT, and every service and receipt has one place to live.
        </p>
        <div className={styles.saveActions}>
          {record.kind !== 'car' ? (
            <Link className={styles.primary} href={saveHref('bike', record.registration)}>
              {record.kind === 'bike' ? 'Save to my garage' : 'Save as a motorcycle'}
            </Link>
          ) : null}
          {record.kind !== 'bike' ? (
            <Link className={record.kind === 'car' ? styles.primary : styles.secondary} href={saveHref('car', record.registration)}>
              {record.kind === 'car' ? 'Save to my garage' : 'Save as a car'}
            </Link>
          ) : null}
        </div>
      </section>

      <p className={styles.quiet}>
        Buying it?{' '}
        <Link href={record.kind === 'car' ? '/cars/buying-guide' : '/buying-guide'}>Run the full history check</Link> for
        outstanding finance, theft and write-off records - the MOT record doesn’t show those.
      </p>
    </div>
  );
}
