// Small charts for Reports, drawn with react-native-svg in the web
// dashboard's colours (chartStyle.ts and each chart's own colour). Tap a
// chart to read a point; the readout above it shows the latest one until
// then.
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { Brand } from '@/constants/brand';

export const CHART_COLORS = {
  amber: '#EE9A2E',
  green: '#21815A',
  // The web's spend donut, in its fixed order: Ink, Amber, Green, Slate, Blue.
  category: { service: '#1C1D20', mods: '#EE9A2E', fuel: '#21815A', bills: '#8A867D', labour: '#3E6B99' },
} as const;

const AXIS_LABEL = '#8A867D';
const GRIDLINE = '#E4E0D6';
const HEIGHT = 180;
const PAD = { left: 44, right: 12, top: 12, bottom: 24 };

export type Point = { date: string; value: number };

// Round steps (1, 2, 2.5, 5 × a power of ten) covering min to max.
export function niceTicks(min: number, max: number, count = 4): number[] {
  let lo = min;
  let hi = max;
  if (!(hi > lo)) {
    // One value (or all the same): a little room either side, never
    // below zero for a figure that can't be negative.
    const pad = Math.abs(hi) > 0 ? Math.abs(hi) * 0.1 : 1;
    lo = min >= 0 ? Math.max(0, lo - pad) : lo - pad;
    hi += pad;
  }
  const raw = (hi - lo) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / magnitude;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) {
    ticks.push(Number((Math.round(v / step) * step).toFixed(6)));
  }
  return ticks;
}

// Axis labels, with as many decimals as the step needs to tell ticks
// apart: 35k, 13.9k, 1.5k, 52, 4.5.
export function tickLabel(value: number, step: number, prefix = ''): string {
  const size = Math.abs(value);
  const scale = size >= 1_000_000 ? 1_000_000 : size >= 1000 ? 1000 : 1;
  const scaledStep = step / scale;
  let decimals = 0;
  while (decimals < 3 && Math.abs(Math.round(scaledStep * 10 ** decimals) - scaledStep * 10 ** decimals) > 1e-6) decimals++;
  const text = (value / scale)
    .toFixed(decimals)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return `${prefix}${text}${scale === 1_000_000 ? 'm' : scale === 1000 ? 'k' : ''}`;
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function axisDate(iso: string, spanDays: number): string {
  // "Aug 2026", never "Aug 26", which reads as the 26th of August.
  return new Date(iso).toLocaleDateString('en-GB', spanDays < 60 ? { day: 'numeric', month: 'short' } : { month: 'short', year: 'numeric' });
}

// First, middle and last - enough to place the line in time without
// crowding a phone-width axis.
function labelIndexes(n: number): number[] {
  if (n <= 1) return [0];
  if (n <= 3) return Array.from({ length: n }, (_, i) => i);
  return [0, Math.floor((n - 1) / 2), n - 1];
}

function useWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.floor(e.nativeEvent.layout.width));
  return { width, onLayout };
}

function Readout({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <View style={styles.readout} accessibilityLiveRegion="polite">
      <Text style={styles.readoutTitle}>{title}</Text>
      <Text style={styles.readoutValue}>{value}</Text>
      <Text style={styles.readoutDetail}>{detail}</Text>
    </View>
  );
}

function Frame({ label, onPress, onLayout, children }: { label: string; onPress: (e: GestureResponderEvent) => void; onLayout: (e: LayoutChangeEvent) => void; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} onLayout={onLayout} accessibilityRole="image" accessibilityLabel={label} accessibilityHint="Tap along the chart to read a point" style={styles.frame}>
      {children}
    </Pressable>
  );
}

export function LineChart({
  points: rawPoints,
  color,
  format,
  label,
  axisPrefix,
  zeroBased = false,
  rollingWindow,
  rollingNoun = 'readings',
}: {
  points: Point[];
  color: string;
  // The full figure, for the readout: "35,200 miles".
  format: (value: number) => string;
  // What the chart shows, for screen readers: "Mileage over time".
  label: string;
  axisPrefix?: string;
  zeroBased?: boolean;
  // Plot the average of the last N points instead of each one - for noisy
  // series like per-tank MPG, where a single short fill can read 30 or 200.
  // The readout still gives the selected point's own value.
  rollingWindow?: number;
  // "tanks" - for the readout: "Average of the last 5 tanks".
  rollingNoun?: string;
}) {
  const { width, onLayout } = useWidth();
  const [picked, setPicked] = useState<number | null>(null);
  const points = useMemo(() => {
    if (!rollingWindow || rawPoints.length <= rollingWindow) return rawPoints;
    return rawPoints.map((p, i) => {
      const window = rawPoints.slice(Math.max(0, i - rollingWindow + 1), i + 1);
      return { ...p, value: window.reduce((sum, q) => sum + q.value, 0) / window.length };
    });
  }, [rawPoints, rollingWindow]);
  const smoothed = points !== rawPoints;
  const n = points.length;
  const active = picked != null && picked < n ? picked : n - 1;
  if (n === 0) return null;

  const values = points.map((p) => p.value);
  const ticks = niceTicks(zeroBased ? 0 : Math.min(...values), Math.max(...values, zeroBased ? 1 : -Infinity));
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const area = n > 1 ? `${line} L${x(n - 1).toFixed(1)} ${PAD.top + plotH} L${x(0).toFixed(1)} ${PAD.top + plotH} Z` : '';
  const spanDays = n > 1 ? (new Date(points[n - 1].date).getTime() - new Date(points[0].date).getTime()) / 86400000 : 0;
  const gradientId = `fill-${color.slice(1)}`;

  function pick(e: GestureResponderEvent) {
    if (n === 0) return;
    const i = n === 1 ? 0 : Math.round(((e.nativeEvent.locationX - PAD.left) / plotW) * (n - 1));
    setPicked(Math.min(Math.max(i, 0), n - 1));
  }

  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const summary = `${label}. ${n} ${n === 1 ? 'point' : 'points'}, from ${format(points[0].value)} on ${longDate(points[0].date)} to ${format(points[n - 1].value)} on ${longDate(points[n - 1].date)}. Lowest ${format(lowest)}, highest ${format(highest)}.`;

  return (
    <View>
      <Readout
        title={smoothed ? `Average of the last ${rollingWindow} ${rollingNoun}` : active === n - 1 && picked == null ? 'Latest' : 'Selected'}
        value={format(points[active].value)}
        detail={smoothed ? `${longDate(points[active].date)} · that one alone ${format(rawPoints[active].value)}` : longDate(points[active].date)}
      />
      <Frame label={summary} onPress={pick} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {ticks.map((t) => (
              <G key={t}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRIDLINE} strokeWidth={1} strokeDasharray="4 4" />
                <SvgText x={PAD.left - 6} y={y(t) + 4} fontSize={11} fill={AXIS_LABEL} textAnchor="end">
                  {tickLabel(t, step, axisPrefix)}
                </SvgText>
              </G>
            ))}
            {labelIndexes(n).map((i) => (
              <SvgText
                key={i}
                x={x(i)}
                y={HEIGHT - 6}
                fontSize={11}
                fill={AXIS_LABEL}
                textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
                {axisDate(points[i].date, spanDays)}
              </SvgText>
            ))}
            {area ? <Path d={area} fill={`url(#${gradientId})`} /> : null}
            {n > 1 ? <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {n <= 24 ? points.map((p, i) => <Circle key={i} cx={x(i)} cy={y(p.value)} r={2.5} fill={color} />) : null}
            <Line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke={Brand.ink} strokeOpacity={0.25} strokeWidth={1} />
            <Circle cx={x(active)} cy={y(points[active].value)} r={5} fill={color} stroke="#FFFFFF" strokeWidth={2} />
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </Frame>
    </View>
  );
}

export type StackSeries = { key: string; label: string; color: string };

export function StackedBarChart({
  bars,
  series,
  format,
  axisPrefix,
  label,
}: {
  bars: { key: string; label: string; values: Record<string, number> }[];
  series: StackSeries[];
  format: (value: number) => string;
  axisPrefix?: string;
  label: string;
}) {
  const { width, onLayout } = useWidth();
  const [picked, setPicked] = useState<number | null>(null);
  const n = bars.length;
  const active = picked != null && picked < n ? picked : n - 1;
  if (n === 0) return null;
  const totals = bars.map((b) => series.reduce((sum, s) => sum + (b.values[s.key] ?? 0), 0));

  const ticks = niceTicks(0, Math.max(...totals, 1));
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(width - PAD.left - PAD.right, 1);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(n, 1);
  const barW = Math.max(Math.min(28, slot * 0.64), 2);
  const y = (v: number) => PAD.top + plotH - (v / (yMax || 1)) * plotH;

  function pick(e: GestureResponderEvent) {
    if (n === 0) return;
    const i = Math.floor((e.nativeEvent.locationX - PAD.left) / slot);
    setPicked(Math.min(Math.max(i, 0), n - 1));
  }

  const biggest = totals.indexOf(Math.max(...totals));
  const summary = `${label}. ${n} ${n === 1 ? 'month' : 'months'}, from ${bars[0].label} to ${bars[n - 1].label}. Highest ${format(totals[biggest])} in ${bars[biggest].label}.`;
  const parts = series.filter((s) => (bars[active].values[s.key] ?? 0) > 0);

  return (
    <View>
      <Readout title={active === n - 1 && picked == null ? 'Latest month' : 'Selected month'} value={format(totals[active])} detail={bars[active].label} />
      <Frame label={summary} onPress={pick} onLayout={onLayout}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {ticks.map((t) => (
              <G key={t}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke={GRIDLINE} strokeWidth={1} strokeDasharray="4 4" />
                <SvgText x={PAD.left - 6} y={y(t) + 4} fontSize={11} fill={AXIS_LABEL} textAnchor="end">
                  {tickLabel(t, step, axisPrefix)}
                </SvgText>
              </G>
            ))}
            {bars.map((bar, i) => {
              let base = 0;
              const left = PAD.left + slot * i + (slot - barW) / 2;
              return (
                <G key={bar.key} opacity={picked == null || i === active ? 1 : 0.35}>
                  {series.map((s) => {
                    const v = bar.values[s.key] ?? 0;
                    if (v <= 0) return null;
                    const top = y(base + v);
                    const h = y(base) - top;
                    base += v;
                    return <Rect key={s.key} x={left} y={top} width={barW} height={Math.max(h, 1)} fill={s.color} />;
                  })}
                </G>
              );
            })}
            {labelIndexes(n).map((i) => (
              <SvgText
                key={i}
                x={n === 1 ? PAD.left + slot / 2 : i === 0 ? PAD.left : i === n - 1 ? PAD.left + slot * n : PAD.left + slot * i + slot / 2}
                y={HEIGHT - 6}
                fontSize={11}
                fill={AXIS_LABEL}
                textAnchor={n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
                {bars[i].label}
              </SvgText>
            ))}
          </Svg>
        ) : (
          <View style={{ height: HEIGHT }} />
        )}
      </Frame>
      {parts.length > 1 ? (
        <View style={styles.parts}>
          {parts.map((s) => (
            <View key={s.key} style={styles.part}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={styles.partLabel}>{s.label}</Text>
              <Text style={styles.partValue}>{format(bars[active].values[s.key])}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// The web's spend ring: each category's share, the total in the middle.
export function Donut({ segments, centre, size = 132 }: { segments: { key: string; value: number; color: string }[]; centre: string; size?: number }) {
  const stroke = 20;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let offset = 0;

  return (
    <View style={{ width: size, height: size }} importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Circle cx={c} cy={c} r={r} stroke={GRIDLINE} strokeWidth={stroke} fill="none" />
        <G rotation={-90} origin={`${c}, ${c}`}>
          {total > 0
            ? segments.map((s) => {
                const length = (s.value / total) * circumference;
                const dash = (
                  <Circle
                    key={s.key}
                    cx={c}
                    cy={c}
                    r={r}
                    stroke={s.color}
                    strokeWidth={stroke}
                    fill="none"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += length;
                return dash;
              })
            : null}
        </G>
      </Svg>
      <View style={styles.donutCentre}>
        <Text style={styles.donutValue} numberOfLines={1} adjustsFontSizeToFit>
          {centre}
        </Text>
        <Text style={styles.donutCaption}>total</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { gap: 1, marginBottom: 6 },
  readoutTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: Brand.muted },
  readoutValue: { fontSize: 22, fontWeight: '800', color: Brand.ink, fontVariant: ['tabular-nums'] },
  readoutDetail: { fontSize: 13, color: Brand.muted },
  frame: { height: HEIGHT },
  parts: { gap: 6, marginTop: 10 },
  part: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  partLabel: { flex: 1, fontSize: 14, color: Brand.ink },
  partValue: { fontSize: 14, fontWeight: '600', color: Brand.ink, fontVariant: ['tabular-nums'] },
  donutCentre: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  donutValue: { fontSize: 16, fontWeight: '800', color: Brand.ink, fontVariant: ['tabular-nums'] },
  donutCaption: { fontSize: 12, color: Brand.muted },
});
