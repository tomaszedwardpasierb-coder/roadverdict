// The drafts the assistant hands back, as the website's chat shows them:
// nothing is saved until the owner taps to confirm, and then it goes
// through the same route, with the same body, as the website's own card.
// To change a draft, the owner just tells the assistant - it drafts again.
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { shareLinkUrl } from '@/components/share-link-card';
import { Brand } from '@/constants/brand';
import {
  entryBody,
  entryHasMileage,
  entryRoute,
  entryTitle,
  isMileageWarning,
  settingsBody,
  settingsLines,
  settingsRoute,
  type ProposedEntry,
  type ProposedFeedback,
  type ProposedSettingsChange,
  type ProposedShareLink,
} from '@/lib/assistant';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { createLinkRoute, DURATIONS, formatDay, formatPounds } from '@/lib/share-links';
import { useVehicle, vehicleHeaders, type GarageVehicle } from '@/lib/vehicle';

type Line = { label: string; value: string };

function Draft({
  title,
  lines,
  note,
  action,
  busy,
  error,
  done,
  onConfirm,
  extra,
}: {
  title: string;
  lines: Line[];
  note?: string;
  action: string;
  busy: boolean;
  error: string | null;
  done: string | null;
  onConfirm: () => void;
  extra?: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {lines.map((line) => (
        <View key={line.label} style={styles.line}>
          <Text style={styles.lineLabel}>{line.label}</Text>
          <Text style={styles.lineValue}>{line.value}</Text>
        </View>
      ))}
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {done ? (
        <View style={styles.done}>
          <Icon name="check" size={18} color="#1A6B4A" />
          <Text style={styles.doneText}>{done}</Text>
        </View>
      ) : (
        <>
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Pressable
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
            style={({ pressed }) => [styles.confirm, busy && styles.dim, pressed && { opacity: 0.85 }]}>
            {busy ? <ActivityIndicator color={Brand.asphalt} /> : <Text style={styles.confirmLabel}>{action}</Text>}
          </Pressable>
        </>
      )}
      {extra}
    </View>
  );
}

// One confirm-and-send, with the app's usual sign-out on a 401.
function useConfirm() {
  const { token, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send<T>(path: string, method: 'POST' | 'PATCH', body: unknown, vehicle?: GarageVehicle | null): Promise<T | null> {
    setBusy(true);
    setError(null);
    const result = await apiFetch<T>(path, { method, token, body, headers: vehicle ? vehicleHeaders(vehicle) : undefined });
    setBusy(false);
    if (result.ok) return result.data;
    if (result.status === 401) await signOut();
    else setError(result.error);
    return null;
  }
  return { busy, error, send };
}

function day(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDay(`${iso}T12:00:00Z`) : iso;
}

export function EntryDraft({ entry }: { entry: ProposedEntry }) {
  const { selected, refresh } = useVehicle();
  const { busy, error, send } = useConfirm();
  const [done, setDone] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const lines: Line[] = [];
  if ('description' in entry && entry.description) lines.push({ label: 'What', value: entry.description });
  if (entry.category === 'fuel') {
    if (entry.kwh !== undefined) lines.push({ label: 'Charged', value: `${entry.kwh} kWh` });
    else lines.push({ label: 'Fuel', value: `${entry.litres ?? 0} litres${entry.filledToFull ? ', filled to full' : ''}` });
  }
  lines.push({ label: 'Cost', value: formatPounds(entry.cost) });
  lines.push({ label: 'Date', value: day(entry.date) });
  if (entryHasMileage(entry) && entry.mileage != null) lines.push({ label: 'Mileage', value: `${entry.mileage.toLocaleString('en-GB')} mi` });

  const mileageProblem = !!error && entryHasMileage(entry) && isMileageWarning(error) && !acknowledged;

  async function save(ack: boolean) {
    if (ack) setAcknowledged(true);
    const saved = await send(entryRoute(entry), entry.entryId ? 'PATCH' : 'POST', entryBody(entry, ack || acknowledged), selected);
    if (saved === null) return;
    setDone(entry.entryId ? 'Updated in your logbook' : 'Saved to your logbook');
    refresh();
  }

  return (
    <Draft
      title={entryTitle(entry)}
      lines={lines}
      action={entry.entryId ? 'Save the change' : 'Save to logbook'}
      busy={busy}
      error={error}
      done={done}
      onConfirm={() => save(false)}
      note={done ? undefined : 'Not quite right? Tell the assistant what to change.'}
      extra={
        mileageProblem && !done ? (
          <Pressable onPress={() => save(true)} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}>
            <Text style={styles.secondaryLabel}>The mileage is right - save anyway</Text>
          </Pressable>
        ) : null
      }
    />
  );
}

export function ShareLinkDraft({ link }: { link: ProposedShareLink }) {
  const { selected } = useVehicle();
  const { busy, error, send } = useConfirm();
  const [url, setUrl] = useState<string | null>(null);
  const lines: Line[] = [
    { label: 'Sharing with', value: link.recipientEmail },
    { label: 'Works for', value: DURATIONS.find((d) => d.value === link.duration)?.label ?? link.duration },
  ];
  if (link.askingPrice != null) lines.push({ label: 'Asking price', value: formatPounds(link.askingPrice) });

  async function create() {
    if (!selected) return;
    const made = await send<{ url: string }>(
      createLinkRoute(selected),
      'POST',
      { duration: link.duration, recipientEmail: link.recipientEmail, ...(link.askingPrice != null ? { askingPrice: link.askingPrice } : {}) },
      selected
    );
    if (made) setUrl(made.url);
  }

  return (
    <Draft
      title="New shareable link"
      lines={lines}
      action="Create the link"
      busy={busy}
      error={error}
      done={url ? 'Link created - manage it under More, Shareable links' : null}
      onConfirm={create}
      extra={
        url ? (
          <Pressable onPress={() => shareLinkUrl(url)} accessibilityRole="button" style={({ pressed }) => [styles.secondary, styles.row, pressed && { opacity: 0.85 }]}>
            <Icon name="share" size={18} color={Brand.ink} />
            <Text style={styles.secondaryLabel}>Share it</Text>
          </Pressable>
        ) : null
      }
    />
  );
}

export function SettingsDraft({ change }: { change: ProposedSettingsChange }) {
  const { selected, refresh } = useVehicle();
  const { busy, error, send } = useConfirm();
  const [done, setDone] = useState<string | null>(null);

  async function apply() {
    const saved = await send(settingsRoute(change.vehicleKind), 'PATCH', settingsBody(change), selected);
    if (saved === null) return;
    setDone('Settings changed');
    refresh();
  }

  return <Draft title="Change settings" lines={settingsLines(change)} action="Apply" busy={busy} error={error} done={done} onConfirm={apply} />;
}

const FEEDBACK_LABELS: Record<ProposedFeedback['feedbackType'], string> = { feature: 'Idea', bug: 'Something’s wrong', other: 'Feedback' };

export function FeedbackDraft({ feedback }: { feedback: ProposedFeedback }) {
  const { busy, error, send } = useConfirm();
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    const sent = await send('/api/account/feedback', 'POST', { type: feedback.feedbackType, message: feedback.message, attachments: [], source: 'assistant' });
    if (sent !== null) setDone('Sent to the RoadVerdict team - thank you');
  }

  return (
    <Draft
      title={`Send to RoadVerdict: ${FEEDBACK_LABELS[feedback.feedbackType]}`}
      lines={[{ label: 'Message', value: feedback.message }]}
      action="Send it"
      busy={busy}
      error={error}
      done={done}
      onConfirm={submit}
    />
  );
}

export function VaultDraftNote() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>The Vault</Text>
      <Text style={styles.note}>Add it in the Vault itself - More, then The Vault - where you pick the file and it's stored encrypted.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, marginTop: 8, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Brand.ink },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  lineLabel: { fontSize: 14, color: Brand.muted },
  lineValue: { flexShrink: 1, fontSize: 14, fontWeight: '600', color: Brand.ink, textAlign: 'right' },
  note: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  error: { fontSize: 14, lineHeight: 20, color: Brand.danger },
  confirm: { minHeight: 48, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  confirmLabel: { fontSize: 16, fontWeight: '700', color: Brand.asphalt },
  secondary: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  row: { flexDirection: 'row', gap: 8 },
  dim: { opacity: 0.5 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  doneText: { fontSize: 15, fontWeight: '600', color: '#1A6B4A' },
});
