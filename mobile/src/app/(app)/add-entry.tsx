// One screen for every logbook entry type except fuel (which has its own):
// services and repairs, parts, labour, bills, fines and tolls. Each posts
// to the website's own route for that type - the same fields its web form
// sends - with the app naming its vehicle in a header.
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { OptionPicker } from '@/components/option-picker';
import { ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormOptions, type ReminderDefault, type VehicleFormOptions } from '@/lib/form-options';
import { dayLabel, parseMileage, parseNumber, toIsoDay, useEstimatedMileage } from '@/lib/mileage';
import { toStoredGbp, toStoredMiles, useVehicle, vehicleHeaders } from '@/lib/vehicle';

type EntryType = 'service' | 'mods' | 'labour' | 'bills' | 'fines' | 'tolls';

const CONFIG: Record<
  EntryType,
  {
    title: string;
    typeLabel: string;
    typePlaceholder: string;
    field: string;
    hasMileage: boolean;
    hasName?: boolean;
    route: { bike: string; car: string };
  }
> = {
  service: {
    title: 'Service or repair',
    typeLabel: 'What was done?',
    typePlaceholder: 'Choose the job',
    field: 'jobType',
    hasMileage: true,
    route: { bike: '/api/tracker/services', car: '/api/cars/car-services' },
  },
  mods: {
    title: 'Part or accessory',
    typeLabel: 'Type of part',
    typePlaceholder: 'Choose the type',
    field: 'category',
    hasMileage: true,
    hasName: true,
    route: { bike: '/api/tracker/mods', car: '/api/cars/car-mods' },
  },
  labour: {
    title: 'Labour',
    typeLabel: 'What was the work?',
    typePlaceholder: 'Choose the job',
    field: 'category',
    hasMileage: true,
    route: { bike: '/api/tracker/labour', car: '/api/cars/car-labour' },
  },
  bills: {
    title: 'Insurance, tax, MOT or finance',
    typeLabel: 'What was it for?',
    typePlaceholder: 'Choose the type',
    field: 'billType',
    hasMileage: false,
    route: { bike: '/api/tracker/bills', car: '/api/cars/car-bills' },
  },
  fines: {
    title: 'Fine',
    typeLabel: 'Type of fine',
    typePlaceholder: 'Choose the type',
    field: 'fineType',
    hasMileage: false,
    route: { bike: '/api/tracker/fines', car: '/api/cars/car-fines' },
  },
  tolls: {
    title: 'Toll or charge',
    typeLabel: 'Type of charge',
    typePlaceholder: 'Choose the type',
    field: 'tollType',
    hasMileage: false,
    route: { bike: '/api/tracker/tolls', car: '/api/cars/car-tolls' },
  },
};

function isEntryType(value: unknown): value is EntryType {
  return typeof value === 'string' && value in CONFIG;
}

export default function AddEntryScreen() {
  const params = useLocalSearchParams<{ type: string }>();
  const type: EntryType = isEntryType(params.type) ? params.type : 'service';
  const config = CONFIG[type];
  const { selected, refresh } = useVehicle();
  const { token, signOut } = useAuth();
  const form = useFormOptions(selected?.kind);
  const [kind, setKind] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(() => new Date());
  const [notes, setNotes] = useState('');
  const [remind, setRemind] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<{ message: string; canOverride: boolean } | null>(null);
  const { mileage, setMileage, note: estimateNote } = useEstimatedMileage(selected, date, token);

  if (!selected) return null;
  const vehicle = selected;
  const { units } = vehicle;
  const distanceUnit = units.distanceUnit === 'km' ? 'km' : 'mi';

  const options = form.options ? (form.options[type] as VehicleFormOptions[EntryType]) : null;
  // Only services and bills carry "remind me again" defaults.
  const reminderDefaults: Record<string, ReminderDefault> | null =
    options && 'reminderDefaults' in options ? (options as { reminderDefaults: Record<string, ReminderDefault> }).reminderDefaults : null;
  const reminderDefault = kind && reminderDefaults ? reminderDefaults[kind] : undefined;

  const costN = parseNumber(cost);
  const mileageN = parseMileage(mileage);
  const valid = !!kind && costN > 0 && (!config.hasMileage || mileageN > 0) && (!config.hasName || name.trim().length > 0);

  async function save(acknowledgeMileage: boolean) {
    if (!valid || saving) return;
    setSaving(true);
    setProblem(null);
    const result = await apiFetch(config.route[vehicle.kind], {
      method: 'POST',
      token,
      headers: vehicleHeaders(vehicle),
      body: {
        [config.field]: kind,
        ...(config.hasName ? { name: name.trim() } : {}),
        cost: toStoredGbp(costN, units),
        date: toIsoDay(date),
        notes: notes.trim(),
        ...(config.hasMileage ? { mileage: Math.round(toStoredMiles(mileageN, units)), mileageAcknowledged: acknowledgeMileage } : {}),
        // The same "remind me when it's due again" the web forms offer,
        // with the same default interval for the chosen job or bill.
        ...(reminderDefault && remind ? { reminder: { intervalType: reminderDefault.type, intervalValue: reminderDefault.value } } : {}),
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
    // 409 is the website's mileage check (out of order with your other
    // entries); a warning can be confirmed, a hard block can't.
    setProblem({ message: result.error, canOverride: result.status === 409 && config.hasMileage && !acknowledgeMileage });
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
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
            {config.title}
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
      ) : !options ? (
        form.failed ? <ErrorState message="The list of choices couldn’t be loaded." onRetry={form.retry} /> : <LoadingState />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="height">
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <OptionPicker
              label={config.typeLabel}
              placeholder={config.typePlaceholder}
              groups={options.groups}
              value={kind}
              onChange={setKind}
            />

            {config.hasName ? (
              <Field label="What is it?" value={name} onChangeText={setName} placeholder="e.g. Akrapovic slip-on can" keyboardType="default" />
            ) : null}

            <View style={styles.pair}>
              <Field label={`Cost (${units.currencySymbol})`} value={cost} onChangeText={setCost} placeholder="0.00" />
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Date</Text>
                <Pressable onPress={pickDate} accessibilityRole="button" accessibilityHint="Opens a calendar" style={styles.dateButton}>
                  <Text style={styles.dateText} numberOfLines={1}>
                    {dayLabel(date)}
                  </Text>
                </Pressable>
              </View>
            </View>

            {config.hasMileage ? (
              <Field
                label={`Mileage (${distanceUnit})`}
                value={mileage}
                onChangeText={setMileage}
                placeholder={String(units.currentMileageDisplay)}
                keyboardType="number-pad"
                hint={estimateNote ?? `Last recorded: ${units.currentMileageDisplay.toLocaleString('en-GB')} ${distanceUnit}`}
              />
            ) : null}

            {reminderDefault ? (
              <View style={styles.toggleRow}>
                <View style={styles.flex}>
                  <Text style={styles.toggleTitle}>Remind me when it’s due again</Text>
                  <Text style={styles.hint}>
                    {reminderDefault.type === 'months'
                      ? `In ${reminderDefault.value} months`
                      : `In ${reminderDefault.value.toLocaleString('en-GB')} miles`}
                    {reminderDefault.note ? ` - ${reminderDefault.note}` : ''}
                  </Text>
                </View>
                <Switch
                  value={remind}
                  onValueChange={setRemind}
                  accessibilityLabel="Remind me when it’s due again"
                  trackColor={{ true: Brand.amber, false: Brand.line }}
                  thumbColor="#FFFFFF"
                />
              </View>
            ) : null}

            <Field
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder={type === 'bills' ? 'e.g. policy number, provider' : 'e.g. which garage did it'}
              keyboardType="default"
              multiline
            />

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
              <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save'}</Text>
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
  multiline,
  ...input
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'decimal-pad' | 'number-pad' | 'default';
  multiline?: boolean;
}) {
  return (
    <View style={[styles.field, styles.flex]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...input}
        keyboardType={keyboardType}
        multiline={multiline}
        accessibilityLabel={label}
        placeholderTextColor="#A7A49C"
        style={[styles.input, multiline && styles.inputMultiline]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 26, fontWeight: '800', color: Brand.ink },
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
  inputMultiline: { height: 96, paddingTop: 12, textAlignVertical: 'top', fontSize: 16 },
  hint: { fontSize: 13, color: Brand.muted, lineHeight: 18 },
  dateButton: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  dateText: { fontSize: 16, color: Brand.ink },
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
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Brand.line, backgroundColor: Brand.paper },
  save: { height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  saveDisabled: { opacity: 0.5 },
  saveLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
});
