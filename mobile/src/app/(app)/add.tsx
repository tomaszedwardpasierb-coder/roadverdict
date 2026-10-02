import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Brand } from '@/constants/brand';

// The ⊕ sheet: every way of adding to the logbook (checking a quote lives
// on Home and in More - it isn't something you add).
export default function AddSheet() {
  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={() => router.back()} accessibilityLabel="Close" />
      <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.titleRow}>
          <Text style={styles.title} accessibilityRole="header">
            Add to logbook
          </Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.close}>
            <Icon name="close" size={22} color={Brand.ink} />
          </Pressable>
        </View>

        <Pressable onPress={() => router.replace('/scan')} accessibilityRole="button" style={({ pressed }) => [styles.scan, pressed && styles.pressed]}>
          <View style={styles.scanIcon}>
            <Icon name="camera" size={26} color={Brand.asphalt} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.scanTitle}>Scan a receipt</Text>
            <Text style={styles.scanBody}>Take a photo – the AI fills everything in for you</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => router.replace({ pathname: '/assistant', params: { mode: 'log' } })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.say, pressed && styles.pressed]}>
          <View style={styles.sayIcon}>
            <Icon name="mic" size={24} color={Brand.ink} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.sayTitle}>Just say it</Text>
            <Text style={styles.sayBody}>Say what you did – the assistant drafts it</Text>
          </View>
        </Pressable>

        <View style={styles.grid}>
          <Tile icon="fuel" label="Fuel" onPress={() => router.replace('/add-fuel')} />
          <Tile icon="wrench" label="Service or repair" onPress={() => router.replace({ pathname: '/add-entry', params: { type: 'service' } })} />
          <Tile icon="gauge" label="Mileage" onPress={() => router.replace('/update-mileage')} />
          <Tile icon="part" label="Part or accessory" onPress={() => router.replace({ pathname: '/add-entry', params: { type: 'mods' } })} />
        </View>

        <Text style={styles.otherTitle}>Something else</Text>
        <View style={styles.chips}>
          {(
            [
              ['Bill (insurance, tax, MOT)', 'bills'],
              ['Labour', 'labour'],
              ['Fine', 'fines'],
              ['Toll', 'tolls'],
            ] as const
          ).map(([label, type]) => (
            <Pressable
              key={label}
              onPress={() => router.replace({ pathname: '/add-entry', params: { type } })}
              accessibilityRole="button"
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}>
              <Text style={styles.chipLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}

function Tile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <Icon name={icon} size={24} color={Brand.amberInk} />
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(23,24,27,0.55)' },
  sheet: { backgroundColor: Brand.paperRaised, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12, gap: 12 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Brand.line },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: '800', color: Brand.ink },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  scan: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76, padding: 14, borderRadius: 16, backgroundColor: Brand.asphalt },
  scanIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  scanTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  scanBody: { color: Brand.mutedOnDark, fontSize: 13, marginTop: 2 },
  say: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  sayIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.paper, borderWidth: 1.5, borderColor: Brand.line },
  sayTitle: { fontSize: 17, fontWeight: '700', color: Brand.ink },
  sayBody: { color: Brand.muted, fontSize: 13, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '48%', flexGrow: 1, minHeight: 84, padding: 14, gap: 8, borderRadius: 16, borderWidth: 1, borderColor: Brand.line, backgroundColor: '#FBF9F5' },
  tileLabel: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  otherTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: Brand.muted, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: Brand.line },
  chipLabel: { fontSize: 15, fontWeight: '600', color: Brand.ink },
});
