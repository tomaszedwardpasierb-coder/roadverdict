// Shared pieces for the signed-in (light) screens.
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/brand';

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="link" hitSlop={10} style={styles.sectionAction}>
          <Text style={styles.sectionActionLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function StatusPill({ status }: { status: 'ok' | 'due-soon' | 'overdue' }) {
  const look = status === 'overdue' ? pill.overdue : status === 'due-soon' ? pill.soon : pill.ok;
  const label = status === 'overdue' ? 'Overdue' : status === 'due-soon' ? 'Due soon' : 'On track';
  return (
    <View style={[pill.base, look.box]}>
      <Text style={[pill.text, look.text]}>{label}</Text>
    </View>
  );
}

export function LoadingState() {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={Brand.amberInk} size="large" accessibilityLabel="Loading" />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.centered}>
      <Text style={styles.errorText}>{message}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}>
        <Text style={styles.retryLabel}>Try again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Brand.paperRaised, borderRadius: 14, borderWidth: 1, borderColor: Brand.line },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: Brand.muted },
  sectionAction: { minHeight: 44, justifyContent: 'center' },
  sectionActionLabel: { fontSize: 15, fontWeight: '600', color: Brand.amberInk },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  errorText: { fontSize: 16, color: Brand.ink, textAlign: 'center', lineHeight: 24 },
  retry: { height: 48, paddingHorizontal: 24, borderRadius: 12, backgroundColor: Brand.asphalt, justifyContent: 'center' },
  retryLabel: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});

const pill = {
  ...StyleSheet.create({
    base: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
    text: { fontSize: 12, fontWeight: '700' },
  }),
  overdue: StyleSheet.create({ box: { backgroundColor: '#F8E6E3' }, text: { color: Brand.danger } }),
  soon: StyleSheet.create({ box: { backgroundColor: '#FBEACC' }, text: { color: '#7A4508' } }),
  ok: StyleSheet.create({ box: { backgroundColor: '#DEEFE6' }, text: { color: '#1A6B4A' } }),
};
