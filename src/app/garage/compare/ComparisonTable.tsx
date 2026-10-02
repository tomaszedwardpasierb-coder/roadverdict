// Place at: src/app/garage/compare/ComparisonTable.tsx
import { Fragment } from "react";
import type { Currency, ExchangeRates } from "@/lib/tracker/currency";
import type { DistanceUnit } from "@/lib/tracker/unitFormat";
import type { VehicleComparisonEntry } from "@/lib/tracker/vehicleComparison";
import type { ComparisonPeriod } from "@/lib/tracker/bikeComparisonPeriod";
import { buildComparisonSections } from "@/lib/tracker/comparisonSections";
import styles from "../garage.module.css";

export function ComparisonTable({
  entries,
  currency,
  rates,
  distanceUnit,
  period,
}: {
  entries: VehicleComparisonEntry[];
  currency: Currency;
  rates: ExchangeRates | null;
  distanceUnit: DistanceUnit;
  period: ComparisonPeriod | null;
}) {
  const { verdict, label, hasCustomPeriod, sections } = buildComparisonSections({ entries, currency, rates, distanceUnit, period });

  return (
    <div>
      {verdict && <p className={styles.compareVerdict}>{verdict}</p>}
      <p className="field-note" style={{ marginBottom: "0.8rem" }}>
        Shown in {currency} / {distanceUnit === "km" ? "kilometres" : "miles"}, so every bike is directly comparable regardless of its own display setting.
      </p>
      {hasCustomPeriod && (
        <p className="field-note" style={{ marginBottom: "0.8rem" }}>
          Cost, usage, and servicing rows reflect {label} only. Documentation and what&apos;s due soonest are always
          shown across each bike&apos;s full history, regardless of this filter. Mileage at a specific date is
          approximated from the nearest logged entry around that date, since odometer readings aren&apos;t logged
          continuously.
        </p>
      )}
      <div className={styles.compareTableWrap}>
        <table className={styles.compareTable}>
          <thead>
            <tr>
              <th />
              {entries.map((e) => (
                <th key={e.bikeId}>{e.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => (
              <Fragment key={section.title}>
                <tr className={styles.compareSectionRow}>
                  <td colSpan={entries.length + 1}>{section.title}</td>
                </tr>
                {section.rows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    {entries.map((e, i) => {
                      const isWinner = row.winnerBikeId === e.bikeId;
                      return (
                        <td key={e.bikeId} className={isWinner ? styles.compareWinnerCell : undefined}>
                          {row.values[i]}
                          {isWinner && row.badge && <span className={styles.compareBadge}>{row.badge}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
