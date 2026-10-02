// Compare: the website's /garage/compare in the app - pick 2 to 4 of your
// vehicles and see them side by side, from each one's whole logged
// history (see /api/app/compare on the server, which builds the same rows
// as the website). Pro only; a free account gets the plain Pro lock.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ProLock } from '@/components/pro-lock';
import { Card, ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { useApi } from '@/lib/use-api';

type CompareVehicle = { kind: 'bike' | 'car'; id: string; name: string };
type Comparison = {
  names: string[];
  verdict: string | null;
  unitNote: string;
  sections: { title: string; rows: { label: string; values: string[]; winnerIndex: number | null; badge: string | null }[] }[];
};
type CompareData = { isPro: boolean; min: number; max: number; vehicles: CompareVehicle[]; comparison: Comparison | null };

export default function CompareScreen() {
  // What's ticked, and what was last asked for (only that is fetched).
  const [picked, setPicked] = useState<string[] | null>(null);
  const [compared, setCompared] = useState<string[]>([]);
  const api = useApi<CompareData>(`/api/app/compare${compared.length ? `?ids=${compared.map(encodeURIComponent).join(',')}` : ''}`);
  // Keeps the picker on screen while a new comparison loads (useApi starts
  // empty again whenever its path changes).
  const [lastData, setLastData] = useState<CompareData | null>(null);
  useEffect(() => {
    if (api.data) setLastData(api.data);
  }, [api.data]);
  const data = api.data ?? lastData;

  // Starts with the first few vehicles ticked, so two taps compare them.
  useEffect(() => {
    if (data && picked === null) setPicked(data.vehicles.slice(0, data.max).map((v) => v.id));
  }, [data, picked]);

  function toggle(id: string) {
    if (!data) return;
    setPicked((current) => {
      const list = current ?? [];
      if (list.includes(id)) return list.filter((x) => x !== id);
      return list.length >= data.max ? list : [...list, id];
    });
  }

  const ticked = picked ?? [];
  const canCompare = !!data && ticked.length >= data.min && ticked.length <= data.max;
  const showingCurrent = !!data?.comparison && compared.length === ticked.length && compared.every((id) => ticked.includes(id));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Compare vehicles
        </Text>
      </View>

      {api.error && !data ? (
        <ErrorState message={api.error} onRetry={api.retry} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={api.refreshing} onRefresh={api.refresh} colors={[Brand.amberInk]} />}>
          <Text style={styles.intro}>
            Cost per mile is the number a spec sheet can’t give you - real spend divided by the miles you’ve actually done, from your own
            logged history. Mix bikes and cars freely.
          </Text>

          {!data.isPro ? (
            <ProLock feature="Compare vehicles" description="See which of your vehicles actually costs less to run per mile, side by side, from your own logged history." />
          ) : data.vehicles.length < data.min ? (
            <Card style={styles.card}>
              <Text style={styles.body}>You need at least {data.min} vehicles to compare them. Add another one from your garage first.</Text>
            </Card>
          ) : (
            <>
              <Card style={styles.pickCard}>
                <Text style={styles.cardTitle}>
                  Pick {data.min} to {data.max}
                </Text>
                {data.vehicles.map((v, i) => {
                  const on = ticked.includes(v.id);
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => toggle(v.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={({ pressed }) => [styles.pickRow, i > 0 && styles.divider, pressed && { opacity: 0.85 }]}>
                      <View style={[styles.box, on && styles.boxOn]}>{on ? <Icon name="check" size={16} color="#FFFFFF" strokeWidth={3} /> : null}</View>
                      <View style={styles.flex}>
                        <Text style={styles.pickName}>{v.name}</Text>
                        <Text style={styles.pickMeta}>{v.kind === 'bike' ? 'Motorcycle' : 'Car'}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </Card>
              <Pressable
                onPress={() => setCompared(ticked)}
                disabled={!canCompare || api.loading}
                accessibilityRole="button"
                style={({ pressed }) => [styles.primary, (!canCompare || api.loading) && styles.dim, pressed && { opacity: 0.85 }]}>
                <Text style={styles.primaryLabel}>{api.loading ? 'Comparing…' : showingCurrent ? 'Compared' : 'Compare'}</Text>
              </Pressable>
              {data.comparison ? <ComparisonView comparison={data.comparison} /> : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// Each row stacks one line per vehicle, so the numbers stay readable on a
// phone instead of squeezing into a wide table.
function ComparisonView({ comparison }: { comparison: Comparison }) {
  return (
    <View style={styles.results}>
      {comparison.verdict ? (
        <Card style={styles.verdict}>
          <Text style={styles.verdictText}>{comparison.verdict}</Text>
        </Card>
      ) : null}
      <Text style={styles.note}>{comparison.unitNote}</Text>
      {comparison.sections.map((section) => (
        <Card key={section.title} style={styles.card}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            {section.title}
          </Text>
          {section.rows.map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              {row.values.map((value, i) => {
                const winner = row.winnerIndex === i;
                return (
                  <View key={comparison.names[i]} style={styles.valueRow}>
                    <Text style={styles.valueName} numberOfLines={1}>
                      {comparison.names[i]}
                    </Text>
                    <Text style={[styles.value, winner && styles.valueWinner]}>{value}</Text>
                    {winner && row.badge ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{row.badge}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, gap: 12 },
  intro: { fontSize: 15, lineHeight: 22, color: Brand.muted },
  card: { padding: 16, gap: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Brand.ink },
  body: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  pickCard: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  divider: { borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  box: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: Brand.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: Brand.amberInk, borderColor: Brand.amberInk },
  pickName: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  pickMeta: { fontSize: 13, color: Brand.muted },
  primary: { minHeight: 52, borderRadius: 14, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: Brand.asphalt },
  dim: { opacity: 0.5 },
  results: { gap: 12 },
  verdict: { padding: 16, backgroundColor: '#FBEACC', borderColor: '#F1D5A3' },
  verdictText: { fontSize: 16, lineHeight: 23, fontWeight: '600', color: '#7A4508' },
  note: { fontSize: 13, lineHeight: 19, color: Brand.muted },
  row: { gap: 4, paddingTop: 4 },
  rowLabel: { fontSize: 13, fontWeight: '700', color: Brand.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28, flexWrap: 'wrap' },
  valueName: { flex: 1, fontSize: 14, color: Brand.ink, minWidth: 120 },
  value: { fontSize: 15, fontWeight: '600', color: Brand.ink, fontVariant: ['tabular-nums'] },
  valueWinner: { color: Brand.amberInk, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: '#FBEACC' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#7A4508' },
});
