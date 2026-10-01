// Settings, as the web's SettingsTab and UnitSettings have them: your
// name, the selected vehicle's units, two-factor sign-in, feedback, the
// privacy policy and deleting the account. Every change goes through the
// website's own routes; /api/app/account only reads the current state.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { OptionPicker } from '@/components/option-picker';
import { Card, ErrorState, LoadingState, SectionHeader } from '@/components/screen';
import { PushTest } from '@/components/push-test';
import { TwoFactorSection } from '@/components/two-factor';
import { Brand } from '@/constants/brand';
import { API_BASE_URL, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { useVehicleOptions } from '@/lib/vehicle-options';
import { useVehicle, vehicleHeaders, type GarageVehicle } from '@/lib/vehicle';

type Account = {
  email: string;
  displayName: string;
  twoFactorEnabled: boolean;
  pendingDeletion: { daysRemaining: number; deleteAfterLabel: string } | null;
};

export default function SettingsScreen() {
  const account = useApi<Account>('/api/app/account');
  const { selected } = useVehicle();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>
      </View>
      {account.data ? (
        <KeyboardAvoidingView style={styles.flex} behavior="height">
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={account.refreshing} onRefresh={account.refresh} colors={[Brand.amberInk]} />}>
            <SectionHeader title="Profile" />
            <NameCard initial={account.data.displayName} email={account.data.email} />

            {selected && !selected.readOnly ? (
              <>
                <SectionHeader title={`Units - ${selected.name}`} />
                <UnitsCard vehicle={selected} />
              </>
            ) : null}

            <SectionHeader title="Security" />
            <TwoFactorSection enabled={account.data.twoFactorEnabled} onChanged={account.refresh} />

            <SectionHeader title="Notifications" />
            <PushTest />

            <SectionHeader title="Feature request or bug" />
            <FeedbackCard />

            <SectionHeader title="Privacy" />
            <Card>
              <Pressable
                onPress={() => WebBrowser.openBrowserAsync(`${API_BASE_URL}/privacy`)}
                accessibilityRole="link"
                style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}>
                <Text style={[styles.linkLabel, styles.flex]}>Privacy policy</Text>
                <Icon name="chevronRight" size={20} color={Brand.muted} />
              </Pressable>
            </Card>

            <SectionHeader title="Delete account" />
            <DeleteCard pending={account.data.pendingDeletion} onChanged={account.refresh} />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : account.error ? (
        <ErrorState message={account.error} onRetry={account.retry} />
      ) : (
        <LoadingState />
      )}
    </SafeAreaView>
  );
}

// Shared by the cards below: a signed-in call that turns a 401 into
// signing out, as everywhere else in the app.
function useAccountCall() {
  const { token, signOut } = useAuth();
  return async function call<T>(path: string, options: { method: 'POST' | 'PATCH'; body?: unknown; headers?: Record<string, string> }) {
    const result = await apiFetch<T>(path, { ...options, token });
    if (!result.ok && result.status === 401) await signOut();
    return result;
  };
}

function NameCard({ initial, email }: { initial: string; email: string }) {
  const call = useAccountCall();
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    const result = await call('/api/account/profile', { method: 'PATCH', body: { displayName: name.trim() || null } });
    setSaving(false);
    setMessage(result.ok ? { text: 'Saved.', ok: true } : { text: result.error, ok: false });
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.meta}>{email}</Text>
      <Text style={styles.label} nativeID="name-label">
        Your name
      </Text>
      <TextInput
        value={name}
        onChangeText={(t) => {
          setName(t);
          setMessage(null);
        }}
        maxLength={60}
        placeholder="e.g. Alex"
        placeholderTextColor="#A7A49C"
        accessibilityLabelledBy="name-label"
        style={styles.input}
      />
      <Text style={styles.hint}>What RoadVerdict calls you. Leave it blank to skip this.</Text>
      <View style={styles.saveRow}>
        <Pressable
          onPress={save}
          disabled={saving || name.trim() === initial.trim()}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving || name.trim() === initial.trim(), busy: saving }}
          style={({ pressed }) => [styles.secondary, (saving || name.trim() === initial.trim()) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.secondaryLabel}>{saving ? 'Saving…' : 'Save name'}</Text>
        </Pressable>
        {message ? (
          <Text style={message.ok ? styles.saved : styles.problem} accessibilityLiveRegion="polite">
            {message.text}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

// Each vehicle keeps its own units, as on the web - saved the moment one
// is picked, through the same PATCH the web's UnitSettings sends.
function UnitsCard({ vehicle }: { vehicle: GarageVehicle }) {
  const call = useAccountCall();
  const garage = useVehicle();
  const options = useVehicleOptions();
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const { units } = vehicle;
  // Absent from an options list fetched before this field existed - the
  // picker simply waits for a fresh one rather than failing.
  const currencies = options.options?.currencies;

  async function save(change: { distanceUnit?: string; fuelEconomyUnit?: string; currency?: string }) {
    setSaving(true);
    setProblem(null);
    const result = await call(vehicle.kind === 'car' ? '/api/cars/car' : '/api/tracker/bike', {
      method: 'PATCH',
      headers: vehicleHeaders(vehicle),
      body: change,
    });
    setSaving(false);
    if (result.ok) garage.refresh();
    else setProblem(result.error);
  }

  function pickCurrency(currency: string) {
    if (currency === units.currency) return;
    // The web's own warning, before the change rather than beside it.
    Alert.alert(
      'Change currency?',
      'Nothing you’ve logged changes - every amount stays stored as recorded, and is converted for display at today’s rate. But rates move, so switching back and forth makes your past totals come out slightly differently each time. Best treated as a one-time choice.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Change it', onPress: () => save({ currency }) },
      ]
    );
  }

  return (
    <Card style={styles.card}>
      <Segmented
        label="Distance"
        options={[
          { value: 'mi', label: 'Miles' },
          { value: 'km', label: 'Kilometres' },
        ]}
        value={units.distanceUnit}
        disabled={saving}
        onChange={(v) => save({ distanceUnit: v })}
      />
      <Segmented
        label="Fuel economy"
        options={[
          { value: 'mpg', label: 'MPG' },
          { value: 'l100km', label: 'L/100km' },
        ]}
        value={units.fuelEconomyUnit}
        disabled={saving}
        onChange={(v) => save({ fuelEconomyUnit: v })}
      />
      {currencies?.length ? (
        <OptionPicker
          label="Currency"
          placeholder="Choose the currency"
          groups={[{ label: '', options: currencies }]}
          value={units.currency}
          onChange={pickCurrency}
        />
      ) : null}
      <Text style={styles.hint}>Each vehicle keeps its own units. Everything is stored the same way whatever you pick here.</Text>
      {problem ? (
        <Text style={styles.problem} accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}
    </Card>
  );
}

function Segmented({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => !on && onChange(o.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled }}
              style={[styles.segment, on && styles.segmentOn]}>
              <Text style={[styles.segmentLabel, on && styles.segmentLabelOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const FEEDBACK_TYPES = [
  { value: 'feature', label: 'Feature request' },
  { value: 'bug', label: 'Bug report' },
  { value: 'other', label: 'Something else' },
];

function FeedbackCard() {
  const call = useAccountCall();
  const [type, setType] = useState('feature');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  async function send() {
    setSending(true);
    setStatus(null);
    const result = await call('/api/account/feedback', { method: 'POST', body: { type, message: message.trim(), attachments: [], source: 'settings' } });
    setSending(false);
    if (result.ok) {
      setMessage('');
      setStatus({ text: 'Thanks, we’ve got it.', ok: true });
    } else setStatus({ text: result.error, ok: false });
  }

  return (
    <Card style={styles.card}>
      <View style={styles.chips}>
        {FEEDBACK_TYPES.map((t) => {
          const on = t.value === type;
          return (
            <Pressable
              key={t.value}
              onPress={() => setType(t.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={message}
        onChangeText={(t) => {
          setMessage(t);
          setStatus(null);
        }}
        multiline
        maxLength={4000}
        placeholder="What happened, or what would you like to see?"
        placeholderTextColor="#A7A49C"
        accessibilityLabel="Your message"
        style={[styles.input, styles.inputMultiline]}
      />
      <View style={styles.saveRow}>
        <Pressable
          onPress={send}
          disabled={sending || !message.trim()}
          accessibilityRole="button"
          accessibilityState={{ disabled: sending || !message.trim(), busy: sending }}
          style={({ pressed }) => [styles.secondary, (sending || !message.trim()) && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.secondaryLabel}>{sending ? 'Sending…' : 'Send'}</Text>
        </Pressable>
        {status ? (
          <Text style={[styles.flex, status.ok ? styles.saved : styles.problem]} accessibilityLiveRegion="polite">
            {status.text}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

// The web's DeleteAccountModal: nothing is deleted today - the account is
// scheduled for deletion in 30 days, and can be rescued until then.
function DeleteCard({ pending, onChanged }: { pending: Account['pendingDeletion']; onChanged: () => void }) {
  const call = useAccountCall();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function run(path: string, body?: unknown) {
    setBusy(true);
    setProblem(null);
    const result = await call(path, { method: 'POST', body });
    setBusy(false);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    setConfirming(false);
    setConfirmText('');
    onChanged();
  }

  if (pending) {
    return (
      <Card style={[styles.card, styles.warning]}>
        <Text style={styles.warningTitle}>Deletion pending</Text>
        <Text style={styles.warningText}>Your account will be permanently deleted on {pending.deleteAfterLabel}.</Text>
        <Pressable
          onPress={() => run('/api/account/cancel-deletion')}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy }}
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryLabel}>{busy ? 'Cancelling…' : 'Cancel deletion'}</Text>
        </Pressable>
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.text}>
        Permanently deletes your account and everything logged on it - every bike or car, service history, receipts, everything. Nothing is
        deleted today: it happens in 30 days, and you can cancel any time before then.
      </Text>
      {confirming ? (
        <>
          <Text style={styles.label} nativeID="delete-label">
            Type DELETE to confirm
          </Text>
          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabelledBy="delete-label"
            style={styles.input}
          />
          <View style={styles.saveRow}>
            <Pressable
              onPress={() => {
                setConfirming(false);
                setConfirmText('');
              }}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => run('/api/account/request-deletion', { confirmText: confirmText.trim() })}
              disabled={busy || confirmText.trim() !== 'DELETE'}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || confirmText.trim() !== 'DELETE', busy }}
              style={({ pressed }) => [styles.danger, styles.flex, (busy || confirmText.trim() !== 'DELETE') && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.dangerLabel}>{busy ? 'Scheduling…' : 'Delete my account'}</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" style={({ pressed }) => [styles.dangerOutline, pressed && styles.pressed]}>
          <Text style={styles.dangerOutlineLabel}>Delete my account</Text>
        </Pressable>
      )}
      {problem ? (
        <Text style={styles.problem} accessibilityRole="alert">
          {problem}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { flex: 1, fontSize: 28, fontWeight: '800', color: Brand.ink },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 10 },
  card: { padding: 16, gap: 12 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  meta: { fontSize: 14, color: Brand.muted },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  hint: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    fontSize: 17,
    color: Brand.ink,
  },
  inputMultiline: { height: 110, paddingTop: 12, textAlignVertical: 'top', fontSize: 16 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saved: { fontSize: 15, fontWeight: '600', color: '#1A6B4A' },
  problem: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  secondary: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 16, fontWeight: '700', color: Brand.ink },
  danger: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, backgroundColor: Brand.danger, alignItems: 'center', justifyContent: 'center' },
  dangerLabel: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  dangerOutline: {
    alignSelf: 'flex-start',
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerOutlineLabel: { fontSize: 16, fontWeight: '700', color: Brand.danger },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: Brand.asphalt, borderColor: Brand.asphalt },
  chipLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  chipLabelOn: { color: '#FFFFFF' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14 },
  linkLabel: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  warning: { backgroundColor: '#FBEACC', borderColor: '#F1D5A3' },
  warningTitle: { fontSize: 16, fontWeight: '700', color: '#7A4508' },
  warningText: { fontSize: 15, lineHeight: 22, color: '#7A4508' },
});
