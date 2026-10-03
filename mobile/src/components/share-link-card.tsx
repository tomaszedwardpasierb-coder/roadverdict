// One shareable link, as the website's Shareable Links tab lists it - who
// it's for, the asking price, when it stops working - with the same
// actions: share it (through the phone's own share sheet, which can also
// copy it), keep it working for longer, set or change the asking price,
// or delete it.
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Card } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { KEYBOARD_DONE_ID } from '@/components/keyboard-done';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { DURATIONS, formatDay, formatPounds, linkRoute, parseAskingPrice, type ShareDuration, type ShareLink } from '@/lib/share-links';
import type { GarageVehicle } from '@/lib/vehicle';

// Just the address, so "Copy" in the share sheet copies the link itself
// and chat apps can show their own preview of it.
export function shareLinkUrl(url: string) {
  Share.share({ message: url }, { dialogTitle: 'Share your report link' }).catch(() => {});
}

export function ShareLinkCard({ link, vehicle, onChanged }: { link: ShareLink; vehicle: GarageVehicle; onChanged: () => void }) {
  const { token, signOut } = useAuth();
  const [mode, setMode] = useState<'idle' | 'extend' | 'price'>('idle');
  const [duration, setDuration] = useState<ShareDuration>('1month');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const route = linkRoute(vehicle, link.token);
  const parsedPrice = parseAskingPrice(price);

  async function send(path: string, method: 'POST' | 'DELETE', body?: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    const result = await apiFetch(path, { method, token, body });
    setBusy(false);
    if (result.ok) return true;
    if (result.status === 401) await signOut();
    else setError(result.error);
    return false;
  }

  async function extend() {
    if (busy) return;
    if (await send(`${route}/extend`, 'POST', { duration })) {
      setMode('idle');
      onChanged();
    }
  }

  async function savePrice() {
    if (busy || parsedPrice === undefined) return;
    if (await send(`${route}/asking-price`, 'POST', { askingPrice: parsedPrice })) {
      setMode('idle');
      onChanged();
    }
  }

  function confirmDelete() {
    Alert.alert('Delete this link?', 'It stops working straight away, any receipt requests made through it are removed, and it can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (await send(route, 'DELETE')) onChanged();
        },
      },
    ]);
  }

  function editPrice() {
    setPrice(link.askingPrice != null ? String(link.askingPrice) : '');
    setError(null);
    setMode('price');
  }

  const validity = link.expiresAt ? `${link.expired ? 'Expired' : 'Valid until'} ${formatDay(link.expiresAt)}` : 'Never expires';

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.recipient} numberOfLines={1}>
          {link.recipientEmail ? `Shared with ${link.recipientEmail}` : 'Shared link'}
        </Text>
        {link.expired ? (
          <View style={styles.expired}>
            <Text style={styles.expiredText}>Expired</Text>
          </View>
        ) : null}
      </View>
      {link.askingPrice != null ? <Text style={styles.meta}>Asking price {formatPounds(link.askingPrice)}</Text> : null}
      <Text style={styles.meta}>
        Created {formatDay(link.createdAt)} · {validity}
      </Text>
      <Text style={styles.url} numberOfLines={1} ellipsizeMode="middle" selectable>
        {link.url}
      </Text>

      {mode === 'extend' ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>{link.expired ? 'Make it work again for' : 'Keep it working for'}</Text>
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
          <Text style={styles.hint}>Counted from today. After that the link stops working and is deleted.</Text>
          <PanelButtons saveLabel="Extend" busy={busy} onSave={extend} onCancel={() => setMode('idle')} />
        </View>
      ) : mode === 'price' ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel} nativeID={`price-${link.token}`}>
            Asking price (£)
          </Text>
          <TextInput
            accessibilityLabelledBy={`price-${link.token}`}
            value={price}
            onChangeText={(t) => setPrice(t.replace(/[^\d.]/g, ''))}
            keyboardType="decimal-pad"
            inputAccessoryViewID={KEYBOARD_DONE_ID}
            placeholder="e.g. 3200"
            placeholderTextColor="#A7A49C"
            style={styles.input}
          />
          <Text style={styles.hint}>{parsedPrice === undefined ? 'Enter a price up to £200,000.' : 'Leave it blank to take the price off this link.'}</Text>
          <PanelButtons saveLabel="Save price" busy={busy} disabled={parsedPrice === undefined} onSave={savePrice} onCancel={() => setMode('idle')} />
        </View>
      ) : (
        <View style={styles.actions}>
          {!link.expired ? <Action label="Share" icon="share" onPress={() => shareLinkUrl(link.url)} /> : null}
          <Action label="Extend" onPress={() => setMode('extend')} disabled={busy} />
          <Action label={link.askingPrice != null ? 'Edit price' : 'Add price'} onPress={editPrice} disabled={busy} />
          <Action label={busy ? 'Deleting…' : 'Delete'} danger onPress={confirmDelete} disabled={busy} />
        </View>
      )}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

function Action({ label, icon, danger, disabled, onPress }: { label: string; icon?: IconName; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.action, disabled && styles.dim, pressed && { opacity: 0.85 }]}>
      {icon ? <Icon name={icon} size={18} color={Brand.ink} /> : null}
      <Text style={[styles.actionLabel, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

function PanelButtons({ saveLabel, busy, disabled, onSave, onCancel }: { saveLabel: string; busy: boolean; disabled?: boolean; onSave: () => void; onCancel: () => void }) {
  const inactive = busy || !!disabled;
  return (
    <View style={styles.panelButtons}>
      <Pressable
        onPress={onSave}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityState={{ disabled: inactive, busy }}
        style={({ pressed }) => [styles.save, inactive && styles.dim, pressed && { opacity: 0.85 }]}>
        {busy ? <ActivityIndicator color={Brand.asphalt} /> : <Text style={styles.saveLabel}>{saveLabel}</Text>}
      </Pressable>
      <Pressable onPress={onCancel} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}>
        <Text style={styles.actionLabel}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recipient: { flex: 1, fontSize: 16, fontWeight: '700', color: Brand.ink },
  expired: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#F8E6E3' },
  expiredText: { fontSize: 12, fontWeight: '700', color: Brand.danger },
  meta: { fontSize: 14, color: Brand.muted },
  url: { fontSize: 13, color: Brand.ink, fontFamily: 'monospace' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  action: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionLabel: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  danger: { color: Brand.danger },
  dim: { opacity: 0.5 },
  panel: { gap: 8, marginTop: 8 },
  panelLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  chipOn: { backgroundColor: Brand.asphalt, borderColor: Brand.asphalt },
  chipLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  chipLabelOn: { color: '#FFFFFF' },
  hint: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    fontSize: 17,
    color: Brand.ink,
  },
  panelButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  save: { minHeight: 44, paddingHorizontal: 18, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 15, fontWeight: '700', color: Brand.asphalt },
  error: { fontSize: 14, lineHeight: 20, color: Brand.danger },
});
