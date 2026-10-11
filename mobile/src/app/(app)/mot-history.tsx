// MOT history for the selected vehicle: whether the MOT is valid, the
// RoadVerdict MOT score with its reasons, and every test with each
// advisory and failure explained in plain English - and a typical cost
// where our price tables cover the job. The same as the website's free
// MOT check, worked out on the server (/api/app/mot-history); this screen
// only renders it. Read-only.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Card, ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { useApi } from '@/lib/use-api';
import { useVehicle } from '@/lib/vehicle';

type Severity = 'dangerous' | 'failed' | 'minor' | 'advisory' | 'fixed' | 'note';

type Defect = {
  text: string;
  severity: Severity;
  severityLabel: string;
  categoryName: string;
  explanation: string;
  cost: { line: string; guideUrl: string; quoteUrl: string } | null;
};

type MotTest = { date: string; dateLabel: string; passed: boolean; mileage: number | null; defects: Defect[] };

type MotView = {
  registration: string;
  status: { tone: 'ok' | 'bad' | 'unknown'; text: string };
  score: { value: number; label: string; reasons: { text: string; points: number }[] } | null;
  tests: MotTest[];
  disclaimer: string;
};

type Response = { status: 'found'; view: MotView } | { status: 'not_found' | 'no_registration' | 'unavailable' };

const SERIOUS: Severity[] = ['dangerous', 'failed'];

function miles(n: number): string {
  return `${n.toLocaleString('en-GB')} mi`;
}

export default function MotHistoryScreen() {
  const { selected } = useVehicle();
  const data = useApi<Response>(selected ? `/api/app/mot-history?kind=${selected.kind}&id=${encodeURIComponent(selected.id)}` : null);
  if (!selected) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            MOT history
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {[selected.name, selected.registration].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      {data.loading && !data.data ? (
        <LoadingState />
      ) : data.error && !data.data ? (
        <ErrorState message={data.error} onRetry={data.retry} />
      ) : data.data && data.data.status !== 'found' ? (
        <View style={styles.pad}>
          <Card style={styles.card}>
            <Text style={styles.text}>
              {data.data.status === 'not_found'
                ? 'No MOT record was found for this registration. A vehicle under three years old won’t have had an MOT yet.'
                : data.data.status === 'no_registration'
                  ? 'This vehicle has no registration saved, so its MOT history can’t be looked up.'
                  : 'MOT history isn’t available right now. Please try again in a few minutes.'}
            </Text>
          </Card>
        </View>
      ) : data.data?.status === 'found' ? (
        <ScrollView contentContainerStyle={styles.pad} refreshControl={<RefreshControl refreshing={data.loading} onRefresh={data.retry} />}>
          <Found view={data.data.view} />
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function Found({ view }: { view: MotView }) {
  return (
    <>
      <Card style={styles.card}>
        <View style={styles.statusRow}>
          {view.status.tone === 'ok' ? <Icon name="check" size={22} color="#1A6B4A" strokeWidth={2.6} /> : null}
          <Text style={[styles.status, view.status.tone === 'bad' && styles.statusBad]}>{view.status.text}</Text>
        </View>
      </Card>

      {view.score ? (
        <Card style={styles.card}>
          <Text style={styles.section}>RoadVerdict MOT score</Text>
          <View style={styles.scoreRow}>
            <Text style={styles.score} accessibilityLabel={`${view.score.value} out of 100`}>
              {view.score.value}
            </Text>
            <View style={styles.flex}>
              <Text style={styles.scoreOutOf}>out of 100</Text>
              <Text style={styles.scoreLabel}>{view.score.label}</Text>
            </View>
          </View>
          {view.score.reasons.map((r) => (
            <View key={r.text} style={styles.reason}>
              <Text style={[styles.reasonPoints, r.points < 0 && styles.reasonMinus]}>{r.points < 0 ? `${r.points}` : '✓'}</Text>
              <Text style={[styles.text, styles.flex]}>{r.text}</Text>
            </View>
          ))}
          <Text style={styles.note}>A summary of the MOT record, not a prediction of future repairs.</Text>
        </Card>
      ) : null}

      <Text style={styles.sectionOutside}>Every MOT test ({view.tests.length})</Text>
      {view.tests.map((t) => (
        <Card key={t.date} style={styles.card}>
          <View style={styles.testHead}>
            <View style={styles.flex}>
              <Text style={styles.testDate}>{t.dateLabel}</Text>
              {t.mileage !== null ? <Text style={styles.note}>{miles(t.mileage)}</Text> : null}
            </View>
            <View style={[styles.pill, t.passed ? styles.pillPass : styles.pillFail]}>
              <Text style={[styles.pillText, !t.passed && styles.pillTextFail]}>{t.passed ? 'Pass' : 'Fail'}</Text>
            </View>
          </View>
          {t.defects.length === 0 ? (
            <Text style={styles.note}>No defects or advisories recorded.</Text>
          ) : (
            t.defects.map((d, i) => (
              <View key={`${d.text}-${i}`} style={styles.defect}>
                <Text style={[styles.severity, SERIOUS.includes(d.severity) && styles.severitySerious]}>{d.severityLabel}</Text>
                <Text style={styles.defectText}>{d.text}</Text>
                <Text style={styles.note}>
                  <Text style={styles.noteStrong}>{d.categoryName}. </Text>
                  {d.explanation}
                </Text>
                {d.cost ? (
                  <View style={styles.costRow}>
                    <Text style={styles.cost}>{d.cost.line}</Text>
                    <Pressable onPress={() => WebBrowser.openBrowserAsync(d.cost!.guideUrl)} accessibilityRole="link" hitSlop={6}>
                      <Text style={styles.link}>See the price guide</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))
          )}
        </Card>
      ))}

      <Text style={styles.disclaimer}>{view.disclaimer}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  pad: { padding: 20, paddingTop: 8, paddingBottom: 40, gap: 12 },
  card: { padding: 16, gap: 10 },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  note: { fontSize: 13, lineHeight: 19, color: Brand.muted },
  noteStrong: { fontWeight: '700', color: Brand.ink },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: Brand.muted },
  sectionOutside: { fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: Brand.muted, marginTop: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { flex: 1, fontSize: 18, fontWeight: '800', color: Brand.ink },
  statusBad: { color: Brand.danger },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  score: { fontSize: 48, fontWeight: '800', color: Brand.ink, fontVariant: ['tabular-nums'] },
  scoreOutOf: { fontSize: 13, color: Brand.muted },
  scoreLabel: { fontSize: 17, fontWeight: '700', color: Brand.amberInk },
  reason: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  reasonPoints: { width: 34, fontSize: 15, fontWeight: '800', color: Brand.ink, fontVariant: ['tabular-nums'] },
  reasonMinus: { color: Brand.danger },
  testHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  testDate: { fontSize: 17, fontWeight: '700', color: Brand.ink },
  pill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999, borderWidth: 1.5 },
  pillPass: { borderColor: Brand.ink },
  pillFail: { borderColor: Brand.danger, backgroundColor: '#FBECEB' },
  pillText: { fontSize: 14, fontWeight: '800', color: Brand.ink },
  pillTextFail: { color: Brand.danger },
  defect: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: Brand.line },
  severity: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: Brand.amberInk },
  severitySerious: { color: Brand.danger },
  defectText: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: Brand.ink },
  costRow: { gap: 2, marginTop: 2 },
  cost: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: Brand.ink },
  link: { fontSize: 14, fontWeight: '700', color: Brand.amberInk, textDecorationLine: 'underline' },
  disclaimer: { fontSize: 12, lineHeight: 17, color: Brand.muted, marginTop: 8 },
});
