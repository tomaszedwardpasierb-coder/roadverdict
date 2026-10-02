// What it costs to run the selected vehicle for a year: the web's
// CostCalculatorForm / CarCostCalculatorForm, starting from that bike or
// car, through the website's own /api/cost-calculator or
// /api/cars/cost-calculator, with the result laid out as the web's
// "True annual cost" breakdown.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { OptionPicker } from '@/components/option-picker';
import { Card, ErrorState, LoadingState, MissingHint } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { parseMileage, parseNumber } from '@/lib/mileage';
import { useToolsScreen, type ToolsScreen } from '@/lib/tools';
import type { GarageVehicle } from '@/lib/vehicle';

type Breakdown = { servicing: number; tyres: number; mot: number; tax: number; fuel: number; total: number };

type CostResponse = {
  breakdown: Breakdown;
  brandLabel: string;
  regionLabel: string;
  advice: { explanation: string; watchOutFor: string[] } | null;
};

// The calculator's own ceiling, in miles.
const MAX_MILES = 30000;

const LINES: { key: keyof Breakdown; label: string }[] = [
  { key: 'servicing', label: 'Servicing' },
  { key: 'tyres', label: 'Tyres' },
  { key: 'mot', label: 'MOT' },
  { key: 'tax', label: 'Road tax (VED)' },
  { key: 'fuel', label: 'Fuel' },
];

export default function CostsScreen() {
  const { selected, screen } = useToolsScreen();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Cost calculator
          </Text>
          {selected ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {selected.name}
            </Text>
          ) : null}
        </View>
      </View>
      {selected && screen.data ? (
        <CostForm vehicle={selected} data={screen.data} />
      ) : screen.error ? (
        <ErrorState message={screen.error} onRetry={screen.retry} />
      ) : (
        <LoadingState />
      )}
    </SafeAreaView>
  );
}

function CostForm({ vehicle, data }: { vehicle: GarageVehicle; data: ToolsScreen }) {
  const { token, signOut } = useAuth();
  const scroll = useRef<ScrollView>(null);
  const bike = data.kind === 'bike';
  const km = vehicle.units.distanceUnit === 'km';
  const [distance, setDistance] = useState('');
  const [brand, setBrand] = useState(data.defaults.brand);
  const [vehicleClass, setVehicleClass] = useState(data.defaults.vehicleClass);
  const [region, setRegion] = useState(data.defaults.region);
  const [fuel, setFuel] = useState(data.defaults.fuel ?? 'petrol');
  const [co2, setCo2] = useState('');
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<CostResponse | null>(null);

  // Entered in the vehicle's own unit; the calculator works in miles.
  const typed = parseMileage(distance);
  const miles = km ? typed / vehicle.units.kmPerMile : typed;
  const co2N = co2.trim() === '' ? undefined : parseNumber(co2);
  const tooFar = miles > MAX_MILES;
  const badCo2 = co2N !== undefined && !(co2N >= 0 && co2N <= 999);
  const valid = typed > 0 && !tooFar && !badCo2;

  async function calculate() {
    if (!valid || working) return;
    setWorking(true);
    setProblem(null);
    const annualMileage = Math.round(miles);
    const response = await apiFetch<CostResponse>(bike ? '/api/cost-calculator' : '/api/cars/cost-calculator', {
      method: 'POST',
      token,
      body: bike
        ? { bikeClass: vehicleClass, brand, region, annualMileage }
        : { carClass: vehicleClass, brand, region, fuelType: fuel, annualMileage, ...(co2N !== undefined ? { co2Gkm: co2N } : {}) },
    });
    setWorking(false);
    if (response.ok) {
      setResult(response.data);
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
        {result ? <CostCard kind={data.kind} result={result} /> : null}

        {!bike && data.electric ? (
          <Card style={[styles.card, styles.notice]}>
            <Text style={styles.noticeText}>
              Fully electric cars aren&apos;t covered yet - there isn&apos;t enough sourced UK running-cost data. The figures below are for a
              similar-sized petrol, diesel or hybrid car instead.
            </Text>
          </Card>
        ) : null}

        <View style={styles.field}>
          <Text style={styles.label} nativeID="distance-label">
            {km ? 'Kilometres a year' : 'Miles a year'}
          </Text>
          <TextInput
            value={distance}
            onChangeText={setDistance}
            keyboardType="number-pad"
            placeholder={bike ? (km ? 'e.g. 6,000' : 'e.g. 4,000') : km ? 'e.g. 11,000' : 'e.g. 7,000'}
            placeholderTextColor="#A7A49C"
            accessibilityLabelledBy="distance-label"
            style={styles.input}
          />
          {tooFar ? (
            <Text style={styles.problem}>
              The calculator goes up to {km ? `${Math.round(MAX_MILES * vehicle.units.kmPerMile).toLocaleString('en-GB')} km` : `${MAX_MILES.toLocaleString('en-GB')} miles`} a year.
            </Text>
          ) : null}
        </View>

        <Text style={styles.hint}>These start from your {vehicle.name} - change anything that&apos;s different.</Text>
        <OptionPicker label="Make" placeholder="Choose the make" groups={[{ label: '', options: data.options.brands }]} value={brand} onChange={setBrand} />
        <OptionPicker
          label={bike ? 'Engine size' : 'Size of car'}
          placeholder="Choose the size"
          groups={[{ label: '', options: data.options.classes }]}
          value={vehicleClass}
          onChange={setVehicleClass}
        />
        {!bike ? (
          <OptionPicker label="Fuel" placeholder="Choose the fuel" groups={[{ label: '', options: data.options.fuels }]} value={fuel} onChange={setFuel} />
        ) : null}
        <OptionPicker label="Where you keep and run it" placeholder="Choose the region" groups={[{ label: '', options: data.options.regions }]} value={region} onChange={setRegion} />
        {!bike ? (
          <View style={styles.field}>
            <Text style={styles.label} nativeID="co2-label">
              CO2 emissions, g/km (optional, for road tax)
            </Text>
            <TextInput
              value={co2}
              onChangeText={setCo2}
              keyboardType="number-pad"
              placeholder="e.g. 120"
              placeholderTextColor="#A7A49C"
              accessibilityLabelledBy="co2-label"
              style={styles.input}
            />
            {badCo2 ? <Text style={styles.problem}>Enter a CO2 figure between 0 and 999 g/km, or leave it blank.</Text> : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {problem ? (
          <Text style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}
        <MissingHint verb="work it out" missing={[!(typed > 0) && 'enter your miles a year']} />
        <Pressable
          onPress={calculate}
          disabled={!valid || working}
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid || working, busy: working }}
          style={({ pressed }) => [styles.primary, (!valid || working) && styles.disabled, pressed && valid && styles.pressed]}>
          <Text style={styles.primaryLabel}>{working ? 'Working it out…' : result ? 'Work it out again' : 'Work out my costs'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function CostCard({ kind, result }: { kind: 'bike' | 'car'; result: CostResponse }) {
  const { breakdown, brandLabel, regionLabel, advice } = result;
  const insuranceSearch = `https://www.google.com/search?q=${kind === 'bike' ? 'motorcycle' : 'car'}+insurance+quotes+UK`;

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>True annual cost</Text>
      <View>
        {LINES.map(({ key, label }) => (
          <View key={key} style={styles.line} accessible accessibilityLabel={`${label}: £${breakdown[key]}`}>
            <Text style={styles.lineLabel}>{label}</Text>
            <Text style={styles.lineValue}>£{breakdown[key].toLocaleString('en-GB')}</Text>
          </View>
        ))}
        <View style={styles.line}>
          <Text style={styles.lineLabel}>Insurance</Text>
          <Text style={styles.lineMuted}>not included</Text>
        </View>
        <View style={[styles.line, styles.totalLine]} accessible accessibilityLabel={`Total, excluding insurance: £${breakdown.total}`}>
          <Text style={styles.totalLabel}>Total (excl. insurance)</Text>
          <Text style={styles.totalValue}>£{breakdown.total.toLocaleString('en-GB')}</Text>
        </View>
      </View>
      <Text style={styles.hint}>
        Adjusted for {brandLabel} · {regionLabel}
      </Text>
      <Text style={styles.hint}>
        Insurance isn&apos;t included on purpose – it depends on you (age, licence, no-claims, postcode), not just the {kind === 'bike' ? 'bike' : 'car'}, so
        a generic estimate would be more misleading than useful.{' '}
        <Text style={styles.link} onPress={() => WebBrowser.openBrowserAsync(insuranceSearch)} accessibilityRole="link">
          Compare insurance quotes
        </Text>
      </Text>
      {advice ? (
        <View style={styles.advice}>
          <Text style={styles.adviceTitle}>Where this actually goes</Text>
          <Text style={styles.text}>{advice.explanation}</Text>
          {advice.watchOutFor.length > 0 ? (
            <>
              <Text style={styles.adviceTitle}>Worth knowing</Text>
              {advice.watchOutFor.map((w, i) => (
                <Text key={i} style={styles.text}>
                  • {w}
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
  cardTitle: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40, borderBottomWidth: 1, borderBottomColor: '#EDEAE3' },
  lineLabel: { fontSize: 15, color: Brand.ink },
  lineValue: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  lineMuted: { fontSize: 15, color: Brand.muted },
  totalLine: { borderBottomWidth: 0, minHeight: 48 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: Brand.ink },
  totalValue: { fontSize: 22, fontWeight: '800', color: Brand.ink },
  link: { color: Brand.amberInk, fontWeight: '700' },
  notice: { backgroundColor: '#FBEACC', borderColor: '#F1D5A3' },
  noticeText: { fontSize: 14, lineHeight: 20, color: '#7A4508' },
  advice: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  adviceTitle: { fontSize: 15, fontWeight: '700', color: Brand.ink, marginTop: 4 },
  footer: { gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Brand.line, backgroundColor: Brand.paper },
  primary: { height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
