// Where a free account can get Pro, in one place. When the app sells Pro
// itself (lib/purchases.ts), it's an "Upgrade to Pro" button and the
// website is never mentioned - Google only lets an app that sells nothing
// point to another place to pay. Otherwise it's the plain-words website
// line from lib/pro-on-web.ts (Android only). Until the setting has loaded
// it shows nothing, so neither flashes up and vanishes.
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Brand } from '@/constants/brand';
import { PRO_ON_WEB } from '@/lib/pro-on-web';
import { usePurchases } from '@/lib/purchases';

export function useProUpgrade() {
  const { config } = usePurchases();
  const loaded = !!config;
  const sellsInApp = !!config?.enabled;
  return {
    loaded,
    isPro: !!config?.isPro,
    // Show an Upgrade button.
    canUpgradeInApp: sellsInApp && !config?.isPro,
    // Or this plain line - never both.
    webLine: loaded && !sellsInApp && !config?.isPro ? PRO_ON_WEB : null,
  };
}

export function UpgradeButton({ label = 'Upgrade to Pro' }: { label?: string }) {
  return (
    <Pressable onPress={() => router.push('/pro')} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, borderRadius: 10, backgroundColor: Brand.amber, justifyContent: 'center', marginTop: 4 },
  pressed: { opacity: 0.85 },
  label: { fontSize: 15, fontWeight: '800', color: Brand.asphalt },
});
