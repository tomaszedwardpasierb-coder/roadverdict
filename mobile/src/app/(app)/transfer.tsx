// Transfer ownership: the website's tab for the selected vehicle. Offer
// it to a buyer's account (they get an email to accept, and nothing
// changes until they do), see an offer waiting on them, or answer a
// buyer who has asked for it. Once handed over, the vehicle moves to
// their account and this one keeps a read-only copy.
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Card, ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDay } from '@/lib/share-links';
import { incomingRoute, recordsNote, requestsForVehicle, transfersRoute, type TransferRequest } from '@/lib/transfers';
import { useApi } from '@/lib/use-api';
import { useVehicle, vehicleHeaders, type GarageVehicle } from '@/lib/vehicle';

type Outcome = { kind: 'handedOver'; to: string; includeRecords: boolean } | { kind: 'declined' };
type Notice = { ok: boolean; text: string };

export default function TransferScreen() {
  const { selected, refresh: refreshGarage } = useVehicle();
  const requests = useApi<{ requests: TransferRequest[] }>(selected && !selected.readOnly ? transfersRoute(selected) : null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  if (!selected) return null;
  const vehicle = selected;
  const noun = vehicle.kind === 'bike' ? 'bike' : 'car';
  const mine = requests.data ? requestsForVehicle(requests.data.requests, vehicle) : [];
  const incoming = mine.find((r) => r.initiatedBy === 'recipient') ?? null;
  const outgoing = mine.find((r) => r.initiatedBy === 'owner') ?? null;

  let body;
  if (outcome?.kind === 'handedOver') {
    body = (
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Handed over</Text>
        <Text style={styles.text}>
          This {noun} now belongs to {outcome.to}’s account, and your copy is read-only. {recordsNote(outcome.includeRecords, noun)}
        </Text>
      </Card>
    );
  } else if (vehicle.readOnly) {
    body = (
      <Card style={styles.card}>
        <Text style={styles.text}>This {noun} has already been transferred and can’t be offered again. You keep this read-only copy of its history.</Text>
      </Card>
    );
  } else if (requests.loading) {
    body = <LoadingState />;
  } else if (requests.error && !requests.data) {
    body = <ErrorState message={requests.error} onRetry={requests.retry} />;
  } else {
    body = (
      <>
        {notice ? (
          <Text style={notice.ok ? styles.notice : styles.error} accessibilityRole={notice.ok ? undefined : 'alert'}>
            {notice.text}
          </Text>
        ) : null}
        {incoming ? (
          <IncomingRequestCard
            key={incoming.id}
            request={incoming}
            vehicle={vehicle}
            noun={noun}
            onDone={(result) => {
              if (result.kind === 'handedOver') {
                setOutcome(result);
                refreshGarage();
              } else {
                setNotice({ ok: true, text: `Declined. Nothing has changed – this ${noun} is still fully yours.` });
              }
              requests.refresh();
            }}
          />
        ) : null}
        {outgoing ? (
          <Card style={styles.card}>
            <Text style={styles.cardTitle}>Waiting for {outgoing.recipientEmail} to accept</Text>
            <Text style={styles.text}>
              Offered {formatDay(outgoing.createdAt)}. Once they accept, this {noun} moves to their account and your copy becomes read-only.{' '}
              {recordsNote(outgoing.includeRecords !== false, noun)}
            </Text>
          </Card>
        ) : (
          <OfferCard
            vehicle={vehicle}
            noun={noun}
            onSent={(warning) => {
              setNotice(warning ? { ok: false, text: warning } : null);
              requests.refresh();
            }}
          />
        )}
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Transfer ownership
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {[vehicle.name, vehicle.registration].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior="height">
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            !vehicle.readOnly ? <RefreshControl refreshing={requests.refreshing} onRefresh={requests.refresh} colors={[Brand.amberInk]} /> : undefined
          }>
          {body}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RecordsSwitch({ value, onChange, noun }: { value: boolean; onChange: (v: boolean) => void; noun: string }) {
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <Text style={styles.label} nativeID="include-records">
          Include my records
        </Text>
        <Text style={styles.hint}>
          Service records, fuel logs, mods, bills and any attached receipts. Turn this off to send only the {noun}’s identity and a summary.
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabelledBy="include-records"
        trackColor={{ true: Brand.amber, false: Brand.line }}
        thumbColor={value ? Brand.asphalt : '#FFFFFF'}
      />
    </View>
  );
}

function OfferCard({ vehicle, noun, onSent }: { vehicle: GarageVehicle; noun: string; onSent: (warning?: string) => void }) {
  const { token, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [includeRecords, setIncludeRecords] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cleaned = email.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned);

  async function send() {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    const result = await apiFetch(transfersRoute(vehicle), {
      method: 'POST',
      token,
      headers: vehicleHeaders(vehicle),
      body: { recipientEmail: cleaned, includeRecords },
    });
    setSending(false);
    if (result.ok) {
      onSent();
      return;
    }
    if (result.status === 401) await signOut();
    // 502: the offer was made but its email didn't send. 409: an offer or
    // request is already in progress. Either way there's one to show now,
    // so the message goes up to the screen instead of staying with this form.
    else if (result.status === 502 || result.status === 409) onSent(result.error);
    else setError(result.error);
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.text}>
        Selling this {noun}? Hand the buyer its logged history instead of them starting from scratch - service records, mileage and
        documents carry on under their own account.
      </Text>
      <View style={styles.field}>
        <Text style={styles.label} nativeID="buyer-email">
          Buyer’s email
        </Text>
        <TextInput
          accessibilityLabelledBy="buyer-email"
          value={email}
          onChangeText={setEmail}
          placeholder="buyer@example.com"
          placeholderTextColor="#A7A49C"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          style={styles.input}
        />
      </View>
      <RecordsSwitch value={includeRecords} onChange={setIncludeRecords} noun={noun} />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={send}
        disabled={!valid || sending}
        accessibilityRole="button"
        accessibilityState={{ disabled: !valid || sending, busy: sending }}
        style={({ pressed }) => [styles.primary, (!valid || sending) && styles.dim, pressed && valid && { opacity: 0.85 }]}>
        {sending ? <ActivityIndicator color={Brand.asphalt} /> : <Text style={styles.primaryLabel}>Start handover</Text>}
      </Pressable>
      <Text style={styles.hint}>They’ll get an email asking them to accept. Nothing changes until they do.</Text>
    </Card>
  );
}

function IncomingRequestCard({
  request,
  vehicle,
  noun,
  onDone,
}: {
  request: TransferRequest;
  vehicle: GarageVehicle;
  noun: string;
  onDone: (outcome: Outcome) => void;
}) {
  const { token, signOut } = useAuth();
  const [includeRecords, setIncludeRecords] = useState(true);
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approve' | 'decline') {
    setBusy(decision);
    setError(null);
    const result = await apiFetch(incomingRoute(vehicle, request.id, decision), {
      method: 'POST',
      token,
      ...(decision === 'approve' ? { body: { includeRecords } } : {}),
    });
    setBusy(null);
    if (result.ok) {
      onDone(decision === 'approve' ? { kind: 'handedOver', to: request.recipientEmail, includeRecords } : { kind: 'declined' });
      return;
    }
    if (result.status === 401) await signOut();
    else setError(result.error);
  }

  // Handing over can't be undone, so it asks first.
  function confirmApprove() {
    Alert.alert(
      `Hand this ${noun} over?`,
      `It moves to ${request.recipientEmail}’s account straight away and your copy becomes read-only. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Hand over', style: 'destructive', onPress: () => decide('approve') },
      ]
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>{request.recipientEmail} has asked for this {noun}</Text>
      <Text style={styles.text}>
        Asked {formatDay(request.createdAt)}. If you’ve sold them this {noun}, approving hands over its logged history and makes your own copy
        read-only.
      </Text>
      <RecordsSwitch value={includeRecords} onChange={setIncludeRecords} noun={noun} />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <Pressable
          onPress={confirmApprove}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy !== null, busy: busy === 'approve' }}
          style={({ pressed }) => [styles.primary, styles.flex, busy !== null && styles.dim, pressed && { opacity: 0.85 }]}>
          {busy === 'approve' ? <ActivityIndicator color={Brand.asphalt} /> : <Text style={styles.primaryLabel}>Approve</Text>}
        </Pressable>
        <Pressable
          onPress={() => decide('decline')}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy !== null, busy: busy === 'decline' }}
          style={({ pressed }) => [styles.secondary, styles.flex, busy !== null && styles.dim, pressed && { opacity: 0.85 }]}>
          {busy === 'decline' ? <ActivityIndicator color={Brand.ink} /> : <Text style={styles.secondaryLabel}>Decline</Text>}
        </Pressable>
      </View>
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
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 12 },
  card: { padding: 16, gap: 16 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  notice: { fontSize: 15, lineHeight: 22, color: '#1A6B4A' },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.ink },
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
  hint: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  error: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  buttons: { flexDirection: 'row', gap: 10 },
  primary: { height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
  secondary: { height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { fontSize: 17, fontWeight: '600', color: Brand.ink },
  dim: { opacity: 0.5 },
});
