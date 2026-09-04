// Place at: src/app/garage/compare/ComparisonPicker.tsx
//
// Plain server-rendered form - no client JS needed. A native GET form
// submission with repeated `bikes` checkboxes and the two date inputs
// produces exactly the `?bikes=id1&bikes=id2&from=...&to=...` query
// string the page below already knows how to read, so all of the
// selection state lives in the URL, not in React state -
// bookmarkable/shareable/back-button-safe for free.
import styles from "../garage.module.css";

export function ComparisonPicker({
  bikes,
  selectedIds,
  minCompare,
  maxCompare,
  from,
  to,
}: {
  bikes: { id: string; name: string }[];
  selectedIds: string[];
  minCompare: number;
  maxCompare: number;
  from?: string;
  to?: string;
}) {
  return (
    <form method="get" action="/garage/compare" className={styles.comparePickerForm}>
      <p className="field-note" style={{ marginBottom: "0.6rem" }}>
        Pick {minCompare} to {maxCompare} bikes to compare.
      </p>
      {bikes.map((b) => (
        <div key={b.id} className="field-checkbox">
          <label>
            <input type="checkbox" name="bikes" value={b.id} defaultChecked={selectedIds.includes(b.id)} />
            {b.name}
          </label>
        </div>
      ))}

      <div className={styles.comparePeriodFields}>
        <div className="field">
          <label htmlFor="compare-from">From (optional)</label>
          <input id="compare-from" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="compare-to">To (optional)</label>
          <input id="compare-to" type="date" name="to" defaultValue={to ?? ""} />
        </div>
      </div>
      <p className="field-note" style={{ marginBottom: "0.6rem" }}>
        Leave both blank to compare overall. Set only &quot;From&quot; to see spend since a date. Set both for a
        specific period.
      </p>

      <button type="submit" className="submit-button" style={{ marginTop: "0.4rem", width: "auto" }}>
        Compare
      </button>
    </form>
  );
}
