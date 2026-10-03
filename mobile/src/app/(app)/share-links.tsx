// Shareable links: the website's Shareable Links tab for the selected
// vehicle. Make a link that shows a buyer its real history, send it
// through the phone's own share sheet (or have RoadVerdict email it),
// manage the links already made, and decide on buyers' requests to see
// receipts.
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ReceiptRequestCard } from '@/components/receipt-request-card';
import { Card, ErrorState, LoadingState, SectionHeader } from '@/components/screen';
import { ShareLinkCard, shareLinkUrl } from '@/components/share-link-card';
import { Brand } from '@/constants/brand';
import { KEYBOARD_DONE_ID } from '@/components/keyboard-done';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { createLinkRoute, DURATIONS, formatDay, linkRoute, parseAskingPrice, shareLinksPath, type ShareDuration, type ShareLinksData } from '@/lib/share-links';
import { useApi } from '@/lib/use-api';
import { useVehicle, vehicleHeaders, type GarageVehicle } from '@/lib/vehicle';

export default function ShareLinksScreen() {
  const { selected } = useVehicle();
  const data = useApi<ShareLinksData>(selected ? shareLinksPath(selected) : null);

  if (!selected) return null;
  const noun = selected.kind === 'bike' ? 'bike' : 'car';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Shareable links
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {[selected.name, selected.registration].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      {data.loading ? (
        <LoadingState />
      ) : data.error && !data.data ? (
        <ErrorState message={data.error} onRetry={data.retry} />
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="height">
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={data.refreshing} onRefresh={data.refresh} colors={[Brand.amberInk]} />}>
            <Text style={styles.intro}>
              Thinking of selling? A link shows a buyer exactly how this {noun} has been looked after – dates, costs, a real history, not
              just your word. Your personal details stay private, and receipts only appear if you agree when someone asks.
            </Text>

            {data.data && data.data.requests.length > 0 ? (
              <>
                <SectionHeader title={`Waiting on you (${data.data.requests.length})`} />
                <Text style={styles.note}>Buyers viewing your report have asked to see these receipts.</Text>
                {data.data.requests.map((r) => (
                  <ReceiptRequestCard key={r.id} request={r} onSaved={data.refresh} />
                ))}
              </>
            ) : null}

            <SectionHeader title="New link" />
            <NewLinkCard key={`${selected.kind}:${selected.id}`} vehicle={selected} onCreated={data.refresh} />

            <SectionHeader title="Your links" />
            {data.data && data.data.links.length > 0 ? (
              data.data.links.map((link) => <ShareLinkCard key={link.token} link={link} vehicle={selected} onChanged={data.refresh} />)
            ) : (
              <Text style={styles.note}>No links yet for this {noun}. Make one above when you’re ready to show what it’s really worth.</Text>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

type Created = { url: string; token: string; expiresAt: string | null; recipientEmail: string };

function NewLinkCard({ vehicle, onCreated }: { vehicle: GarageVehicle; onCreated: () => void }) {
  const { token, signOut } = useAuth();
  const [recipient, setRecipient] = useState('');
  const [duration, setDuration] = useState<ShareDuration>('1month');
  const [price, setPrice] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const email = recipient.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const parsedPrice = parseAskingPrice(price);
  const valid = emailValid && parsedPrice !== undefined;

  async function create() {
    if (!valid || creating) return;
    setCreating(true);
    setError(null);
    const result = await apiFetch<{ url: string; expiresAt: string | null; recipientEmail: string }>(createLinkRoute(vehicle), {
      method: 'POST',
      token,
      headers: vehicleHeaders(vehicle),
      body: { duration, recipientEmail: email, ...(parsedPrice != null ? { askingPrice: parsedPrice } : {}) },
    });
    setCreating(false);
    if (!result.ok) {
      if (result.status === 401) await signOut();
      else setError(result.error);
      return;
    }
    const { url, expiresAt, recipientEmail } = result.data;
    setCreated({ url, token: url.split('/').pop() ?? '', expiresAt, recipientEmail });
    setEmailStatus(null);
    onCreated();
  }

  async function sendEmail() {
    if (!created || emailing) return;
    setEmailing(true);
    setEmailStatus(null);
    const result = await apiFetch(`${linkRoute(vehicle, created.token)}/send-email`, { method: 'POST', token, body: { toEmail: created.recipientEmail } });
    setEmailing(false);
    if (result.ok) setEmailStatus({ ok: true, text: `Sent to ${created.recipientEmail}.` });
    else if (result.status === 401) await signOut();
    else setEmailStatus({ ok: false, text: result.error });
  }

  function startAgain() {
    setCreated(null);
    setRecipient('');
    setPrice('');
    setDuration('1month');
    setEmailStatus(null);
  }

  if (created) {
    return (
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Your link is ready</Text>
        <Text style={styles.url} selectable>
          {created.url}
        </Text>
        <Text style={styles.hint}>
          {created.expiresAt ? `Works until ${formatDay(created.expiresAt)}, then it’s deleted. ` : ''}You can extend it or change the price below any time.
        </Text>
        <Pressable onPress={() => shareLinkUrl(created.url)} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
          <Icon name="share" size={20} color={Brand.asphalt} />
          <Text style={styles.primaryLabel}>Share link</Text>
        </Pressable>
        <Pressable
          onPress={sendEmail}
          disabled={emailing || emailStatus?.ok === true}
          accessibilityRole="button"
          accessibilityState={{ disabled: emailing || emailStatus?.ok === true, busy: emailing }}
          style={({ pressed }) => [styles.secondary, (emailing || emailStatus?.ok === true) && styles.dim, pressed && { opacity: 0.85 }]}>
          {emailing ? <ActivityIndicator color={Brand.ink} /> : <Text style={styles.secondaryLabel}>Email it to {created.recipientEmail}</Text>}
        </Pressable>
        {emailStatus ? (
          <Text style={emailStatus.ok ? styles.hint : styles.error} accessibilityRole={emailStatus.ok ? undefined : 'alert'}>
            {emailStatus.text}
          </Text>
        ) : null}
        <Pressable onPress={startAgain} accessibilityRole="button" hitSlop={6} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>Make another link</Text>
        </Pressable>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.field}>
        <Text style={styles.label} nativeID="share-recipient">
          Sharing with
        </Text>
        <TextInput
          accessibilityLabelledBy="share-recipient"
          value={recipient}
          onChangeText={setRecipient}
          placeholder="buyer@example.com"
          placeholderTextColor="#A7A49C"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          style={styles.input}
        />
        <Text style={styles.hint}>Their email address – it’s who the link identifies if they ask you for a receipt through it.</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Link works for</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {DURATIONS.map((d) => (
            <Pressable
              key={d.value}
              onPress={() => setDuration(d.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: duration === d.value }}
              style={[styles.chip, duration === d.value && styles.chipOn]}>
              <Text style={[styles.chipLabel, duration === d.value && styles.chipLabelOn]}>{d.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>After that it stops working and is deleted – you can extend it any time before then.</Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label} nativeID="share-price">
          Asking price (£, optional)
        </Text>
        <TextInput
          accessibilityLabelledBy="share-price"
          value={price}
          onChangeText={(t) => setPrice(t.replace(/[^\d.]/g, ''))}
          keyboardType="decimal-pad"
          inputAccessoryViewID={KEYBOARD_DONE_ID}
          placeholder="e.g. 3200"
          placeholderTextColor="#A7A49C"
          style={styles.input}
        />
        <Text style={styles.hint}>
          {parsedPrice === undefined ? 'Enter a price up to £200,000, or leave it blank.' : 'Shown to the buyer with the history and upcoming costs. Leave it blank to keep it to yourself.'}
        </Text>
      </View>

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={create}
        disabled={!valid || creating}
        accessibilityRole="button"
        accessibilityState={{ disabled: !valid || creating, busy: creating }}
        style={({ pressed }) => [styles.primary, (!valid || creating) && styles.dim, pressed && valid && { opacity: 0.85 }]}>
        {creating ? <ActivityIndicator color={Brand.asphalt} /> : <Text style={styles.primaryLabel}>Create link</Text>}
      </Pressable>
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
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 12 },
  intro: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  note: { fontSize: 14, lineHeight: 20, color: Brand.muted },
  card: { padding: 16, gap: 16 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  url: { fontSize: 14, lineHeight: 20, color: Brand.ink, fontFamily: 'monospace' },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  chipOn: { backgroundColor: Brand.asphalt, borderColor: Brand.asphalt },
  chipLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  chipLabelOn: { color: '#FFFFFF' },
  error: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  primary: { height: 56, borderRadius: 12, backgroundColor: Brand.amber, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
  secondary: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 15, fontWeight: '600', color: Brand.ink, textAlign: 'center' },
  dim: { opacity: 0.5 },
  textButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  textButtonLabel: { fontSize: 15, fontWeight: '600', color: Brand.amberInk },
});
