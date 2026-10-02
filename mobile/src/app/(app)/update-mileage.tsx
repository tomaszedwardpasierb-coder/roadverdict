// Updates the vehicle's current mileage - the web's "Update mileage"
// button, on the same endpoint. Like the web, a reading lower than the
// current one is refused: mileage only goes up.
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { MissingHint } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { groupNumber, parseMileage } from '@/lib/mileage';
import { toStoredMiles, useVehicle, vehicleHeaders } from '@/lib/vehicle';

export default function UpdateMileageScreen() {
  const { selected, refresh } = useVehicle();
  const { token, signOut } = useAuth();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!selected) return null;
  const vehicle = selected;
  const { units } = vehicle;
  const unit = units.distanceUnit === 'km' ? 'km' : 'miles';
  const current = units.currentMileageDisplay;
  const reading = parseMileage(value);
  const tooLow = reading > 0 && reading < current;
  const valid = reading > 0 && !tooLow;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    const result = await apiFetch(vehicle.kind === 'car' ? '/api/cars/car' : '/api/tracker/bike', {
      method: 'PATCH',
      token,
      headers: vehicleHeaders(vehicle),
      body: { currentMileage: Math.round(toStoredMiles(reading, units)) },
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
    setError(result.error);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Update mileage
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {vehicle.name}
          </Text>
        </View>
      </View>

      {vehicle.readOnly ? (
        <View style={styles.readOnly}>
          <Text style={styles.error}>This vehicle has been transferred and is now read-only.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="height">
          <View style={styles.body}>
            <View style={styles.current}>
              <Text style={styles.currentLabel}>Currently recorded</Text>
              <Text style={styles.currentValue}>
                {current.toLocaleString('en-GB')} {unit}
              </Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label} nativeID="new-mileage">
                What does the odometer read now?
              </Text>
              <TextInput
                value={value}
                onChangeText={setValue}
                keyboardType="number-pad"
                autoFocus
                accessibilityLabelledBy="new-mileage"
                placeholder={`e.g. ${groupNumber(current + 100)}`}
                placeholderTextColor="#A7A49C"
                style={[styles.input, tooLow && styles.inputError]}
              />
            </View>
            {tooLow ? (
              <Text style={styles.error} accessibilityRole="alert">
                This can’t be lower than the current reading ({current.toLocaleString('en-GB')} {unit}).
              </Text>
            ) : null}
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </View>
          <View style={styles.footer}>
            <MissingHint missing={[!(reading > 0) && 'enter what the odometer reads now']} />
            <Pressable
              onPress={save}
              disabled={!valid || saving}
              accessibilityRole="button"
              accessibilityState={{ disabled: !valid || saving, busy: saving }}
              style={({ pressed }) => [styles.save, (!valid || saving) && styles.saveDisabled, pressed && valid && { opacity: 0.85 }]}>
              <Text style={styles.saveLabel}>{saving ? 'Saving…' : 'Save mileage'}</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  body: { flex: 1, padding: 20, gap: 16 },
  current: { padding: 16, borderRadius: 14, borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.paperRaised, gap: 2 },
  currentLabel: { fontSize: 13, color: Brand.muted },
  currentValue: { fontSize: 26, fontWeight: '800', color: Brand.ink },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  input: {
    height: 60,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    fontSize: 22,
    color: Brand.ink,
  },
  inputError: { borderColor: Brand.danger },
  error: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  readOnly: { margin: 20, padding: 14, borderRadius: 12, backgroundColor: '#F8E6E3' },
  footer: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Brand.line, backgroundColor: Brand.paper },
  save: { height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  saveDisabled: { opacity: 0.5 },
  saveLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
});
