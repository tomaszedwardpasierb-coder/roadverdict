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

// The line-chart equivalent of barGradient above, but a different shape
// on purpose: a bar's gradient runs bottom-to-top because the bar's own
// base is a fixed edge of the chart, whereas a line's "top" is wherever
// the data happens to sit. This fades from the accent colour at the top
// of the fill down to fully transparent at the baseline, matching the
// signature area-fill look every line chart in the redesign uses.
export function lineAreaGradient(color: string) {
  return (context: ScriptableContext<'line'>) => {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return hexToRgba(color, 0.28);
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, hexToRgba(color, 0.28));
    gradient.addColorStop(1, hexToRgba(color, 0));
    return gradient;
  };
}

// The "you are here" point treatment - every real data point gets a
// small dot, but the single most recent one renders larger with a white
// ring around it, so the chart reads as a live status rather than a
// static trend line. Both scriptable functions key off the same "last
// index in this dataset" check, so they always agree with each other.
function isLastPoint(context: ScriptableContext<'line'>): boolean {
  return context.dataIndex === context.dataset.data.length - 1;
}
export function lastPointRadius(baseRadius: number, lastRadius: number) {
  return (context: ScriptableContext<'line'>) => (isLastPoint(context) ? lastRadius : baseRadius);
}
export function lastPointRing(color: string) {
  return (context: ScriptableContext<'line'>) => (isLastPoint(context) ? '#fff' : color);
}
export function lastPointRingWidth(baseWidth: number, ringWidth: number) {
  return (context: ScriptableContext<'line'>) => (isLastPoint(context) ? ringWidth : baseWidth);
}

// Shared axis look for every line/bar chart in the app: dashed 1px
// horizontal gridlines in --line, a solid axis line, and small mono
// labels in --slate. Defined once here so every chart stays consistent
// rather than each component repeating (and risking drifting from) the
// same configuration independently.
export const AXIS_FONT = { family: "'IBM Plex Mono', 'Courier New', monospace", size: 9.5 };
export const AXIS_LABEL_COLOR = '#8A867D';
export const GRIDLINE_COLOR = '#E4E0D6';

interface AxisExtra {
  ticks?: Record<string, unknown>;
  [key: string]: unknown;
}

// The value axis: dashed reference lines, solid axis edge, mono ticks.
// `extra` merges in anything chart-specific (a title, a value callback).
// extra.ticks is merged INTO the base font/color, not used to replace
// the whole ticks object - a flat spread would silently drop the font
// and colour styling the moment a caller needs to add its own callback,
// which is exactly the case a £-formatted y-axis needs.
export function dashedValueAxis(extra: AxisExtra = {}) {
  const { ticks: extraTicks, ...rest } = extra;
  return {
    grid: { color: GRIDLINE_COLOR, drawTicks: false },
    border: { color: GRIDLINE_COLOR, dash: [3, 3] },
    ticks: { font: AXIS_FONT, color: AXIS_LABEL_COLOR, ...extraTicks },
    ...rest,
  };
}
// The category/date axis: no vertical gridlines, solid axis edge, mono
// ticks - the doc only specifies horizontal reference lines as dashed.
export function plainCategoryAxis(extra: AxisExtra = {}) {
  const { ticks: extraTicks, ...rest } = extra;
  return {
    grid: { display: false },
    border: { color: GRIDLINE_COLOR },
    ticks: { font: AXIS_FONT, color: AXIS_LABEL_COLOR, ...extraTicks },
    ...rest,
  };
}
