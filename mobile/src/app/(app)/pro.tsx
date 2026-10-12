// Upgrade to Pro inside the app: the plans as the store prices them, the
// store's own payment sheet, and Restore purchases. Shown only while in-app
// buying is switched on (lib/purchases.ts); an account that already has Pro
// is told where it's managed instead - Google Play for one bought here, the
// website for one bought there - so nobody is offered a second subscription.
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/auth-ui';
import { Icon } from '@/components/icon';
import { Card, ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { API_BASE_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { buy, loadPlans, restore, usePurchases, type ProPlanOption } from '@/lib/purchases';

const STORE_NAME = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';
const MANAGE = Platform.OS === 'ios' ? 'Settings → your name → Subscriptions' : 'Google Play → Payments & subscriptions → Subscriptions';

export default function ProScreen() {
  const { token } = useAuth();
  const { config, error, reload } = usePurchases();
  const [plans, setPlans] = useState<ProPlanOption[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!config?.enabled || config.isPro) return;
    loadPlans(config)
      .then(setPlans)
      .catch(() => setPlans([]));
  }, [config]);

  async function onBuy(option: ProPlanOption) {
    if (!config || busy) return;
    setBusy(option.id);
    setMessage(null);
    const result = await buy(config, option, token);
    setBusy(null);
    if (result.kind === 'error') setMessage(result.message);
    if (result.kind === 'done') {
      setMessage(result.isPro ? 'You’re on Pro – thank you!' : 'Payment received. Pro will switch on within a few minutes.');
      reload();
    }
  }

  async function onRestore() {
    if (!config || busy) return;
    setBusy('restore');
    setMessage(null);
    const result = await restore(config, token);
    setBusy(null);
    if (result.kind === 'error') setMessage(result.message);
    if (result.kind === 'done') {
      setMessage(result.isPro ? 'Your Pro subscription is restored.' : `No Pro subscription found on this ${STORE_NAME} account.`);
      reload();
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          RoadVerdict Pro
        </Text>
      </View>

      {!config && !error ? (
        <LoadingState />
      ) : error && !config ? (
        <ErrorState message={error} onRetry={reload} />
      ) : config?.isPro ? (
        <View style={styles.pad}>
          <Card style={styles.card}>
            <Text style={styles.big}>You’re on Pro.</Text>
            <Text style={styles.text}>
              {config.proSource === 'store'
                ? `It’s billed through ${STORE_NAME}. To change or cancel it: ${MANAGE}.`
                : 'It’s billed through the RoadVerdict website, where you can change or cancel it.'}
            </Text>
          </Card>
        </View>
      ) : !config?.enabled ? (
        <View style={styles.pad}>
          <Card style={styles.card}>
            <Text style={styles.text}>Pro isn’t available to buy in the app yet.</Text>
          </Card>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.pad}>
          <Card style={styles.card}>
            <Text style={styles.section}>What Pro adds</Text>
            {(config.features ?? []).map((f) => (
              <View key={f} style={styles.feature}>
                <Icon name="check" size={18} color="#1A6B4A" strokeWidth={2.6} />
                <Text style={[styles.text, styles.flex]}>{f}</Text>
              </View>
            ))}
          </Card>

          {plans === null ? (
            <ActivityIndicator color={Brand.ink} style={styles.spinner} />
          ) : plans.length === 0 ? (
            <Text style={styles.note}>Plans couldn’t be loaded from {STORE_NAME}. Please try again later.</Text>
          ) : (
            plans.map((p) => (
              <Card key={p.id} style={styles.card}>
                <Text style={styles.planTitle}>{p.title}</Text>
                <Text style={styles.price}>
                  {p.price}
                  {p.period ? <Text style={styles.period}> {p.period}</Text> : null}
                </Text>
                <PrimaryButton label={`Choose ${p.title.toLowerCase()}`} onPress={() => onBuy(p)} busy={busy === p.id} disabled={!!busy} />
              </Card>
            ))
          )}

          {message ? (
            <Text style={styles.message} accessibilityRole="alert">
              {message}
            </Text>
          ) : null}

          <Pressable onPress={onRestore} disabled={!!busy} accessibilityRole="button" style={styles.restore} hitSlop={6}>
            <Text style={styles.restoreText}>{busy === 'restore' ? 'Restoring…' : 'Restore purchases'}</Text>
          </Pressable>

          {/* The subscription terms the stores require shown before buying. */}
          <Text style={styles.note}>
            Payment is taken by {STORE_NAME} when you confirm. Pro renews automatically at the same price for the same period unless
            you cancel at least 24 hours before the period ends. Manage or cancel any time: {MANAGE}. Pro bought here also unlocks
            Pro on the RoadVerdict website when you sign in with this email.
          </Text>
          <Pressable onPress={() => WebBrowser.openBrowserAsync(`${API_BASE_URL}/privacy`)} accessibilityRole="link" hitSlop={6}>
            <Text style={styles.link}>Privacy policy</Text>
          </Pressable>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  pad: { padding: 20, paddingTop: 8, paddingBottom: 40, gap: 12 },
  card: { padding: 16, gap: 10 },
  big: { fontSize: 20, fontWeight: '800', color: Brand.ink },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  section: { fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: Brand.muted },
  feature: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  planTitle: { fontSize: 17, fontWeight: '700', color: Brand.ink },
  price: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  period: { fontSize: 16, fontWeight: '600', color: Brand.muted },
  spinner: { marginVertical: 20 },
  message: { fontSize: 15, lineHeight: 22, color: Brand.ink, fontWeight: '600' },
  restore: { alignSelf: 'center', paddingVertical: 10 },
  restoreText: { fontSize: 15, fontWeight: '700', color: Brand.amberInk },
  note: { fontSize: 12, lineHeight: 18, color: Brand.muted },
  link: { fontSize: 13, fontWeight: '700', color: Brand.amberInk, textDecorationLine: 'underline' },
});
