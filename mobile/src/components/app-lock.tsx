// What a locked app shows: nothing of the account, just the unlock.
// The phone's own fingerprint/face/PIN prompt opens straight away; if
// that's not possible, signing out and back in is the way in.
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Brand } from '@/constants/brand';
import { useAppLock } from '@/lib/app-lock';
import { useAuth } from '@/lib/auth';

export function AppLockScreen() {
  const { unlock } = useAppLock();
  const { signOut } = useAuth();
  const [failed, setFailed] = useState(false);

  async function tryUnlock() {
    setFailed(!(await unlock()));
  }

  // Prompt straight away, once.
  useEffect(() => {
    tryUnlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.icon}>
          <Icon name="lock" size={30} color={Brand.asphalt} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          RoadVerdict is locked
        </Text>
        <Text style={styles.text}>Unlock with your fingerprint, face or phone PIN.</Text>
        {failed ? <Text style={styles.failed}>That didn’t unlock it. Try again.</Text> : null}
        <Pressable onPress={tryUnlock} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryLabel}>Unlock</Text>
        </Pressable>
        <Pressable onPress={signOut} accessibilityRole="button" hitSlop={6} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>Sign out and sign in again instead</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: Brand.asphalt, zIndex: 100 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  icon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', textAlign: 'center' },
  text: { fontSize: 16, lineHeight: 23, color: Brand.mutedOnDark, textAlign: 'center' },
  failed: { fontSize: 15, color: Brand.dangerOnDark, textAlign: 'center' },
  primary: { alignSelf: 'stretch', height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
  textButton: { minHeight: 44, justifyContent: 'center' },
  textButtonLabel: { fontSize: 15, fontWeight: '600', color: Brand.amber },
});
