// Buying a used bike or car: the web's BuyingGuideForm / CarBuyingGuideForm.
// Two parts, as there: a registration check (MOT history, tax and an
// AI-written briefing, through the website's own buying-guide lookup,
// with the same free allowance) and a buyer's checklist for the make, size
// and age. The paid vehicle history report isn't offered in the app - v1
// has no purchases.
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ReportAi } from '@/components/report-ai';
import { OptionPicker } from '@/components/option-picker';
import { Card, ErrorState, LoadingState, SectionHeader } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useVehicle, type VehicleKind } from '@/lib/vehicle';

type Option = { value: string; label: string };
type KindOptions = { brands: Option[]; classes: Option[]; ageBands: Option[] };
type BuyingOptions = { bike: KindOptions; car: KindOptions };

type Lookup = {
  make: string;
  model: string;
  fuelType: string;
  colour: string;
  plateInRetention: boolean;
  motDueDate: string | null;
  motTests: { testDate: string; passed: boolean; mileage: number | null; mileageTrusted: boolean; notes: string }[];
  briefing: { motFlags: string[]; modelNotes: string[]; summary: string } | null;
  taxDetails: { taxStatus: string | null; taxDueDate: string | null } | null;
  requiresPayment: boolean;
  nextFreeLookupAt: string | null;
};

type ChecklistResponse = {
  checklist: { emphasis: string; inspectionPoints: string[]; questionsForSeller: string[] };
  addendum: string;
  brandNotes: string[] | null;
  brandLabel: string;
};

// The lists only change with a deploy - one request per app session.
let cachedOptions: BuyingOptions | null = null;

function useBuyingOptions() {
  const [options, setOptions] = useState<BuyingOptions | null>(cachedOptions);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (options || failed) return;
    let cancelled = false;
    apiFetch<BuyingOptions>('/api/app/buying-options?v=1').then((r) => {
      if (cancelled) return;
      if (r.ok) {
        cachedOptions = r.data;
        setOptions(r.data);
      } else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [options, failed]);
  return { options, failed, retry: () => setFailed(false) };
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function BuyingScreen() {
  const { selected } = useVehicle();
  const options = useBuyingOptions();
  const [kind, setKind] = useState<VehicleKind>(selected?.kind ?? 'bike');
  const [foundMake, setFoundMake] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Buying guide
          </Text>
          <Text style={styles.subtitle}>Before you buy a used bike or car</Text>
        </View>
      </View>
      {options.options ? (
        <KeyboardAvoidingView style={styles.flex} behavior="height">
          <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="What are you buying?">
              {(['bike', 'car'] as const).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => {
                    setKind(k);
                    setFoundMake(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: kind === k }}
                  style={[styles.segment, kind === k && styles.segmentOn]}>
                  <Text style={[styles.segmentLabel, kind === k && styles.segmentLabelOn]}>{k === 'bike' ? 'Motorcycle' : 'Car'}</Text>
                </Pressable>
              ))}
            </View>

            <SectionHeader title="Check a registration" />
            <PlateCheck key={`plate-${kind}`} kind={kind} onFound={(l) => setFoundMake(l.make)} />

            <SectionHeader title="Buyer's checklist" />
            <ChecklistCard
              key={`list-${kind}-${foundMake ?? ''}`}
              kind={kind}
              options={options.options[kind]}
              foundMake={foundMake}
              onResult={() => setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50)}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : options.failed ? (
        <ErrorState message="The buying guide couldn’t be loaded." onRetry={options.retry} />
      ) : (
        <LoadingState />
      )}
    </SafeAreaView>
  );
}

function PlateCheck({ kind, onFound }: { kind: VehicleKind; onFound: (lookup: Lookup) => void }) {
  const { token, signOut } = useAuth();
  const [vrm, setVrm] = useState('');
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const noun = kind === 'bike' ? 'bike' : 'car';

  async function check() {
    const cleaned = vrm.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleaned || checking) return;
    setChecking(true);
    setProblem(null);
    setLookup(null);
    const path = kind === 'bike' ? '/api/tracker/buying-guide-lookup' : '/api/cars/buying-guide-lookup';
    const result = await apiFetch<Lookup>(`${path}?vrm=${encodeURIComponent(cleaned)}`, { token });
    setChecking(false);
    if (!result.ok) {
      if (result.status === 401) await signOut();
      else setProblem(result.error);
      return;
    }
    setLookup(result.data);
    if (!result.data.requiresPayment) onFound(result.data);
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.hint}>Its MOT history and tax, with an AI-written briefing on what to check before you buy.</Text>
      <TextInput
        value={vrm}
        onChangeText={(t) => setVrm(t.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={10}
        returnKeyType="search"
        onSubmitEditing={check}
        placeholder="ENTER REG"
        placeholderTextColor="#8C7A2A"
        accessibilityLabel="Registration"
        style={styles.plate}
      />
      <Pressable
        onPress={check}
        disabled={!vrm.trim() || checking}
        accessibilityRole="button"
        accessibilityState={{ disabled: !vrm.trim() || checking, busy: checking }}
        style={({ pressed }) => [styles.primary, (!vrm.trim() || checking) && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.primaryLabel}>{checking ? 'Checking…' : 'Check it'}</Text>
      </Pressable>
      {problem ? (
        <Text style={styles.problem} accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}

      {lookup?.requiresPayment ? (
        <Text style={styles.text}>
          You&apos;ve used your free {noun} check for this period
          {lookup.nextFreeLookupAt ? ` – your next free one is available ${day(lookup.nextFreeLookupAt)}` : ''}.
        </Text>
      ) : lookup ? (
        <View style={styles.found}>
          <Text style={styles.foundTitle}>
            {lookup.make} {lookup.model}
          </Text>
          <Text style={styles.hint}>{[lookup.colour, lookup.fuelType].filter(Boolean).join(' · ')}</Text>
          {lookup.plateInRetention ? (
            <Text style={styles.hint}>This plate isn&apos;t on a vehicle right now – these details are from the last one it was on.</Text>
          ) : null}
          {lookup.taxDetails ? <Row label="Tax" value={lookup.taxDetails.taxStatus ?? 'Unknown'} /> : null}
          <Row label="MOT" value={lookup.motDueDate ? `Due ${day(lookup.motDueDate)}` : 'No MOT due date'} />

          {lookup.briefing ? (
            <View style={styles.briefing}>
              <Text style={styles.briefingTitle}>AI-generated pre-purchase briefing for this {noun}</Text>
              {lookup.briefing.motFlags.length > 0 ? (
                <>
                  <Text style={styles.listTitle}>From this {noun}&apos;s own MOT history</Text>
                  {lookup.briefing.motFlags.map((f, i) => (
                    <Text key={i} style={styles.text}>
                      • {f}
                    </Text>
                  ))}
                </>
              ) : null}
              {lookup.briefing.modelNotes.length > 0 ? (
                <>
                  <Text style={styles.listTitle}>Known for this model</Text>
                  {lookup.briefing.modelNotes.map((n, i) => (
                    <Text key={i} style={styles.text}>
                      • {n}
                    </Text>
                  ))}
                </>
              ) : null}
              <Text style={styles.text}>{lookup.briefing.summary}</Text>
              <ReportAi
                feature="buying"
                text={[...lookup.briefing.motFlags, ...lookup.briefing.modelNotes, lookup.briefing.summary].join('\n')}
              />
            </View>
          ) : null}

          <Text style={styles.listTitle}>MOT history</Text>
          {lookup.motTests.length === 0 ? (
            <Text style={styles.hint}>No MOT test history found for this registration.</Text>
          ) : (
            lookup.motTests.map((t, i) => (
              <View key={i} style={[styles.test, { borderLeftColor: t.passed ? '#1A6B4A' : Brand.danger }]}>
                <Text style={styles.testTitle}>
                  {day(t.testDate)} – {t.passed ? 'Passed' : 'Failed'}
                </Text>
                <Text style={styles.hint}>
                  {t.mileage != null
                    ? `${t.mileage.toLocaleString('en-GB')} miles${t.mileageTrusted ? '' : ' (reading not verified)'}`
                    : 'Mileage not recorded'}
                </Text>
                {t.notes ? <Text style={styles.testNotes}>{t.notes}</Text> : null}
              </View>
            ))
          )}
        </View>
      ) : null}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function ChecklistCard({
  kind,
  options,
  foundMake,
  onResult,
}: {
  kind: VehicleKind;
  options: KindOptions;
  foundMake: string | null;
  onResult: () => void;
}) {
  const { token, signOut } = useAuth();
  // A registration just checked above picks the make here, when it's one
  // of the listed ones.
  const matched = foundMake ? options.brands.find((b) => b.label.toLowerCase() === foundMake.trim().toLowerCase()) : undefined;
  const [brand, setBrand] = useState<string | null>(matched?.value ?? null);
  const [vehicleClass, setVehicleClass] = useState<string | null>(null);
  const [ageBand, setAgeBand] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<ChecklistResponse | null>(null);
  const valid = !!brand && !!vehicleClass && !!ageBand;

  async function build() {
    if (!valid || working) return;
    setWorking(true);
    setProblem(null);
    const response = await apiFetch<ChecklistResponse>(kind === 'bike' ? '/api/buying-guide' : '/api/cars/buying-guide', {
      method: 'POST',
      token,
      body: { [kind === 'bike' ? 'bikeClass' : 'carClass']: vehicleClass, brand, ageBand },
    });
    setWorking(false);
    if (response.ok) {
      setResult(response.data);
      onResult();
    } else if (response.status === 401) await signOut();
    else setProblem(response.error);
  }

  return (
    <Card style={styles.card}>
      <OptionPicker label="Make" placeholder="Choose the make" groups={[{ label: '', options: options.brands }]} value={brand} onChange={setBrand} />
      <OptionPicker
        label={kind === 'bike' ? 'Engine size' : 'Car size'}
        placeholder="Choose the size"
        groups={[{ label: '', options: options.classes }]}
        value={vehicleClass}
        onChange={setVehicleClass}
      />
      <OptionPicker label="How old" placeholder="Choose the age" groups={[{ label: '', options: options.ageBands }]} value={ageBand} onChange={setAgeBand} />
      <Pressable
        onPress={build}
        disabled={!valid || working}
        accessibilityRole="button"
        accessibilityState={{ disabled: !valid || working, busy: working }}
        style={({ pressed }) => [styles.primary, (!valid || working) && styles.disabled, pressed && styles.pressed]}>
        <Text style={styles.primaryLabel}>{working ? 'Putting it together…' : 'Get the checklist'}</Text>
      </Pressable>
      {problem ? (
        <Text style={styles.problem} accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}

      {result ? (
        <View style={styles.found}>
          <Text style={styles.emphasis}>{result.checklist.emphasis}</Text>
          <Text style={styles.listTitle}>What to check</Text>
          {result.checklist.inspectionPoints.map((p) => (
            <Text key={p} style={styles.text}>
              • {p}
            </Text>
          ))}
          <Text style={styles.listTitle}>Questions to ask the seller</Text>
          {result.checklist.questionsForSeller.map((q) => (
            <Text key={q} style={styles.text}>
              • {q}
            </Text>
          ))}
          {result.addendum ? <Text style={styles.hint}>{result.addendum}</Text> : null}
          {result.brandNotes && result.brandNotes.length > 0 ? (
            <>
              <Text style={styles.listTitle}>Specific to {result.brandLabel}</Text>
              {result.brandNotes.map((n) => (
                <Text key={n} style={styles.text}>
                  • {n}
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
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 10 },
  segments: { flexDirection: 'row', gap: 8 },
  segment: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: { backgroundColor: Brand.asphalt, borderColor: Brand.asphalt },
  segmentLabel: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  segmentLabelOn: { color: '#FFFFFF' },
  card: { padding: 16, gap: 12 },
  hint: { fontSize: 13, lineHeight: 19, color: Brand.muted },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  problem: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  // A UK number plate: yellow, black, bold.
  plate: {
    height: 64,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Brand.asphalt,
    backgroundColor: '#F7D117',
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#111111',
  },
  primary: { minHeight: 52, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: Brand.asphalt },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  found: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  foundTitle: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  row: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 36, alignItems: 'center' },
  rowLabel: { fontSize: 15, color: Brand.muted },
  rowValue: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  briefing: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: '#FBF4E8' },
  briefingTitle: { fontSize: 15, fontWeight: '700', color: '#7A4508' },
  listTitle: { fontSize: 15, fontWeight: '700', color: Brand.ink, marginTop: 6 },
  test: { borderLeftWidth: 3, paddingLeft: 10, gap: 2 },
  testTitle: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  testNotes: { fontSize: 14, lineHeight: 20, color: Brand.ink },
  emphasis: { fontSize: 15, lineHeight: 22, fontWeight: '600', color: Brand.ink },
});
