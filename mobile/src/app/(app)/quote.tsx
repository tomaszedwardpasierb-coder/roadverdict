// Check a quote, for the selected vehicle: the web's QuoteForm /
// CarQuoteForm, starting from that bike or car (make, size and region, as
// the web forms start for a signed-in owner). The check goes to the
// website's own /api/verdict or /api/cars/verdict, and the verdict reads
// as it does on the web. The web's affiliate parts line isn't shown in the
// apps, so their store listings carry no ads.
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { OptionPicker } from '@/components/option-picker';
import { Card, ErrorState, LoadingState, MissingHint } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { KEYBOARD_DONE_ID } from '@/components/keyboard-done';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { parseNumber } from '@/lib/mileage';
import { useToolsScreen, type ToolsScreen, type Verdict } from '@/lib/tools';
import type { GarageVehicle } from '@/lib/vehicle';

type VerdictResponse = {
  verdict: Verdict;
  range: { low: number; high: number };
  brandLabel: string;
  regionLabel: string;
  communityStats: { sampleSize: number; low: number; high: number } | null;
  advice: { explanation: string; questionsToAsk: string[] } | null;
};

const MAX_QUOTE = 5000;

export default function QuoteScreen() {
  const { selected, screen } = useToolsScreen();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Quote checker
          </Text>
          {selected ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {selected.name}
            </Text>
          ) : null}
        </View>
      </View>
      {selected && screen.data ? (
        <QuoteForm vehicle={selected} data={screen.data} />
      ) : screen.error ? (
        <ErrorState message={screen.error} onRetry={screen.retry} />
      ) : (
        <LoadingState />
      )}
    </SafeAreaView>
  );
}

function QuoteForm({ vehicle, data }: { vehicle: GarageVehicle; data: ToolsScreen }) {
  const { token, signOut } = useAuth();
  const scroll = useRef<ScrollView>(null);
  const [job, setJob] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [brand, setBrand] = useState(data.defaults.brand);
  const [vehicleClass, setVehicleClass] = useState(data.defaults.vehicleClass);
  const [region, setRegion] = useState(data.defaults.region);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<{ verdict: VerdictResponse; quoted: number; job: string } | null>(null);
  const bike = data.kind === 'bike';

  const priceN = parseNumber(price);
  const valid = !!job && priceN > 0 && priceN <= MAX_QUOTE;

  async function check() {
    if (!valid || !job || checking) return;
    setChecking(true);
    setProblem(null);
    const response = await apiFetch<VerdictResponse>(bike ? '/api/verdict' : '/api/cars/verdict', {
      method: 'POST',
      token,
      body: { [bike ? 'bikeClass' : 'carClass']: vehicleClass, brand, region, jobType: job, quotedPrice: priceN },
    });
    setChecking(false);
    if (response.ok) {
      setResult({ verdict: response.data, quoted: priceN, job });
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    if (response.status === 401) {
      await signOut();
      return;
    }
    setProblem(response.error);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="height">
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {result ? <VerdictCard data={data} result={result} /> : null}

        <OptionPicker label="What needs doing" placeholder="Choose the job" groups={[{ label: '', options: data.options.jobs }]} value={job} onChange={setJob} />
        <View style={styles.field}>
          <Text style={styles.label} nativeID="price-label">
            What you were quoted (£)
          </Text>
          <TextInput
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            inputAccessoryViewID={KEYBOARD_DONE_ID}
            placeholder="e.g. 180"
            placeholderTextColor="#A7A49C"
            accessibilityLabelledBy="price-label"
            style={styles.input}
          />
          {priceN > MAX_QUOTE ? <Text style={styles.problem}>The quote checker goes up to £{MAX_QUOTE.toLocaleString('en-GB')}.</Text> : null}
        </View>

        <Text style={styles.hint}>These start from your {vehicle.name} – change anything that&apos;s different about this quote.</Text>
        <OptionPicker label="Make" placeholder="Choose the make" groups={[{ label: '', options: data.options.brands }]} value={brand} onChange={setBrand} />
        <OptionPicker
          label={bike ? 'Engine size' : 'Size of car'}
          placeholder="Choose the size"
          groups={[{ label: '', options: data.options.classes }]}
          value={vehicleClass}
          onChange={setVehicleClass}
        />
        <OptionPicker
          label="Where the work is being done"
          placeholder="Choose the region"
          groups={[{ label: '', options: data.options.regions }]}
          value={region}
          onChange={setRegion}
        />
      </ScrollView>

      <View style={styles.footer}>
        {problem ? (
          <Text style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}
        <MissingHint verb="check it" missing={[!job && 'choose the job', !(priceN > 0) && 'enter what you were quoted']} />
        <Pressable
          onPress={check}
          disabled={!valid || checking}
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid || checking, busy: checking }}
          style={({ pressed }) => [styles.primary, (!valid || checking) && styles.disabled, pressed && valid && styles.pressed]}>
          <Text style={styles.primaryLabel}>{checking ? 'Checking…' : result ? 'Check again' : 'Check my quote'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const STAMP: Record<Verdict, { tint: string; ink: string }> = {
  fair: { tint: '#DEEFE6', ink: '#1A6B4A' },
  high: { tint: '#FBEACC', ink: '#7A4508' },
  'second-opinion': { tint: '#F8E6E3', ink: Brand.danger },
};

function VerdictCard({ data, result }: { data: ToolsScreen; result: { verdict: VerdictResponse; quoted: number; job: string } }) {
  const { verdict, range, brandLabel, regionLabel, communityStats, advice } = result.verdict;
  const words = data.verdicts[verdict];
  const look = STAMP[verdict];
  const who = data.kind === 'bike' ? 'riders' : 'drivers';

  return (
    <Card style={styles.card}>
      <View style={[styles.stamp, { backgroundColor: look.tint }]} accessible accessibilityLabel={`Verdict: ${words.label}. Typical £${range.low} to £${range.high}`}>
        <Text style={[styles.stampWord, { color: look.ink }]}>{words.label}</Text>
        <Text style={[styles.stampRange, { color: look.ink }]}>
          typical £{range.low}–£{range.high}
        </Text>
      </View>
      <Text style={styles.text}>
        You were quoted £{result.quoted.toFixed(0)}. {words.summary}
      </Text>
      <Text style={styles.hint}>
        Adjusted for {brandLabel} · {regionLabel}
      </Text>
      {communityStats ? (
        <Text style={styles.hint}>
          {communityStats.sampleSize} {who} on RoadVerdict reported quotes for this job on a similar {data.kind === 'bike' ? 'bike' : 'car'} between £
          {communityStats.low}–£{communityStats.high} recently. Self-reported, not used to calculate the verdict above.
        </Text>
      ) : null}
      {advice ? (
        <View style={styles.advice}>
          <Text style={styles.adviceTitle}>Why this looks the way it does</Text>
          <Text style={styles.text}>{advice.explanation}</Text>
          {advice.questionsToAsk.length > 0 ? (
            <>
              <Text style={styles.adviceTitle}>Worth asking the garage</Text>
              {advice.questionsToAsk.map((q, i) => (
                <Text key={i} style={styles.text}>
                  • {q}
                </Text>
              ))}
            </>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  content: { padding: 20, paddingTop: 12, gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    fontSize: 20,
    color: Brand.ink,
  },
  hint: { fontSize: 13, lineHeight: 19, color: Brand.muted },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  problem: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  card: { padding: 16, gap: 10 },
  stamp: { borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, gap: 2 },
  stampWord: { fontSize: 26, fontWeight: '800' },
  stampRange: { fontSize: 15, fontWeight: '600' },
  advice: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  adviceTitle: { fontSize: 15, fontWeight: '700', color: Brand.ink, marginTop: 4 },
  footer: { gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Brand.line, backgroundColor: Brand.paper },
  primary: { height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
