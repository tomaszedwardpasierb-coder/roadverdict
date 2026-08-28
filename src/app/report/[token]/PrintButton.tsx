// Place at: src/app/report/[token]/PrintButton.tsx
'use client';
export function PrintButton() {
  return (
    <button type="button" className="btn-primary" onClick={() => window.print()}>
      Print this report
    </button>
  );
}
