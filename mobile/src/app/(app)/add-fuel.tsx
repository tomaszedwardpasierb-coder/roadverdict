import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { toStoredGbp, toStoredMiles, useVehicle, vehicleHeaders } from '@/lib/vehicle';

// Accepts "12,4" as well as "12.4" - phone keyboards in many locales
// only offer a comma.
function parseNumber(text: string): number {
  const n = Number(text.replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
}

// The date as the website's own <input type="date"> sends it: the
// person's local calendar day, not a UTC timestamp.
function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (toIsoDay(d) === toIsoDay(today)) return `Today, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  if (toIsoDay(d) === toIsoDay(yesterday)) return `Yesterday, ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AddFuelScreen() {
  const { selected } = useVehicle();
  const { token, signOut } = useAuth();
  const [amount, setAmount] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState(() => (selected ? String(selected.units.currentMileageDisplay) : ''));
  // Once the person types their own mileage, a date change stops
  // overwriting it - the same rule as the web forms.
  const [mileageTouched, setMileageTouched] = useState(false);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date());
  const [full, setFull] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<{ message: string; canOverride: boolean } | null>(null);

  const isoDate = toIsoDay(date);
  useEffect(() => {
    if (!selected || mileageTouched) return;
    let cancelled = false;
    apiFetch<{ mileageDisplay: number | null; note: string | null }>(
      `/api/app/mileage-estimate?kind=${selected.kind}&id=${encodeURIComponent(selected.id)}&date=${isoDate}`,
      { token }
    ).then((result) => {
      if (cancelled || !result.ok) return;
      if (result.data.mileageDisplay != null) setMileage(String(result.data.mileageDisplay));
      else setMileage('');
      setEstimateNote(result.data.note);
    });
    return () => {
      cancelled = true;
    };
  }, [selected, isoDate, mileageTouched, token]);

  if (!selected) return null;
  const vehicle = selected;
  const { units } = vehicle;
  const electric = vehicle.fuelType === 'electric';
  const amountUnit = electric ? 'kWh' : 'L';
  const distanceUnit = units.distanceUnit === 'km' ? 'km' : 'mi';

  const amountN = parseNumber(amount);
  const costN = parseNumber(cost);
  const mileageN = parseNumber(mileage.replace(/[,\s]/g, ''));
  const valid = amountN > 0 && costN > 0 && mileageN > 0;
  const unitPrice = amountN > 0 && costN > 0 ? costN / amountN : null;

  async function save(acknowledgeMileage: boolean) {
    if (!valid || saving) return;
    setSaving(true);
    setProblem(null);
    const result = await apiFetch(vehicle.kind === 'bike' ? '/api/tracker/fuel' : '/api/cars/car-fuel', {
      method: 'POST',
      token,
      headers: vehicleHeaders(vehicle),
      body: {
        ...(electric ? { kwh: amountN } : { litres: amountN }),
        cost: toStoredGbp(costN, units),
        mileage: toStoredMiles(mileageN, units),
        date: toIsoDay(date),
        filledToFull: electric ? false : full,
        mileageAcknowledged: acknowledgeMileage,
      },
    });
    setSaving(false);
    if (result.ok) {
      router.back();
      return;
    }
    if (result.status === 401) {
      await signOut();
      return;
    }
    // 409 is the website's own "this doesn't add up" check (mileage out
    // of order, more fuel than the tank holds...). Some of those can be
    // confirmed and saved anyway, exactly as on the web - once confirming
    // hasn't helped, the problem is a hard one and only fixing it will do.
    setProblem({ message: result.error, canOverride: result.status === 409 && !acknowledgeMileage });
  }

  function pickDate() {
    DateTimePickerAndroid.open({
      value: date,
      mode: 'date',
      maximumDate: new Date(),
      onValueChange: (_event, picked) => {
        if (picked) setDate(picked);
      },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {electric ? 'Log a charge' : 'Log fuel'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {vehicle.name}
          </Text>
        </View>
      </View>

      {vehicle.readOnly ? (
        <View style={styles.readOnly}>
          <Text style={styles.problemText}>This vehicle has been transferred and is now read-only.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="height">
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <View style={styles.pair}>
              <Field label={electric ? 'kWh' : 'Litres'} value={amount} onChangeText={setAmount} placeholder={electric ? '40.5' : '12.4'} autoFocus />
              <Field label={`Cost (${units.currencySymbol})`} value={cost} onChangeText={setCost} placeholder="19.80" />
            </View>
            <Text style={styles.hint} accessibilityLiveRegion="polite">
              {unitPrice != null
                ? `Works out at ${units.currencySymbol}${unitPrice.toFixed(3)} per ${electric ? 'kWh' : 'litre'}`
                : `Enter ${electric ? 'kWh' : 'litres'} and cost to see the price per ${amountUnit === 'L' ? 'litre' : 'kWh'}`}
            </Text>

            <Field
              label={`Mileage (${distanceUnit})`}
              value={mileage}
              onChangeText={(text) => {
                setMileage(text);
                setMileageTouched(true);
                setEstimateNote(null);
              }}
              placeholder={String(units.currentMileageDisplay)}
              keyboardType="number-pad"
              hint={estimateNote ?? `Last recorded: ${units.currentMileageDisplay.toLocaleString('en-GB')} ${distanceUnit}`}
            />

            <View style={styles.field}>
              <Text style={styles.label}>Date</Text>
              <Pressable onPress={pickDate} accessibilityRole="button" accessibilityHint="Opens a calendar" style={styles.dateButton}>
                <Text style={styles.dateText}>{dayLabel(date)}</Text>
                <Icon name="chevronDown" size={20} color={Brand.muted} />
              </Pressable>
            </View>

            {!electric ? (
              <View style={styles.toggleRow}>
                <View style={styles.flex}>
                  <Text style={styles.toggleTitle}>Filled the tank to full</Text>
                  <Text style={styles.hint}>Full fills are what your MPG is worked out from</Text>
                </View>
                <Switch
                  value={full}
                  onValueChange={setFull}
                  accessibilityLabel="Filled the tank to full"
                  trackColor={{ true: Brand.amber, false: Brand.line }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ) : null}

            {problem ? (
              <View style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Text style={styles.problemText}>{problem.message}</Text>
                {problem.canOverride ? (
                  <Pressable onPress={() => save(true)} accessibilityRole="button" style={styles.override}>
                    <Text style={styles.overrideLabel}>That&apos;s right - save anyway</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={() => save(false)}
              disabled={!valid || saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid || saving, busy: saving }}
              style={({ pressed }) => [styles.save, (!valid || saving) && styles.saveDisabled, pressed && valid && { opacity: 0.85 }]}>
              <Text style={styles.saveLabel}>{saving ? 'Saving…' : electric ? 'Save charge' : 'Save fill-up'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Field({
  label,
  hint,
  keyboardType = 'decimal-pad',
  ...input
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'decimal-pad' | 'number-pad';
  autoFocus?: boolean;
}) {
  return (
    <View style={[styles.field, styles.flex]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...input} keyboardType={keyboardType} accessibilityLabel={label} placeholderTextColor="#A7A49C" style={styles.input} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  headerText: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  form: { padding: 20, gap: 16 },
  pair: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    fontSize: 18,
    color: Brand.ink,
  },
  hint: { fontSize: 13, color: Brand.muted, lineHeight: 18 },
  dateButton: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: { fontSize: 18, color: Brand.ink },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
  },
  toggleTitle: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  problem: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#F8E6E3' },
  problemText: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  override: { minHeight: 44, justifyContent: 'center' },
  overrideLabel: { fontSize: 15, fontWeight: '700', color: Brand.ink, textDecorationLine: 'underline' },
  readOnly: { margin: 20, padding: 14, borderRadius: 12, backgroundColor: '#F8E6E3' },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: Brand.line, backgroundColor: Brand.paper },
  save: { height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  saveDisabled: { opacity: 0.5 },
  saveLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
});
