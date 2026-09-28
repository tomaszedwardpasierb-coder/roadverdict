// A buyer's request to see receipts through one of the owner's links, as
// the website's Shareable Links tab shows it: each receipt they asked
// about, with its photo or PDF, and a choice for each - share it, don't
// (with an optional reason the buyer sees instead of the default
// message), or decide later.
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Receipts } from '@/components/receipts';
import { Card } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { decideRoute, formatDay, formatDayTime, type Decision, type ReceiptRequest } from '@/lib/share-links';

const CHOICES: { value: Decision; label: string }[] = [
  { value: 'approved', label: 'Share' },
  { value: 'declined', label: 'Don’t share' },
  { value: 'pending', label: 'Not yet' },
];

type Item = ReceiptRequest['items'][number];

export function ReceiptRequestCard({ request, onSaved }: { request: ReceiptRequest; onSaved: () => void }) {
  const { token, signOut } = useAuth();
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() => Object.fromEntries(request.items.map((i) => [i.entryId, i.status])));
  const [reasons, setReasons] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.items.filter((i) => i.reason).map((i) => [i.entryId, i.reason as string]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stillPending = request.items.filter((i) => i.status === 'pending');
  const alreadyDecided = request.items.filter((i) => i.status !== 'pending');
  const changed = request.items.filter((i) => decisions[i.entryId] !== i.status);

  async function save() {
    if (saving || changed.length === 0) return;
    // Only the items whose choice changed, as on the website - resending
    // an unchanged decision would move its "decided on" date to today.
    const pick = (decision: Decision) => changed.filter((i) => decisions[i.entryId] === decision).map((i) => i.entryId);
    const calls: { entryIds: string[]; decision: Decision; reason?: string }[] = [];
    if (pick('approved').length > 0) calls.push({ entryIds: pick('approved'), decision: 'approved' });
    // One at a time, since each can carry its own reason.
    for (const id of pick('declined')) calls.push({ entryIds: [id], decision: 'declined', reason: reasons[id]?.trim() || undefined });
    if (pick('pending').length > 0) calls.push({ entryIds: pick('pending'), decision: 'pending' });

    setSaving(true);
    setError(null);
    let failed = false;
    for (const body of calls) {
      const result = await apiFetch(decideRoute(request.id), { method: 'POST', token, body });
      if (result.ok) continue;
      if (result.status === 401) {
        await signOut();
        return;
      }
      failed = true;
    }
    setSaving(false);
    if (failed) setError('Not every decision could be saved. Please try again.');
    // Reload either way, so what's shown is what the server now has.
    onSaved();
  }

  function renderItem(item: Item, muted: boolean) {
    const decision = decisions[item.entryId];
    return (
      <View key={item.entryId} style={[styles.item, muted && styles.muted]}>
        <Text style={styles.itemTitle}>{item.description}</Text>
        {item.priorDecline ? (
          <Text style={styles.flag}>
            Asked again - you said no to this on {formatDay(item.priorDecline.decidedAt)}
            {item.priorDecline.reason ? ` (“${item.priorDecline.reason}”)` : ''}
          </Text>
        ) : null}
        {item.attachment ? <Receipts attachments={[item.attachment]} /> : <Text style={styles.note}>No preview - asked for before previews existed.</Text>}
        <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={`Share the receipt for ${item.description}?`}>
          {CHOICES.map((c) => (
            <Pressable
              key={c.value}
              onPress={() => setDecisions((prev) => ({ ...prev, [item.entryId]: c.value }))}
              accessibilityRole="radio"
              accessibilityState={{ selected: decision === c.value }}
              style={[styles.choice, decision === c.value && styles.choiceOn]}>
              <Text style={[styles.choiceLabel, decision === c.value && styles.choiceLabelOn]}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
        {decision === 'declined' ? (
          <TextInput
            value={reasons[item.entryId] ?? ''}
            onChangeText={(t) => setReasons((prev) => ({ ...prev, [item.entryId]: t }))}
            placeholder="Reason (optional) - the buyer sees this instead of the default message"
            placeholderTextColor="#A7A49C"
            accessibilityLabel="Reason for not sharing (optional)"
            multiline
            style={styles.reason}
          />
        ) : null}
      </View>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.from}>{request.buyerEmail ? `From ${request.buyerEmail}` : 'From a buyer viewing your report'}</Text>
      <Text style={styles.note}>{formatDayTime(request.createdAt)}</Text>
      {request.buyerMessage ? <Text style={styles.message}>“{request.buyerMessage}”</Text> : null}

      {stillPending.length > 0 && alreadyDecided.length > 0 ? <Text style={styles.group}>Still needs a decision</Text> : null}
      {stillPending.map((item) => renderItem(item, false))}
      {alreadyDecided.length > 0 ? <Text style={styles.group}>Already decided</Text> : null}
      {alreadyDecided.map((item) => renderItem(item, true))}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Pressable
        onPress={save}
        disabled={saving || changed.length === 0}
        accessibilityRole="button"
        accessibilityState={{ disabled: saving || changed.length === 0, busy: saving }}
        style={({ pressed }) => [styles.save, (saving || changed.length === 0) && styles.dim, pressed && { opacity: 0.85 }]}>
        {saving ? <ActivityIndicator color={Brand.asphalt} /> : <Text style={styles.saveLabel}>Save decisions</Text>}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8 },
  from: { fontSize: 16, fontWeight: '700', color: Brand.ink },
  note: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  message: { fontSize: 15, lineHeight: 22, color: Brand.ink, fontStyle: 'italic' },
  group: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: Brand.muted, marginTop: 8 },
  item: { gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  muted: { opacity: 0.75 },
  itemTitle: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  flag: { fontSize: 13, lineHeight: 18, color: '#7A4508' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  choiceOn: { borderColor: Brand.amber, backgroundColor: '#FBF4E8' },
  choiceLabel: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  choiceLabelOn: { color: '#7A4508' },
  reason: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Brand.ink,
    textAlignVertical: 'top',
  },
  error: { fontSize: 14, lineHeight: 20, color: Brand.danger },
  save: { height: 52, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveLabel: { fontSize: 16, fontWeight: '700', color: Brand.asphalt },
  dim: { opacity: 0.5 },
});
