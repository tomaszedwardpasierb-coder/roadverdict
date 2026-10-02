import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { MissingHint } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fromIsoDay } from '@/lib/mileage';
import { reminderRoute } from '@/lib/reminders';
import { toStoredMiles, useVehicle, vehicleHeaders } from '@/lib/vehicle';

type IntervalType = 'date' | 'months' | 'mileage';

// Reminder mileage is always in miles - that's how the website stores and
// describes it ("every 4,000 mi"), whatever unit the vehicle's set to.
const TYPES: { id: IntervalType; label: string }[] = [
  { id: 'date', label: 'On a date' },
  { id: 'months', label: 'Every … months' },
  { id: 'mileage', label: 'Every … miles' },
];

function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Opened from a reminder's Edit button with its id and current values, the
// same form edits it instead (and offers Delete).
export default function AddReminderScreen() {
  const params = useLocalSearchParams<{ id?: string; name?: string; type?: string; value?: string; date?: string }>();
  const editingId = params.id || null;
  const { selected } = useVehicle();
  const { token, signOut } = useAuth();
  const [name, setName] = useState(params.name ?? '');
  const [type, setType] = useState<IntervalType>(params.type === 'months' || params.type === 'mileage' ? params.type : 'date');
  const [value, setValue] = useState(params.value ?? '');
  const [date, setDate] = useState<Date | null>(params.date ? fromIsoDay(params.date) : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!selected) return null;
  const vehicle = selected;
  const suggestions = ['MOT', 'Road tax', 'Insurance', 'Service', 'Tyres', ...(vehicle.kind === 'bike' ? ['Chain clean & lube'] : ['Brake check'])];

  const interval = Number(value);
  const valid = name.trim().length > 0 && (type === 'date' ? date != null : Number.isInteger(interval) && interval > 0);

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const schedule = type === 'date' ? { exactDate: toIsoDay(date!) } : { intervalValue: interval };
    const result = await apiFetch(reminderRoute(vehicle, editingId ?? undefined), {
      method: editingId ? 'PUT' : 'POST',
      token,
      headers: vehicleHeaders(vehicle),
      body: editingId ? { name: name.trim(), intervalType: type, ...schedule } : {
        name: name.trim(),
        intervalType: type,
        ...(type === 'date' ? { exactDate: toIsoDay(date!) } : { intervalValue: interval }),
        // Counted from today and today's mileage, like a reminder the
        // website adds when you log a service.
        date: toIsoDay(new Date()),
        baseMileage: Math.round(toStoredMiles(vehicle.units.currentMileageDisplay, vehicle.units)),
      },
    });
    setSaving(false);
    if (result.ok) {
      router.back();
      return;
    }
    if (result.status === 401) await signOut();
    else setError(result.error);
  }

  function confirmDelete() {
    if (!editingId) return;
    Alert.alert(`Delete ${name.trim() || 'this reminder'}?`, "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          const result = await apiFetch(reminderRoute(vehicle, editingId), { method: 'DELETE', token, headers: vehicleHeaders(vehicle) });
          setSaving(false);
          if (result.ok) router.back();
          else if (result.status === 401) await signOut();
          else setError(result.error);
        },
      },
    ]);
  }

  function pickDate() {
    DateTimePickerAndroid.open({
      value: date ?? new Date(),
      mode: 'date',
      minimumDate: new Date(),
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
          <Text style={styles.title} accessibilityRole="header">
            {editingId ? 'Edit reminder' : 'Add a reminder'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {vehicle.name}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior="height">
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <View style={styles.field}>
            <Text style={styles.label} nativeID="reminder-name">
              What for?
            </Text>
            <TextInput
              accessibilityLabelledBy="reminder-name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. MOT"
              placeholderTextColor="#A7A49C"
              style={styles.input}
            />
            <View style={styles.chips}>
              {suggestions.map((s) => (
                <Pressable key={s} onPress={() => setName(s)} accessibilityRole="button" style={[styles.chip, name === s && styles.chipOn]}>
                  <Text style={[styles.chipLabel, name === s && styles.chipLabelOn]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>When?</Text>
            <View style={styles.segments} accessibilityRole="radiogroup">
              {TYPES.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    // A number of miles means nothing as months - start empty,
                    // unless it's the reminder's own original schedule again.
                    if (t.id !== type) setValue(t.id === params.type ? (params.value ?? '') : '');
                    setType(t.id);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: type === t.id }}
                  style={[styles.segment, type === t.id && styles.segmentOn]}>
                  <Text style={[styles.segmentLabel, type === t.id && styles.segmentLabelOn]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {type === 'date' ? (
            <Pressable onPress={pickDate} accessibilityRole="button" accessibilityHint="Opens a calendar" style={styles.dateButton}>
              <Text style={[styles.dateText, !date && styles.placeholder]}>
                {date ? date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : 'Pick a date'}
              </Text>
              <Icon name="chevronDown" size={20} color={Brand.muted} />
            </Pressable>
          ) : (
            <View style={styles.field}>
              <TextInput
                value={value}
                onChangeText={(t) => setValue(t.replace(/\D/g, ''))}
                keyboardType="number-pad"
                accessibilityLabel={type === 'months' ? 'Every how many months' : 'Every how many miles'}
                placeholder={type === 'months' ? 'e.g. 12' : 'e.g. 4,000'}
                placeholderTextColor="#A7A49C"
                style={styles.input}
              />
              <Text style={styles.hint}>
                {editingId
                  ? 'Counted from when it was last done.'
                  : type === 'months'
                    ? 'Counted from today.'
                    : 'Counted from your current mileage. Reminder mileage is always in miles.'}
              </Text>
            </View>
          )}

          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}

          {editingId ? (
            <Pressable
              onPress={confirmDelete}
              disabled={saving}
              accessibilityRole="button"
              style={({ pressed }) => [styles.delete, pressed && { opacity: 0.85 }]}>
              <Icon name="trash" size={18} color={Brand.danger} />
              <Text style={styles.deleteLabel}>Delete reminder</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <MissingHint missing={[!name.trim() && 'say what it’s for', type === 'date' ? date == null && 'pick a date' : !(Number.isInteger(interval) && interval > 0) && 'enter how often']} />
          <Pressable
            onPress={save}
            disabled={!valid || saving}
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid || saving, busy: saving }}
            style={({ pressed }) => [styles.save, (!valid || saving) && styles.saveDisabled, pressed && valid && { opacity: 0.85 }]}>
            <Text style={styles.saveLabel}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Save reminder'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  delete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  deleteLabel: { fontSize: 16, fontWeight: '600', color: Brand.danger },
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  form: { padding: 20, gap: 20 },
  field: { gap: 8 },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  chipOn: { backgroundColor: Brand.asphalt, borderColor: Brand.asphalt },
  chipLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  chipLabelOn: { color: '#FFFFFF' },
  segments: { gap: 8 },
  segment: { minHeight: 52, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  segmentOn: { borderColor: Brand.amber, backgroundColor: '#FBF4E8' },
  segmentLabel: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  segmentLabelOn: { color: '#7A4508' },
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
  dateText: { fontSize: 17, color: Brand.ink },
  placeholder: { color: '#A7A49C' },
  error: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Brand.line, backgroundColor: Brand.paper },
  save: { height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  saveDisabled: { opacity: 0.5 },
  saveLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
});
