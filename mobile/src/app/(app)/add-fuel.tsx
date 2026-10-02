// Logs a fill-up or charge - or, opened from an entry with its id,
// edits that one through the same website route's PATCH.
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntryLoader } from '@/components/entry-loader';
import { Icon } from '@/components/icon';
import { MissingHint } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ENTRY_ROUTES, recordPath, type Entry } from '@/lib/entries';
import { dayLabel, fromIsoDay, groupNumber, parseMileage, parseNumber, toIsoDay, useEstimatedMileage } from '@/lib/mileage';
import { toStoredGbp, toStoredMiles, useVehicle, vehicleHeaders } from '@/lib/vehicle';

export default function AddFuelScreen() {
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();
  if (!entryId) return <FuelForm />;
  return (
    <EntryLoader category="fuel" entryId={entryId} title="Edit fill-up">
      {(entry) => <FuelForm existing={entry} />}
    </EntryLoader>
  );
}

function FuelForm({ existing }: { existing?: Entry }) {
  const { selected, refresh } = useVehicle();
  const { token, signOut } = useAuth();
  // What an edit starts from - also how an untouched field is spotted,
  // so its stored value goes back as it was rather than re-converted.
  const [initial] = useState(() => ({
    amount: existing?.fuel ? String(existing.fuel.amount) : '',
    cost: existing ? existing.costDisplay.toFixed(2) : '',
    mileage: existing?.mileageDisplay != null ? groupNumber(existing.mileageDisplay) : undefined,
  }));
  const [amount, setAmount] = useState(initial.amount);
  const [cost, setCost] = useState(initial.cost);
  const [date, setDate] = useState(() => (existing ? fromIsoDay(existing.date) : new Date()));
  const [full, setFull] = useState(existing?.fuel ? existing.fuel.filledToFull : true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<{ message: string; canOverride: boolean } | null>(null);
  const { mileage, setMileage, note: estimateNote } = useEstimatedMileage(selected, date, token, initial.mileage);

  if (!selected) return null;
  const vehicle = selected;
  const { units } = vehicle;
  // An existing entry keeps its own kind: a charge stays a charge.
  const electric = existing?.fuel ? existing.fuel.unit === 'kWh' : vehicle.fuelType === 'electric';
  const amountUnit = electric ? 'kWh' : 'L';
  const distanceUnit = units.distanceUnit === 'km' ? 'km' : 'mi';

  const amountN = parseNumber(amount);
  const costN = parseNumber(cost);
  const mileageN = parseMileage(mileage);
  const valid = amountN > 0 && costN > 0 && mileageN > 0;
  const unitPrice = amountN > 0 && costN > 0 ? costN / amountN : null;

  async function save(acknowledgeMileage: boolean) {
    if (!valid || saving) return;
    setSaving(true);
    setProblem(null);
    const same = {
      cost: existing && cost === initial.cost,
      mileage: existing && existing.mileageMiles != null && mileage === initial.mileage,
      date: existing && toIsoDay(date) === existing.date.slice(0, 10),
    };
    const result = await apiFetch(existing ? recordPath(vehicle, 'fuel', existing.id) : ENTRY_ROUTES.fuel[vehicle.kind], {
      method: existing ? 'PATCH' : 'POST',
      token,
      headers: vehicleHeaders(vehicle),
      body: {
        ...(electric ? { kwh: amountN } : { litres: amountN }),
        cost: existing && same.cost ? existing.costGbp : toStoredGbp(costN, units),
        mileage: existing && same.mileage ? existing.mileageMiles : toStoredMiles(mileageN, units),
        date: existing && same.date ? existing.date : toIsoDay(date),
        filledToFull: electric ? false : full,
        mileageAcknowledged: acknowledgeMileage,
      },
    });
    setSaving(false);
    if (result.ok) {
      refresh();
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
            {existing ? (electric ? 'Edit charge' : 'Edit fill-up') : electric ? 'Log a charge' : 'Log fuel'}
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
              <Field label={electric ? 'kWh' : 'Litres'} value={amount} onChangeText={setAmount} placeholder={electric ? 'e.g. 40.5' : 'e.g. 12.4'} autoFocus={!existing} />
              <Field label={`Cost (${units.currencySymbol})`} value={cost} onChangeText={setCost} placeholder="e.g. 19.80" />
            </View>
            <Text style={styles.hint} accessibilityLiveRegion="polite">
              {unitPrice != null
                ? `Works out at ${units.currencySymbol}${unitPrice.toFixed(3)} per ${electric ? 'kWh' : 'litre'}`
                : `Enter ${electric ? 'kWh' : 'litres'} and cost to see the price per ${amountUnit === 'L' ? 'litre' : 'kWh'}`}
            </Text>

            <Field
              label={`Mileage (${distanceUnit})`}
              value={mileage}
              onChangeText={setMileage}
              placeholder={`e.g. ${groupNumber(units.currentMileageDisplay)}`}
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
            <MissingHint missing={[!(amountN > 0) && 'enter the litres', !(costN > 0) && 'enter the cost', !(mileageN > 0) && 'enter the mileage']} />
            <Pressable
              onPress={() => save(false)}
              disabled={!valid || saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid || saving, busy: saving }}
              style={({ pressed }) => [styles.save, (!valid || saving) && styles.saveDisabled, pressed && valid && { opacity: 0.85 }]}>
              <Text style={styles.saveLabel}>{saving ? 'Saving…' : existing ? 'Save changes' : electric ? 'Save charge' : 'Save fill-up'}</Text>
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
