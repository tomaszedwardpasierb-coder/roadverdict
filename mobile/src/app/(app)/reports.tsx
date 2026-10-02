// Reports: the web dashboard's stat cards and charts for the selected
// vehicle, over the web charts' own date ranges (see /api/app/reports on
// the server). A free account gets the web's free figures - total spend,
// current mileage and mileage over time - and a Pro lock for the rest,
// which the server doesn't send it.
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CHART_COLORS, Donut, LineChart, StackedBarChart, type Point } from '@/components/charts';
import { Icon } from '@/components/icon';
import { LockedValue, ProLock } from '@/components/pro-lock';
import { Card, ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { useApi } from '@/lib/use-api';
import { useVehicle } from '@/lib/vehicle';

type Range = 'all' | '1w' | '1m' | '6m' | '1y' | 'ytd';
type Category = keyof typeof CHART_COLORS.category;

type Reports = {
  isPro: boolean;
  range: Range;
  currencySymbol: string;
  distanceUnit: 'mi' | 'km';
  economyUnit: 'mpg' | 'l100km';
  electric: boolean;
  stats: { totalSpend: string; currentMileage: string; economy: string | null; perDistance: string | null; yearSpend: string | null };
  breakdown: { key: Category; label: string; amount: number; amountLabel: string }[] | null;
  mileage: Point[];
  economySeries: Point[] | null;
  fuelCosts: Point[] | null;
  monthly: { month: string; label: string; values: Record<Category, number> }[] | null;
};

// The web charts' own date ranges (dateRange.ts's RANGE_OPTIONS).
const RANGES: { value: Range; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: '1w', label: 'Last week' },
  { value: '1m', label: 'Last month' },
  { value: '6m', label: 'Last 6 months' },
  { value: '1y', label: 'Last year' },
  { value: 'ytd', label: 'YTD' },
];

// The web's category names, in the spend ring's order.
const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'service', label: 'Servicing & repairs' },
  { key: 'mods', label: 'Modifications' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'bills', label: 'Insurance/tax/MOT/finance' },
  { key: 'labour', label: 'Labour' },
];

export default function ReportsScreen() {
  const { selected } = useVehicle();
  const [range, setRange] = useState<Range>('all');
  const reports = useApi<Reports>(selected ? `/api/app/reports?kind=${selected.kind}&id=${encodeURIComponent(selected.id)}&range=${range}` : null);
  const data = reports.data;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Reports
          </Text>
          {selected ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {[selected.name, selected.registration].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
        {RANGES.map((r) => {
          const on = r.value === range;
          return (
            <Pressable
              key={r.value}
              onPress={() => setRange(r.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{r.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!selected ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No vehicle yet</Text>
        </View>
      ) : reports.error && !data ? (
        <ErrorState message={reports.error} onRetry={reports.retry} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={reports.refreshing} onRefresh={reports.refresh} colors={[Brand.amberInk]} />}>
          <ReportsBody data={data} kind={selected.kind} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ReportsBody({ data, kind }: { data: Reports; kind: 'bike' | 'car' }) {
  const { stats, currencySymbol: symbol } = data;
  const km = data.distanceUnit === 'km';
  const money = (v: number) => `${symbol}${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const distance = (v: number) => `${Math.round(v).toLocaleString('en-GB')} ${km ? 'km' : 'miles'}`;
  const economy = (v: number) => `${v.toFixed(1)} ${data.economyUnit === 'l100km' ? 'L/100km' : 'mpg'}`;
  const allTime = data.range === 'all';

  return (
    <>
      <View style={styles.stats}>
        <Stat label="Total spend" value={stats.totalSpend} />
        <Stat label={km ? 'Current km' : 'Current miles'} value={stats.currentMileage} />
        {data.electric ? null : <Stat label="Actual economy" value={stats.economy} />}
        <Stat label={km ? 'Per km' : 'Per mile'} value={stats.perDistance} />
        <Stat label="Spend this year" value={stats.yearSpend} />
      </View>

      {data.breakdown ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Where the money goes</Text>
          {data.breakdown.length === 0 ? (
            <Text style={styles.emptyNote}>{allTime ? 'Log something to see this fill in.' : 'Nothing spent in this period.'}</Text>
          ) : (
            <Breakdown rows={data.breakdown} total={stats.totalSpend} />
          )}
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>{km ? 'Kilometres' : 'Mileage'} over time</Text>
        {data.mileage.length > 0 ? (
          <LineChart key={data.range} points={data.mileage} color={CHART_COLORS.amber} format={distance} label={`${km ? 'Kilometres' : 'Mileage'} over time`} />
        ) : (
          <Text style={styles.emptyNote}>{allTime ? 'Log a couple of entries to see your mileage build up.' : 'No mileage logged in this period.'}</Text>
        )}
      </Card>

      {!data.isPro ? (
        <ProLock
          feature="Reports"
          description={`Every chart in one place – fuel economy, running costs, and category spend trends over the life of your ${kind === 'bike' ? 'bike' : 'car'}.`}
        />
      ) : (
        <>
          {data.electric || !data.economySeries ? null : (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>{data.economyUnit === 'l100km' ? 'Fuel economy' : 'MPG'} over time</Text>
              {data.economySeries.length > 0 ? (
                <LineChart key={data.range} points={data.economySeries} color={CHART_COLORS.amber} format={economy} label="Fuel economy over time" />
              ) : (
                <Text style={styles.emptyNote}>Log two consecutive full-tank fill-ups to see this.</Text>
              )}
            </Card>
          )}

          {data.fuelCosts ? (
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>{data.electric ? 'Charging cost over time' : 'Fuel cost over time'}</Text>
              {data.fuelCosts.length > 0 ? (
                <LineChart
                  key={data.range}
                  points={data.fuelCosts}
                  color={CHART_COLORS.green}
                  format={money}
                  axisPrefix={symbol}
                  zeroBased
                  label={data.electric ? 'Cost per charge' : 'Fuel cost per fill-up'}
                />
              ) : (
                <Text style={styles.emptyNote}>
                  {allTime ? (data.electric ? 'Log a charge to see cost trends here.' : 'Log a fuel fill-up to see cost trends here.') : 'None logged in this period.'}
                </Text>
              )}
            </Card>
          ) : null}

          {data.monthly ? <MonthlySpend key={data.range} months={data.monthly} money={money} symbol={symbol} allTime={allTime} /> : null}
        </>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <Card style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      {value == null ? (
        <LockedValue />
      ) : (
        <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      )}
    </Card>
  );
}

function Breakdown({ rows, total }: { rows: NonNullable<Reports['breakdown']>; total: string }) {
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <View style={styles.breakdown}>
      <Donut segments={rows.map((r) => ({ key: r.key, value: r.amount, color: CHART_COLORS.category[r.key] }))} centre={total} />
      <View style={styles.legend}>
        {rows.map((r) => {
          const pct = sum > 0 ? Math.round((r.amount / sum) * 100) : 0;
          return (
            <View key={r.key} style={styles.legendRow} accessible accessibilityLabel={`${r.label}: ${r.amountLabel}, ${pct} percent`}>
              <View style={[styles.dot, { backgroundColor: CHART_COLORS.category[r.key] }]} />
              <View style={styles.flex}>
                <Text style={styles.legendLabel}>{r.label}</Text>
                <Text style={styles.legendValue}>
                  {r.amountLabel} <Text style={styles.legendPct}>· {pct}%</Text>
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// Spend per month, every category stacked - or one category on its own,
// the way the web gives each its own chart.
function MonthlySpend({
  months,
  money,
  symbol,
  allTime,
}: {
  months: NonNullable<Reports['monthly']>;
  money: (v: number) => string;
  symbol: string;
  allTime: boolean;
}) {
  const [only, setOnly] = useState<Category | null>(null);
  const present = CATEGORIES.filter((c) => months.some((m) => m.values[c.key] > 0));
  const shown = present.filter((c) => only == null || c.key === only);
  const series = shown.map((c) => ({ key: c.key, label: c.label, color: CHART_COLORS.category[c.key] }));
  const bars = months.filter((m) => shown.some((c) => m.values[c.key] > 0)).map((m) => ({ key: m.month, label: m.label, values: m.values }));

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Spend by month</Text>
      {present.length === 0 ? (
        <Text style={styles.emptyNote}>{allTime ? 'Log something to see this fill in.' : 'Nothing spent in this period.'}</Text>
      ) : (
        <>
          {present.length > 1 ? (
            <View style={styles.filters}>
              {[{ key: null, label: 'All' }, ...present].map((c) => {
                const on = c.key === only;
                return (
                  <Pressable
                    key={c.key ?? 'all'}
                    onPress={() => setOnly(c.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.filter, on && styles.chipOn]}>
                    {c.key ? <View style={[styles.dot, styles.dotInline, { backgroundColor: CHART_COLORS.category[c.key] }]} /> : null}
                    <Text style={[styles.filterLabel, on && styles.chipLabelOn]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <StackedBarChart key={only ?? 'all'} bars={bars} series={series} format={money} axisPrefix={symbol} label={only ? `${shown[0].label} by month` : 'Spend by month'} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  chipsScroll: { flexGrow: 0 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: Brand.asphalt, borderColor: Brand.asphalt },
  chipLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  chipLabelOn: { color: '#FFFFFF' },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Brand.ink },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: '45%', paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  statLabel: { fontSize: 13, color: Brand.muted },
  statValue: { fontSize: 20, fontWeight: '800', color: Brand.ink, fontVariant: ['tabular-nums'], minHeight: 30 },
  card: { padding: 16, gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Brand.ink },
  emptyNote: { fontSize: 14, lineHeight: 20, color: Brand.muted },
  breakdown: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  dotInline: { marginTop: 0 },
  legendLabel: { fontSize: 13, color: Brand.muted },
  legendValue: { fontSize: 15, fontWeight: '700', color: Brand.ink, fontVariant: ['tabular-nums'] },
  legendPct: { fontWeight: '400', color: Brand.muted },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
  },
  filterLabel: { fontSize: 13, fontWeight: '600', color: Brand.ink },
});
