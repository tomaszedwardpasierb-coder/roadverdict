// Place at: src/app/garage/compare/ComparisonPicker.tsx
//
// Plain server-rendered form - no client JS needed. A native GET form
// submission with repeated `bikes` checkboxes produces exactly the
// `?bikes=id1&bikes=id2` query string the page below already knows how
// to read, so selection state lives in the URL, not in React state -
// bookmarkable/shareable/back-button-safe for free.
import styles from "../garage.module.css";

export function ComparisonPicker({
  bikes,
  selectedIds,
  minCompare,
  maxCompare,
}: {
  bikes: { id: string; name: string }[];
  selectedIds: string[];
  minCompare: number;
  maxCompare: number;
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
      <button type="submit" className="submit-button" style={{ marginTop: "0.8rem", width: "auto" }}>
        Compare
      </button>
    </form>
  );
}
