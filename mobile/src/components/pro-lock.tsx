// What a free account sees in place of a Pro feature: the web ProGate's
// badge, name and description. Deliberately no price, button or link -
// the app doesn't sell Pro or point anyone to where it's sold.
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Card } from '@/components/screen';
import { Brand } from '@/constants/brand';

export function ProLock({ feature, description }: { feature: string; description: string }) {
  return (
    <Card style={styles.card}>
      <View style={styles.badge}>
        <Icon name="lock" size={12} color="#7A4508" strokeWidth={2.4} />
        <Text style={styles.badgeText}>Pro</Text>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {feature}
      </Text>
      <Text style={styles.body}>{description}</Text>
      <Text style={styles.note}>One Pro subscription unlocks every locked feature across RoadVerdict together, not just this one.</Text>
    </Card>
  );
}

// A stat that's Pro: its name with a lock where the figure would be.
export function LockedValue() {
  return (
    <View style={styles.locked} accessible accessibilityLabel="Pro only">
      <Icon name="lock" size={14} color={Brand.muted} strokeWidth={2.4} />
      <Text style={styles.lockedText}>Pro</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, backgroundColor: '#FBEACC' },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#7A4508' },
  title: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  body: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  note: { fontSize: 13, lineHeight: 19, color: Brand.muted },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 30 },
  lockedText: { fontSize: 15, fontWeight: '700', color: Brand.muted },
});
