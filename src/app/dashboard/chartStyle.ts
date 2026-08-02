// Place at: src/app/dashboard/chartStyle.ts
import type { ScriptableContext } from 'chart.js';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// A Chart.js scriptable backgroundColor - solid at the bar's base, fading
// to a softer tint at the top. Deliberately not a literal 3D/perspective
// effect: a tilted-block style bar chart visually distorts how tall a bar
// reads relative to its true value, which runs against the whole point of
// giving an honest verdict. A vertical gradient adds visual depth without
// touching what the bar actually communicates.
export function barGradient(color: string) {
  return (context: ScriptableContext<'bar'>) => {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return color; // not yet laid out - fall back to flat color
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, hexToRgba(color, 0.55));
    gradient.addColorStop(1, hexToRgba(color, 1));
    return gradient;
  };
}

// Rounds only the top corners of each bar - the standard, non-distorting
// way to soften a bar chart's look. Applied as a dataset-level option.
export const BAR_BORDER_RADIUS = { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 };
