// One logbook entry, as shown in Home's "Recent" card and the Logbook -
// tappable when it opens the entry screen.
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Brand } from '@/constants/brand';

export type EntryCategory = 'service' | 'fuel' | 'mods' | 'bills' | 'labour' | 'fines' | 'tolls';

export type LogEntry = {
  id: string;
  category: EntryCategory;
  type: string;
  description: string;
  date: string;
  costLabel: string;
  mileageLabel: string | null;
  needsReview: boolean;
  attachmentCount: number;
};

export const CATEGORY_LOOK: Record<EntryCategory, { icon: IconName; tint: string; ink: string }> = {
  fuel: { icon: 'fuel', tint: '#FBEACC', ink: '#7A4508' },
  service: { icon: 'wrench', tint: '#E9ECFB', ink: '#3A4DA6' },
  mods: { icon: 'part', tint: '#EDEAE3', ink: '#3A3C42' },
  bills: { icon: 'bill', tint: '#DEEFE6', ink: '#1A6B4A' },
  labour: { icon: 'labour', tint: '#F8E6E3', ink: Brand.danger },
  fines: { icon: 'bill', tint: '#F8E6E3', ink: Brand.danger },
  tolls: { icon: 'gauge', tint: '#EDEAE3', ink: '#3A3C42' },
};

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function EntryRow({ entry, divider, onPress }: { entry: LogEntry; divider?: boolean; onPress?: () => void }) {
  const look = CATEGORY_LOOK[entry.category];
  const meta = [shortDate(entry.date), entry.mileageLabel, entry.attachmentCount > 0 ? 'Receipt attached' : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && styles.pressed]}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Opens the entry' : undefined}
      accessibilityLabel={`${entry.type}: ${entry.description}, ${entry.costLabel}, ${meta}${entry.needsReview ? ', scanned, needs checking' : ''}`}>
      <View style={[styles.badge, { backgroundColor: look.tint }]}>
        <Icon name={look.icon} size={20} color={look.ink} />
      </View>
      <View style={styles.main}>
        <Text style={styles.title} numberOfLines={1}>
          {entry.description}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
        {entry.needsReview ? (
          <View style={styles.review}>
            <Text style={styles.reviewText}>Scanned - check details</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.amount}>{entry.costLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, paddingHorizontal: 14, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  pressed: { backgroundColor: '#F7F5F0' },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  meta: { fontSize: 13, color: Brand.muted },
  review: { alignSelf: 'flex-start', marginTop: 3, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: '#FBEACC' },
  reviewText: { fontSize: 11, fontWeight: '700', color: '#7A4508' },
  amount: { fontSize: 15, fontWeight: '600', color: Brand.ink },
});
