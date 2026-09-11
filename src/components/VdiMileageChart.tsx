// Place at: src/components/VdiMileageChart.tsx
'use client';
//
// Renders the individual mileage readings behind a VDI check's own
// mileage-consistency figures (calculatedAverageAnnualMileage/
// averageMileageForAge) as a chart, defaulting to a bar chart per the
// user's own request, switchable to a line - not tied to the dashboard's
// ChartFilterContext/TabSwitchContext/useChartTypePreference (this is a
// standalone tool page, not a per-vehicle persisted dashboard chart), so
// this keeps its own local toggle state rather than reusing those. The
// pure styling helpers from dashboard/chartStyle.ts are still reused
// directly, since they're plain functions with no context dependency.
import { useState } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler, type ScriptableContext } from 'chart.js';
import { barGradient, lineAreaGradient, dashedValueAxis, plainCategoryAxis, BAR_BORDER_RADIUS } from '@/app/dashboard/chartStyle';
import type { VdiMileageReading } from '@/lib/tracker/vdiUnlock';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const MILEAGE_COLOR = '#EE9A2E'; // matches --amber, same fixed mileage-metric colour MileageChart.tsx uses
const ANOMALY_COLOR = '#C1483A'; // matches --verdict-red - a reading lower than an earlier one, a genuine red flag

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function VdiMileageChart({ readings }: { readings: VdiMileageReading[] }) {
  const [kind, setKind] = useState<'bar' | 'line'>('bar');

  if (readings.length < 2) return null;

  const sorted = [...readings].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const labels = sorted.map((r) => fmtDate(r.date));
  const values = sorted.map((r) => r.mileage);
  const hasAnomaly = sorted.some((r) => !r.inSequence);

  function tooltipFooter(items: { dataIndex: number }[]): string | undefined {
    const reading = sorted[items[0]?.dataIndex];
    if (!reading || reading.inSequence) return undefined;
    return '⚠️ Lower than a previous reading';
  }

  return (
    <div style={{ marginTop: '0.6rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
        <p className="field-note" style={{ fontWeight: 600, margin: 0 }}>Mileage history</p>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {(['bar', 'line'] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setKind(opt)}
              style={{
                fontSize: '0.75rem',
                padding: '0.15rem 0.55rem',
                borderRadius: 'var(--radius-sm, 6px)',
                border: '1px solid var(--border)',
                background: kind === opt ? 'var(--amber)' : 'none',
                color: kind === opt ? 'var(--asphalt)' : 'var(--ink-soft)',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
      {hasAnomaly && (
        <p className="field-note" style={{ color: 'var(--verdict-red)', marginBottom: '0.4rem' }}>
          ⚠️ At least one reading is lower than an earlier one - shown in red below, worth asking the seller about.
        </p>
      )}
      {kind === 'bar' ? (
        <Bar
          data={{
            labels,
            datasets: [
              {
                label: 'Mileage',
                data: values,
                backgroundColor: (context: ScriptableContext<'bar'>) =>
                  sorted[context.dataIndex] && !sorted[context.dataIndex].inSequence ? ANOMALY_COLOR : barGradient(MILEAGE_COLOR)(context),
                borderRadius: BAR_BORDER_RADIUS,
              },
            ],
          }}
          options={{
            plugins: { legend: { display: false }, tooltip: { callbacks: { footer: tooltipFooter } } },
            scales: {
              y: dashedValueAxis({ title: { display: true, text: 'miles' } }),
              x: plainCategoryAxis(),
            },
            maintainAspectRatio: true,
          }}
        />
      ) : (
        <Line
          data={{
            labels,
            datasets: [
              {
                label: 'Mileage',
                data: values,
                borderColor: MILEAGE_COLOR,
                backgroundColor: lineAreaGradient(MILEAGE_COLOR),
                borderWidth: 2.4,
                borderCapStyle: 'round',
                borderJoinStyle: 'round',
                tension: 0.2,
                fill: true,
                pointRadius: 4,
                pointBackgroundColor: (context: ScriptableContext<'line'>) =>
                  sorted[context.dataIndex] && !sorted[context.dataIndex].inSequence ? ANOMALY_COLOR : MILEAGE_COLOR,
                pointBorderColor: (context: ScriptableContext<'line'>) =>
                  sorted[context.dataIndex] && !sorted[context.dataIndex].inSequence ? ANOMALY_COLOR : MILEAGE_COLOR,
              },
            ],
          }}
          options={{
            plugins: { legend: { display: false }, tooltip: { callbacks: { footer: tooltipFooter } } },
            scales: {
              y: dashedValueAxis({ title: { display: true, text: 'miles' } }),
              x: plainCategoryAxis(),
            },
            maintainAspectRatio: true,
          }}
        />
      )}
    </div>
  );
}
