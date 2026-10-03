// One screen for every logbook entry type except fuel (which has its own):
// services and repairs, parts, labour, bills, fines and tolls. Each posts
// to the website's own route for that type - the same fields its web form
// sends - with the app naming its vehicle in a header. Opened from an
// entry with its id, the same form edits that entry through the route's
// PATCH instead.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntryLoader } from '@/components/entry-loader';
import { DatePressable } from '@/components/date-pressable';
import { Icon } from '@/components/icon';
import { OptionPicker } from '@/components/option-picker';
import { ErrorState, LoadingState, MissingHint } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { doneBarFor } from '@/components/keyboard-done';
import { apiFetch } from '@/lib/api';
import { uploadChatPhoto, type ChatAttachment } from '@/lib/assistant';
import { useAuth } from '@/lib/auth';
import { ENTRY_ROUTES, recordPath, TYPED_FIELDS, type Entry, type TypedCategory } from '@/lib/entries';
import { useFormOptions, type ReminderDefault, type VehicleFormOptions } from '@/lib/form-options';
import { dayLabel, fromIsoDay, groupNumber, parseMileage, parseNumber, toIsoDay, useEstimatedMileage } from '@/lib/mileage';
import { toStoredGbp, toStoredMiles, useVehicle, vehicleHeaders } from '@/lib/vehicle';

// `hint` is a short line under the title saying what the form covers, where
// the title alone is too brief ("Bill" covers insurance, tax, MOT and finance).
const CONFIG: Record<TypedCategory, { title: string; hint?: string; typeLabel: string; typePlaceholder: string; notesPlaceholder: string }> = {
  service: { title: 'Service or repair', typeLabel: 'What was done?', typePlaceholder: 'Choose the job', notesPlaceholder: 'e.g. which garage did it' },
  mods: { title: 'Part or accessory', typeLabel: 'Type of part', typePlaceholder: 'Choose the type', notesPlaceholder: 'e.g. where you bought it' },
  labour: { title: 'Labour', typeLabel: 'What was the work?', typePlaceholder: 'Choose the job', notesPlaceholder: 'e.g. which garage did it' },
  bills: { title: 'Bill', hint: 'Insurance, tax, MOT or finance', typeLabel: 'What was it for?', typePlaceholder: 'Choose the type', notesPlaceholder: 'e.g. policy number, provider' },
  fines: { title: 'Fine', typeLabel: 'Type of fine', typePlaceholder: 'Choose the type', notesPlaceholder: 'e.g. PCN number, issuing council' },
  tolls: { title: 'Toll or charge', typeLabel: 'Type of charge', typePlaceholder: 'Choose the type', notesPlaceholder: 'e.g. Dartford Crossing' },
};

function isEntryType(value: unknown): value is TypedCategory {
  return typeof value === 'string' && value in CONFIG;
}

function editTitle(type: TypedCategory): string {
  const title = CONFIG[type].title;
  return `Edit ${title.charAt(0).toLowerCase()}${title.slice(1)}`;
}

export default function AddEntryScreen() {
  const params = useLocalSearchParams<{ type: string; entryId?: string }>();
  const type: TypedCategory = isEntryType(params.type) ? params.type : 'service';
  if (!params.entryId) return <EntryForm type={type} />;
  return (
    <EntryLoader category={type} entryId={params.entryId} title={editTitle(type)}>
      {(entry) => <EntryForm type={type} existing={entry} />}
    </EntryLoader>
  );
}

function EntryForm({ type, existing }: { type: TypedCategory; existing?: Entry }) {
  const config = CONFIG[type];
  const fields = TYPED_FIELDS[type];
  const { selected, refresh } = useVehicle();
  const { token, signOut } = useAuth();
  const form = useFormOptions(selected?.kind);
  // What an edit starts from - also how an untouched field is spotted,
  // so its stored value goes back as it was rather than re-converted.
  const [initial] = useState(() => ({
    cost: existing ? existing.costDisplay.toFixed(2) : '',
    mileage: existing?.mileageDisplay != null ? groupNumber(existing.mileageDisplay) : undefined,
  }));
  const [kind, setKind] = useState<string | null>(existing?.typeKey ?? null);
  const [name, setName] = useState(existing?.name ?? '');
  const [cost, setCost] = useState(initial.cost);
  const [date, setDate] = useState(() => (existing ? fromIsoDay(existing.date) : new Date()));
  const [notes, setNotes] = useState(existing?.notes ?? '');
  // A receipt photo for a new service or bill - uploaded as soon as it's
  // picked, then saved with the entry as its attachment.
  const canAttach = !existing && (type === 'service' || type === 'bills');
  const [photo, setPhoto] = useState<{ uri: string; attachment: ChatAttachment | null } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [remind, setRemind] = useState(true);
  // Road tax is paid for 6 or 12 months at a time, so its reminder can be
  // either; every other default stays as the website sets it.
  const [roadTaxMonths, setRoadTaxMonths] = useState<6 | 12>(12);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<{ message: string; canOverride: boolean } | null>(null);
  const { mileage, setMileage, note: estimateNote } = useEstimatedMileage(selected, date, token, initial.mileage);

  if (!selected) return null;
  const vehicle = selected;
  const { units } = vehicle;
  const distanceUnit = units.distanceUnit === 'km' ? 'km' : 'mi';

  const options = form.options ? (form.options[type] as VehicleFormOptions[TypedCategory]) : null;
  // Only services and bills carry "remind me again" defaults - and only
  // when logging: an edit leaves reminders alone (the web's edit would
  // replace the job's current reminder, even from an old entry).
  const reminderDefaults: Record<string, ReminderDefault> | null =
    !existing && options && 'reminderDefaults' in options ? (options as { reminderDefaults: Record<string, ReminderDefault> }).reminderDefaults : null;
  const defaultReminder = kind && reminderDefaults ? reminderDefaults[kind] : undefined;
  const isRoadTax = kind === 'road-tax' && defaultReminder?.type === 'months';
  const reminderDefault = defaultReminder && isRoadTax ? { ...defaultReminder, value: roadTaxMonths } : defaultReminder;

  const costN = parseNumber(cost);
  const mileageN = parseMileage(mileage);
  const valid = !!kind && costN > 0 && (!fields.hasMileage || mileageN > 0) && (!fields.hasName || name.trim().length > 0);

  async function addPhoto(source: 'camera' | 'library') {
    setPhotoError(null);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return setPhotoError('Camera access is off. Allow it in your phone’s settings, or choose a photo instead.');
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setPhoto({ uri: asset.uri, attachment: null });
    const uploaded = await uploadChatPhoto(asset.uri, token);
    if (!uploaded.ok) {
      setPhoto(null);
      if (uploaded.status === 401) return signOut();
      return setPhotoError(uploaded.error);
    }
    setPhoto({ uri: asset.uri, attachment: uploaded.data.attachment });
  }

  function choosePhoto() {
    Alert.alert('Receipt photo', 'Keep the receipt with this entry – proof of the work when you sell.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose a photo', onPress: () => addPhoto('library') },
      { text: 'Take a photo', onPress: () => addPhoto('camera') },
    ]);
  }

  async function save(acknowledgeMileage: boolean) {
    if (!valid || saving || (photo && !photo.attachment)) return;
    setSaving(true);
    setProblem(null);
    const same = {
      cost: existing && cost === initial.cost,
      mileage: existing && existing.mileageMiles != null && mileage === initial.mileage,
      date: existing && toIsoDay(date) === existing.date.slice(0, 10),
    };
    const storedMileage = existing && same.mileage ? existing.mileageMiles : Math.round(toStoredMiles(mileageN, units));
    const result = await apiFetch(existing ? recordPath(vehicle, type, existing.id) : ENTRY_ROUTES[type][vehicle.kind], {
      method: existing ? 'PATCH' : 'POST',
      token,
      headers: vehicleHeaders(vehicle),
      body: {
        [fields.field]: kind,
        ...(fields.hasName ? { name: name.trim() } : {}),
        cost: existing && same.cost ? existing.costGbp : toStoredGbp(costN, units),
        date: existing && same.date ? existing.date : toIsoDay(date),
        notes: notes.trim(),
        ...(fields.hasMileage ? { mileage: storedMileage, mileageAcknowledged: acknowledgeMileage } : {}),
        // The same "remind me when it's due again" the web forms offer,
        // with the same default interval for the chosen job or bill.
        ...(reminderDefault && remind ? { reminder: { intervalType: reminderDefault.type, intervalValue: reminderDefault.value } } : {}),
        ...(photo?.attachment ? { attachments: [photo.attachment] } : {}),
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
    setProblem({ message: result.error, canOverride: result.status === 409 && fields.hasMileage && !acknowledgeMileage });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
            {existing ? editTitle(type) : config.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {config.hint ? `${config.hint} · ${vehicle.name}` : vehicle.name}
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
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <OptionPicker
              label={config.typeLabel}
              placeholder={config.typePlaceholder}
              groups={options.groups}
              value={kind}
              onChange={setKind}
            />

            {fields.hasName ? (
              <Field label="What is it?" value={name} onChangeText={setName} placeholder="e.g. Akrapovic slip-on can" keyboardType="default" />
            ) : null}

            <View style={styles.pair}>
              <Field label={`Cost (${units.currencySymbol})`} value={cost} onChangeText={setCost} placeholder="e.g. 45.00" />
              <View style={[styles.field, styles.flex]}>
                <Text style={styles.label}>Date</Text>
                <DatePressable value={date} onChange={setDate} maximumDate={new Date()} style={styles.dateButton}>
                  <Text style={styles.dateText} numberOfLines={1}>
                    {dayLabel(date)}
                  </Text>
                </DatePressable>
              </View>
            </View>

            {fields.hasMileage ? (
              <Field
                label={`Mileage (${distanceUnit})`}
                value={mileage}
                onChangeText={setMileage}
                placeholder={`e.g. ${groupNumber(units.currentMileageDisplay)}`}
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
                    {reminderDefault.note ? ` – ${reminderDefault.note}` : ''}
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
            {isRoadTax && remind ? (
              <View style={styles.periodRow} accessibilityRole="radiogroup" accessibilityLabel="Taxed for">
                {([6, 12] as const).map((months) => (
                  <Pressable
                    key={months}
                    onPress={() => setRoadTaxMonths(months)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: roadTaxMonths === months }}
                    style={[styles.period, roadTaxMonths === months && styles.periodOn]}>
                    <Text style={[styles.periodLabel, roadTaxMonths === months && styles.periodLabelOn]}>Taxed for {months} months</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Field
              label="Notes (optional)"
              value={notes}
              onChangeText={setNotes}
              placeholder={config.notesPlaceholder}
              keyboardType="default"
              multiline
            />

            {canAttach ? (
              <View style={styles.photoField}>
                <Text style={styles.photoLabel}>Receipt photo (optional)</Text>
                {photo ? (
                  <View style={styles.photoRow}>
                    <Image source={{ uri: photo.uri }} style={styles.photoThumb} contentFit="cover" alt="Receipt photo" />
                    <Text style={[styles.photoStatus, styles.flex]}>{photo.attachment ? 'Added – saved with this entry' : 'Adding…'}</Text>
                    {photo.attachment ? null : <ActivityIndicator color={Brand.amberInk} />}
                    <Pressable onPress={() => setPhoto(null)} accessibilityRole="button" accessibilityLabel="Remove the photo" hitSlop={8} style={styles.photoRemove}>
                      <Icon name="close" size={20} color={Brand.muted} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={choosePhoto} accessibilityRole="button" style={({ pressed }) => [styles.photoAdd, pressed && { opacity: 0.85 }]}>
                    <Icon name="camera" size={20} color={Brand.amberInk} />
                    <Text style={styles.photoAddLabel}>Add the receipt</Text>
                  </Pressable>
                )}
                {photoError ? (
                  <Text style={styles.photoError} accessibilityRole="alert">
                    {photoError}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {problem ? (
              <View style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Text style={styles.problemText}>{problem.message}</Text>
                {problem.canOverride ? (
                  <Pressable onPress={() => save(true)} accessibilityRole="button" style={styles.override}>
                    <Text style={styles.overrideLabel}>That&apos;s right – save anyway</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <MissingHint missing={[!kind && 'choose what it was', fields.hasName && !name.trim() && 'say what it is', !(costN > 0) && 'enter the cost', fields.hasMileage && !(mileageN > 0) && 'enter the mileage', !!photo && !photo.attachment && 'wait for the photo to finish adding']} />
            <Pressable
              onPress={() => save(false)}
              disabled={!valid || saving || (!!photo && !photo.attachment)}
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid || saving, busy: saving }}
              style={({ pressed }) => [styles.save, (!valid || saving) && styles.saveDisabled, pressed && valid && { opacity: 0.85 }]}>
              <Text style={styles.saveLabel}>{saving ? 'Saving…' : existing ? 'Save changes' : 'Save'}</Text>
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
        keyboardType={keyboardType} inputAccessoryViewID={doneBarFor(keyboardType)}
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
  photoField: { gap: 8 },
  photoLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  photoAdd: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9C4B8', backgroundColor: Brand.paperRaised },
  photoAddLabel: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  photoThumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: Brand.line },
  photoStatus: { fontSize: 14, color: Brand.ink },
  photoRemove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  photoError: { fontSize: 14, lineHeight: 20, color: Brand.danger },
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
  periodRow: { flexDirection: 'row', gap: 8 },
  period: { flex: 1, minHeight: 44, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised, alignItems: 'center', justifyContent: 'center' },
  periodOn: { borderColor: Brand.amber, backgroundColor: '#FBF4E8' },
  periodLabel: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  periodLabelOn: { color: '#7A4508' },
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
