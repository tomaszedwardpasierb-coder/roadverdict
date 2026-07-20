// Place at: src/app/report/[token]/PrintButton.tsx
'use client';
export function PrintButton() {
  return (
    <button type="button" className="submit-button" onClick={() => window.print()}>
      Print this report
    </button>
  );
}
