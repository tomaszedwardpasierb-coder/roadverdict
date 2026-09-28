import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Card, SectionHeader } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { API_BASE_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { versionLabel } from '@/lib/version';

// Everything outside the four main tabs. Rows that aren't built yet say
// "Soon" instead of opening an empty screen.
type Row = { label: string; later?: boolean; open?: () => void };

const SECTIONS: { title: string; rows: Row[] }[] = [
  { title: 'Garage', rows: [{ label: 'Add a vehicle', open: () => router.push('/add-vehicle') }] },
  { title: 'Tools', rows: [{ label: 'Quote checker', open: () => router.push('/quote') }, { label: 'Cost calculator', open: () => router.push('/costs') }, { label: 'Buying guide & plate check', open: () => router.push('/buying') }] },
  { title: 'Insights', rows: [{ label: 'Reports & charts', open: () => router.push('/reports') }, { label: 'The story so far', open: () => router.push('/story') }] },
  { title: 'Selling', rows: [{ label: 'Shareable links', open: () => router.push('/share-links') }, { label: 'Transfer ownership', open: () => router.push('/transfer') }] },
  { title: 'Documents', rows: [{ label: 'The Vault', later: true }] },
  {
    title: 'Account',
    rows: [
      { label: 'Settings', open: () => router.push('/settings') },
      { label: 'Privacy policy', open: () => WebBrowser.openBrowserAsync(`${API_BASE_URL}/privacy`) },
    ],
  },
];

export default function MoreScreen() {
  const { email, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

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
            <Text style={styles.rowMeta}>Manage your plan on roadverdict.co.uk</Text>
          </View>
        </Card>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <SectionHeader title={section.title} />
            <Card>
              {section.rows.map((row, i) =>
                row.open ? (
                  <Pressable
                    key={row.label}
                    onPress={row.open}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { opacity: 0.85 }]}>
                    <Text style={[styles.rowTitle, styles.flex]}>{row.label}</Text>
                    <Icon name="chevronRight" size={20} color={Brand.muted} />
                  </Pressable>
                ) : (
                  <View key={row.label} style={[styles.row, i > 0 && styles.divider]}>
                    <Text style={[styles.rowTitle, styles.flex, styles.dim]}>{row.label}</Text>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>{row.later ? 'Later' : 'Soon'}</Text>
                    </View>
                  </View>
                )
              )}
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
          <Icon name="close" size={18} color={Brand.danger} />
          <Text style={styles.signOutLabel}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>

        <Text style={styles.version}>{versionLabel()}</Text>
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
  dim: { color: Brand.muted },
  rowMeta: { fontSize: 13, color: Brand.muted, marginTop: 2 },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: '#EDEAE3' },
  pillText: { fontSize: 12, fontWeight: '700', color: '#3A3C42' },
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
