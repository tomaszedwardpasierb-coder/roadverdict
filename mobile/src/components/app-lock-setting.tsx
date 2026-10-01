// Settings' App lock choice. Turning it on or changing it asks for the
// fingerprint/PIN first (see app-lock.tsx), so it can't lock anyone out.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { APP_LOCK_OPTIONS, useAppLock, type AppLockSetting } from '@/lib/app-lock';

export function AppLockSetting() {
  const { setting, choose } = useAppLock();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(value: AppLockSetting) {
    if (busy || value === setting) return;
    setBusy(true);
    setError(null);
    const result = await choose(value);
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.text}>Ask for your fingerprint, face or phone PIN before RoadVerdict opens.</Text>
      <View style={styles.options} accessibilityRole="radiogroup">
        {APP_LOCK_OPTIONS.map((o) => (
          <Pressable
            key={o.value}
            onPress={() => pick(o.value)}
            disabled={busy}
            accessibilityRole="radio"
            accessibilityState={{ selected: setting === o.value, disabled: busy }}
            style={[styles.option, setting === o.value && styles.optionOn]}>
            <Text style={[styles.optionLabel, setting === o.value && styles.optionLabelOn]}>{o.label}</Text>
          </Pressable>
        ))}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  options: { gap: 8 },
  option: { minHeight: 48, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  optionOn: { borderColor: Brand.amber, backgroundColor: '#FBF4E8' },
  optionLabel: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  optionLabelOn: { color: '#7A4508' },
  error: { fontSize: 14, lineHeight: 20, color: Brand.danger },
});
