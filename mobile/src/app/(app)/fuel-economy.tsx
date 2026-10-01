// Fuel economy: the website Fuel tab's card for the selected vehicle - the
// owner's real average from their own full tanks, their last full tank and
// what a mile costs at their last fill-up's price - and the MPG
// calculator, started from that same tank, for a trip they didn't log or
// a what-if. Nothing here is saved; logging fuel stays where it is.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Card, ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import {
  convertDistance,
  economyFromMpg,
  formatEconomy,
  fuelCostPerDistance,
  parseNumber,
  tankEconomy,
  type EconomyUnit,
} from '@/lib/fuel-economy';
import { useApi } from '@/lib/use-api';
import { useVehicle, type GarageVehicle } from '@/lib/vehicle';

type Summary = {
  averageMpg: number | null;
  trustedTanks: number;
  lastTank: { miles: number; litres: number; mpg: number; date: string } | null;
  lastPrice: { perLitre: number; date: string } | null;
};

type FuelEconomy = {
  electric: boolean;
  summary: Summary;
  officialMpg: number | null;
  fuelEconomyUnit: EconomyUnit;
  distanceUnit: 'mi' | 'km';
  currency: string;
  preferredFuel: 'petrol' | 'diesel';
};

type UkPrices = Record<'petrol' | 'diesel', { pencePerLitre: number; weekCommencing: string }> & { source: string };

function shortDate(day: string): string {
  return new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function rounded(value: number, places: number): string {
  return String(Math.round(value * 10 ** places) / 10 ** places);
}

export default function FuelEconomyScreen() {
  const { selected } = useVehicle();
  const data = useApi<FuelEconomy>(selected ? `/api/app/fuel-economy?kind=${selected.kind}&id=${encodeURIComponent(selected.id)}` : null);
  if (!selected) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Fuel economy
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
      ) : data.data?.electric ? (
        <View style={styles.pad}>
          <Card style={styles.card}>
            <Text style={styles.text}>MPG doesn’t apply to a fully electric car - your charging costs are in your logbook and Reports.</Text>
          </Card>
        </View>
      ) : data.data ? (
        <Body vehicle={selected} data={data.data} />
      ) : null}
    </SafeAreaView>
  );
}

function Body({ vehicle, data }: { vehicle: GarageVehicle; data: FuelEconomy }) {
  const { summary } = data;
  const noun = vehicle.kind === 'bike' ? 'bike' : 'car';
  const symbol = vehicle.units.currencySymbol;
  const inPence = data.currency === 'GBP';
  const unit = data.fuelEconomyUnit;

  const typical = summary.averageMpg ?? summary.lastTank?.mpg ?? null;
  const perDistance = typical && summary.lastPrice ? fuelCostPerDistance(summary.lastPrice.perLitre, economyFromMpg(typical), unit) : null;
  const money = (v: number, perMile: boolean) => (perMile && inPence ? `${(v * 100).toFixed(1)}p` : `${symbol}${v.toFixed(2)}`);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="height">
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        {summary.averageMpg !== null ? (
          <View style={styles.stats}>
            <Stat label="Your average" value={formatEconomy(summary.averageMpg, unit)} note={`from ${summary.trustedTanks} full tank${summary.trustedTanks === 1 ? '' : 's'}`} />
            {summary.lastTank ? (
              <Stat
                label="Last full tank"
                value={formatEconomy(summary.lastTank.mpg, unit)}
                note={`${Math.round(data.distanceUnit === 'km' ? summary.lastTank.miles * 1.60934 : summary.lastTank.miles).toLocaleString('en-GB')} ${data.distanceUnit} on ${summary.lastTank.litres.toFixed(1)} L · ${shortDate(summary.lastTank.date)}`}
              />
            ) : null}
            {perDistance !== null && summary.lastPrice ? (
              <Stat
                label={unit === 'mpg' ? 'Fuel per mile' : 'Fuel per 100 km'}
                value={money(perDistance, unit === 'mpg')}
                note={`at ${inPence ? `${(summary.lastPrice.perLitre * 100).toFixed(1)}p` : `${symbol}${summary.lastPrice.perLitre.toFixed(3)}`} a litre, your last fill-up`}
              />
            ) : null}
          </View>
        ) : (
          <Card style={styles.card}>
            <Text style={styles.text}>
              Log two full-tank fill-ups in a row and your {noun}’s real average shows here - from what actually went in the tank, not the
              manufacturer’s claim.
            </Text>
          </Card>
        )}
        {summary.averageMpg !== null && data.officialMpg ? (
          <Text style={styles.note}>
            The official combined figure for this exact {noun} is {formatEconomy(data.officialMpg, unit)}. Yours is real-world, on your own roads.
          </Text>
        ) : null}

        <Text style={styles.section}>Work out a tank</Text>
        <Text style={styles.note}>A trip you didn’t log, or a what-if - nothing here is saved.</Text>
        <Calculator data={data} symbol={symbol} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statNote}>{note}</Text>
    </View>
  );
}

function Calculator({ data, symbol }: { data: FuelEconomy; symbol: string }) {
  const inPence = data.currency === 'GBP';
  const tank = data.summary.lastTank;
  const ownPrice = data.summary.lastPrice;
  const [unit, setUnit] = useState<EconomyUnit>(data.fuelEconomyUnit);
  const [distance, setDistance] = useState(tank ? rounded(convertDistance(tank.miles, 'mpg', data.fuelEconomyUnit), 1) : '');
  const [litres, setLitres] = useState(tank ? rounded(tank.litres, 2) : '');
  const [price, setPrice] = useState(ownPrice ? rounded(inPence ? ownPrice.perLitre * 100 : ownPrice.perLitre, inPence ? 1 : 3) : '');
  const [priceNote, setPriceNote] = useState<string | null>(ownPrice ? `Your last fill-up, ${shortDate(ownPrice.date)}.` : null);
  const [uk, setUk] = useState<UkPrices | null>(null);

  // This week's UK averages - pounds and pence, so only for a GBP owner.
  useEffect(() => {
    if (!inPence) return;
    apiFetch<UkPrices>('/api/fuel-price').then((r) => {
      if (!r.ok) return;
      setUk(r.data);
      if (!ownPrice) {
        setPrice((p) => p || rounded(r.data[data.preferredFuel].pencePerLitre, 1));
        setPriceNote((n) => n ?? `UK average ${data.preferredFuel} price this week (DESNZ).`);
      }
    });
  }, [inPence, ownPrice, data.preferredFuel]);

  function switchUnit(next: EconomyUnit) {
    if (next === unit) return;
    const d = parseNumber(distance);
    if (Number.isFinite(d)) setDistance(rounded(convertDistance(d, unit, next), 1));
    setUnit(next);
  }

  const miles = unit === 'mpg';
  const economy = tankEconomy(parseNumber(distance), unit, parseNumber(litres));
  const priceValue = parseNumber(price);
  const perLitre = Number.isFinite(priceValue) && priceValue > 0 ? (inPence ? priceValue / 100 : priceValue) : null;
  const perDistance = economy && perLitre ? fuelCostPerDistance(perLitre, economy, unit) : null;

  return (
    <Card style={styles.card}>
      <View style={styles.toggle} accessibilityRole="radiogroup">
        {(['mpg', 'l100km'] as const).map((u) => (
          <Pressable
            key={u}
            onPress={() => switchUnit(u)}
            accessibilityRole="radio"
            accessibilityState={{ selected: unit === u }}
            style={[styles.toggleOption, unit === u && styles.toggleOn]}>
            <Text style={[styles.toggleLabel, unit === u && styles.toggleLabelOn]}>{u === 'mpg' ? 'MPG (UK)' : 'L/100km'}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.fields}>
        <Field label={miles ? 'Miles driven' : 'Kilometres driven'} value={distance} onChange={setDistance} suffix={miles ? 'mi' : 'km'} placeholder={miles ? '312' : '502'} />
        <Field label="Litres used" value={litres} onChange={setLitres} suffix="L" placeholder="34.6" />
      </View>
      <Field
        label={inPence ? 'Price per litre (pence)' : `Price per litre (${symbol})`}
        value={price}
        onChange={(t) => {
          setPrice(t);
          setPriceNote(null);
        }}
        suffix={inPence ? 'p' : symbol}
        placeholder={inPence ? '145.9' : '1.75'}
      />
      {uk ? (
        <View style={styles.chips}>
          {(['petrol', 'diesel'] as const).map((f) => (
            <Pressable
              key={f}
              onPress={() => {
                setPrice(rounded(uk[f].pencePerLitre, 1));
                setPriceNote(`UK average ${f} price this week (DESNZ).`);
              }}
              accessibilityRole="button"
              style={styles.chip}>
              <Text style={styles.chipLabel}>
                UK {f} {rounded(uk[f].pencePerLitre, 1)}p
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {priceNote ? <Text style={styles.note}>{priceNote}</Text> : null}

      <View style={styles.result} accessibilityLiveRegion="polite">
        {economy ? (
          <>
            <Text style={styles.big}>
              {(miles ? economy.mpg : economy.l100km).toFixed(1)}
              <Text style={styles.bigUnit}> {miles ? 'mpg' : 'L/100km'}</Text>
            </Text>
            <Text style={styles.note}>
              {miles ? `${economy.l100km.toFixed(1)} L/100km` : `${economy.mpg.toFixed(1)} mpg (UK)`} · {economy.usMpg.toFixed(1)} US mpg
            </Text>
            {perDistance !== null && perLitre !== null ? (
              <View style={styles.lines}>
                <View style={styles.line}>
                  <Text style={styles.lineLabel}>{miles ? 'Fuel per mile' : 'Fuel per 100 km'}</Text>
                  <Text style={styles.lineValue}>{miles && inPence ? `${(perDistance * 100).toFixed(1)}p` : `${symbol}${perDistance.toFixed(2)}`}</Text>
                </View>
                <View style={styles.line}>
                  <Text style={styles.lineLabel}>This tank cost</Text>
                  <Text style={styles.lineValue}>{`${symbol}${(perLitre * parseNumber(litres)).toFixed(2)}`}</Text>
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.note}>Enter the {miles ? 'miles' : 'kilometres'} and the litres to see your {miles ? 'MPG' : 'L/100km'}.</Text>
        )}
      </View>
      <Text style={styles.note}>For a true figure: fill to the brim and reset the trip, drive as normal, then brim it again.</Text>
    </Card>
  );
}

function Field({ label, value, onChange, suffix, placeholder }: { label: string; value: string; onChange: (v: string) => void; suffix: string; placeholder: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor="#A7A49C"
          accessibilityLabel={label}
          style={styles.input}
        />
        <Text style={styles.suffix}>{suffix}</Text>
      </View>
    </View>
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
  card: { padding: 16, gap: 12 },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  note: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: Brand.muted, marginTop: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexGrow: 1, flexBasis: '45%', padding: 12, borderRadius: 12, backgroundColor: Brand.paperRaised, borderWidth: 1, borderColor: Brand.line, gap: 2 },
  statLabel: { fontSize: 13, color: Brand.muted },
  statValue: { fontSize: 22, fontWeight: '800', color: Brand.ink, fontVariant: ['tabular-nums'] },
  statNote: { fontSize: 12, color: Brand.muted },
  toggle: { flexDirection: 'row', alignSelf: 'flex-start', padding: 3, gap: 3, borderRadius: 10, borderWidth: 1.5, borderColor: Brand.asphalt },
  toggleOption: { minHeight: 38, paddingHorizontal: 14, borderRadius: 7, justifyContent: 'center' },
  toggleOn: { backgroundColor: Brand.asphalt },
  toggleLabel: { fontSize: 15, fontWeight: '700', color: Brand.ink },
  toggleLabelOn: { color: '#FFFFFF' },
  fields: { flexDirection: 'row', gap: 10 },
  field: { flex: 1, gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised, paddingHorizontal: 12 },
  input: { flex: 1, height: 52, fontSize: 17, color: Brand.ink, fontVariant: ['tabular-nums'] },
  suffix: { fontSize: 15, color: Brand.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paper, justifyContent: 'center' },
  chipLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  result: { gap: 4, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: Brand.asphalt, backgroundColor: Brand.paper },
  big: { fontSize: 40, fontWeight: '800', color: Brand.ink, fontVariant: ['tabular-nums'] },
  bigUnit: { fontSize: 18, fontWeight: '600', color: Brand.muted },
  lines: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Brand.line, gap: 4 },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  lineLabel: { fontSize: 15, color: Brand.muted },
  lineValue: { fontSize: 15, fontWeight: '700', color: Brand.ink },
});
