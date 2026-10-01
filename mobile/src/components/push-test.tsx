// Settings' "Send me a test notification": registers this phone again
// (asking for permission if it was never given), sends a push to the
// owner's own phones, and says plainly which step failed if one did.
import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { registerForPush } from '@/lib/push';

type Outcome = { ok: boolean; text: string; openSettings?: boolean };

export function PushTest() {
  const { token } = useAuth();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function test() {
    setBusy(true);
    setOutcome(null);
    await registerForPush(token, true);
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      setBusy(false);
      setOutcome({ ok: false, text: 'Notifications are turned off for RoadVerdict on this phone. Turn them on in your phone’s settings, then try again.', openSettings: true });
      return;
    }
    const result = await apiFetch<{ registered: number; sent: number }>('/api/app/push-test', { method: 'POST', token });
    setBusy(false);
    if (!result.ok) return setOutcome({ ok: false, text: result.error });
    if (result.data.registered === 0)
      return setOutcome({ ok: false, text: 'This phone couldn’t register for notifications. Check it has Google Play services and a connection, then try again.' });
    if (result.data.sent === 0)
      return setOutcome({ ok: false, text: 'This phone is registered, but the notification couldn’t be sent. That points at the notification setup on RoadVerdict’s side, not your phone.' });
    setOutcome({ ok: true, text: 'Sent - it should appear on this phone in a few seconds.' });
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.text}>Reminders that come due, and news from RoadVerdict, arrive as notifications on this phone.</Text>
      <Pressable
        onPress={test}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        style={({ pressed }) => [styles.button, busy && styles.dim, pressed && { opacity: 0.85 }]}>
        {busy ? <ActivityIndicator color={Brand.ink} /> : <Text style={styles.buttonLabel}>Send me a test notification</Text>}
      </Pressable>
      {outcome ? (
        <View style={styles.outcome}>
          <Text style={outcome.ok ? styles.good : styles.bad} accessibilityRole={outcome.ok ? undefined : 'alert'}>
            {outcome.text}
          </Text>
          {outcome.openSettings ? (
            <Pressable onPress={() => Linking.openSettings()} accessibilityRole="button" hitSlop={6}>
              <Text style={styles.link}>Open phone settings</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  button: { minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  dim: { opacity: 0.5 },
  outcome: { gap: 6 },
  good: { fontSize: 14, lineHeight: 20, color: '#1A6B4A' },
  bad: { fontSize: 14, lineHeight: 20, color: Brand.danger },
  link: { fontSize: 15, fontWeight: '600', color: Brand.amberInk },
});
