import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Card, SectionHeader } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { API_BASE_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { versionLabel, updateLabel } from '@/lib/version';

// Everything outside the four main tabs, each row with its own icon so the
// list is quick to scan. Each feature appears once: the AI assistant is the
// Ask button on Home, the privacy policy lives here rather than in Settings.
type Row = { label: string; icon: IconName; open: () => void };

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Garage',
    rows: [
      { label: 'Add a vehicle', icon: 'plus', open: () => router.push('/add-vehicle') },
      { label: 'Compare vehicles', icon: 'compare', open: () => router.push('/compare') },
    ],
  },
  {
    title: 'Tools',
    rows: [
      { label: 'Quote checker', icon: 'quote', open: () => router.push('/quote') },
      { label: 'Cost calculator', icon: 'calculator', open: () => router.push('/costs') },
      { label: 'MPG calculator', icon: 'fuel', open: () => router.push('/fuel-economy') },
      { label: 'Buying guide', icon: 'search', open: () => router.push('/buying') },
    ],
  },
  {
    title: 'Insights',
    rows: [
      { label: 'Reports', icon: 'chart', open: () => router.push('/reports') },
      { label: 'The story so far', icon: 'story', open: () => router.push('/story') },
    ],
  },
  {
    title: 'Selling',
    rows: [
      { label: 'Shareable links', icon: 'link', open: () => router.push('/share-links') },
      { label: 'Transfer ownership', icon: 'transfer', open: () => router.push('/transfer') },
    ],
  },
  { title: 'Documents', rows: [{ label: 'The Vault', icon: 'lock', open: () => router.push('/vault') }] },
  {
    title: 'Account',
    rows: [
      { label: 'Settings', icon: 'settings', open: () => router.push('/settings') },
      { label: 'Privacy policy', icon: 'shield', open: () => WebBrowser.openBrowserAsync(`${API_BASE_URL}/privacy`) },
    ],
  },
];

export default function MoreScreen() {
  const { email, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const account = useApi<{ isPro: boolean }>('/api/app/account');
  const plan = account.data ? (account.data.isPro ? 'Pro' : 'Free plan') : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          More
        </Text>

        <Card style={styles.account}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>{(email ?? '?').charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {email}
            </Text>
            {plan ? (
              <View style={[styles.plan, account.data?.isPro && styles.planPro]}>
                <Text style={[styles.planText, account.data?.isPro && styles.planTextPro]}>{plan}</Text>
              </View>
            ) : null}
          </View>
        </Card>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <SectionHeader title={section.title} />
            <Card>
              {section.rows.map((row, i) => (
                <Pressable
                  key={row.label}
                  onPress={row.open}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { opacity: 0.85 }]}>
                  <View style={styles.rowIcon}>
                    <Icon name={row.icon} size={20} color={Brand.amberInk} />
                  </View>
                  <Text style={[styles.rowTitle, styles.flex]}>{row.label}</Text>
                  <Icon name="chevronRight" size={20} color={Brand.muted} />
                </Pressable>
              ))}
            </Card>
          </View>
        ))}

        <Pressable
          onPress={async () => {
            setSigningOut(true);
            await signOut();
          }}
          disabled={signingOut}
          accessibilityRole="button"
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.85 }]}>
          <Icon name="logout" size={18} color={Brand.danger} />
          <Text style={styles.signOutLabel}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>

        {/* A long press shows which over-the-air update is running - for
            testing, out of everyone's way. */}
        <Pressable onLongPress={() => setShowUpdate((v) => !v)} accessibilityRole="text">
          <Text style={styles.version}>{showUpdate ? updateLabel() : versionLabel()}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  version: { fontSize: 12, color: Brand.muted, textAlign: 'center', marginTop: 4 },
  safe: { flex: 1, backgroundColor: Brand.paper },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32, gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: Brand.ink },
  flex: { flex: 1 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 18, fontWeight: '700', color: Brand.asphalt },
  section: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14 },
  divider: { borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  rowTitle: { fontSize: 16, fontWeight: '500', color: Brand.ink },
  rowIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: '#FBF4E8', alignItems: 'center', justifyContent: 'center' },
  plan: { alignSelf: 'flex-start', marginTop: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, backgroundColor: '#EDEAE3' },
  planPro: { backgroundColor: Brand.amber },
  planText: { fontSize: 12, fontWeight: '700', color: '#3A3C42' },
  planTextPro: { color: Brand.asphalt },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
  },
  signOutLabel: { fontSize: 16, fontWeight: '600', color: Brand.danger },
});
