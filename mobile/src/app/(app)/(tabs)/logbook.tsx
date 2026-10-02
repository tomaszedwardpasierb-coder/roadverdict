import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntryRow, type EntryCategory, type LogEntry } from '@/components/entry-row';
import { Icon } from '@/components/icon';
import { ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { openEntry } from '@/lib/entries';
import { useApi } from '@/lib/use-api';
import { useVehicle } from '@/lib/vehicle';

type LogbookData = { entries: LogEntry[]; counts: Record<EntryCategory, number> };

type Filter = 'all' | EntryCategory;

const FILTERS: { id: Filter; label: string; empty: string }[] = [
  { id: 'all', label: 'All', empty: 'entries' },
  { id: 'fuel', label: 'Fuel', empty: 'fuel' },
  { id: 'service', label: 'Service', empty: 'services or repairs' },
  { id: 'mods', label: 'Parts', empty: 'parts' },
  { id: 'bills', label: 'Bills', empty: 'bills' },
  { id: 'labour', label: 'Labour', empty: 'labour' },
  { id: 'fines', label: 'Fines', empty: 'fines' },
  { id: 'tolls', label: 'Tolls', empty: 'tolls' },
];

function monthTitle(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export default function LogbookScreen() {
  const { selected } = useVehicle();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const log = useApi<LogbookData>(selected ? `/api/app/logbook?kind=${selected.kind}&id=${encodeURIComponent(selected.id)}` : null);

  const sections = useMemo(() => {
    // Search matches what it was (the job, part or bill), its description,
    // the date as shown, the amount and the mileage.
    const q = query.trim().toLowerCase();
    const entries = (log.data?.entries ?? []).filter(
      (e) =>
        (filter === 'all' || e.category === filter) &&
        (!q || [e.type, e.description, e.costLabel, e.mileageLabel ?? '', monthTitle(e.date)].some((field) => field.toLowerCase().includes(q)))
    );
    const byMonth = new Map<string, LogEntry[]>();
    for (const e of entries) {
      const key = monthTitle(e.date);
      byMonth.set(key, [...(byMonth.get(key) ?? []), e]);
    }
    return [...byMonth].map(([title, data]) => ({ title, data }));
  }, [log.data, filter, query]);

  const total = log.data?.entries.length ?? 0;
  const count = (id: Filter) => (id === 'all' ? total : (log.data?.counts[id] ?? 0));
  const current = FILTERS.find((f) => f.id === filter)!;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Logbook
        </Text>
        {selected ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {[selected.name, selected.registration].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>

      <View style={styles.search}>
        <Icon name="search" size={18} color={Brand.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search your logbook"
          placeholderTextColor="#8A877F"
          accessibilityLabel="Search your logbook"
          returnKeyType="search"
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8}>
            <Icon name="close" size={18} color={Brand.muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Only the kinds this vehicle has entries for, wrapping onto a second
          row rather than running off the edge of the screen. */}
      <View style={styles.chips}>
        {FILTERS.filter((f) => f.id === 'all' || f.id === filter || !log.data || count(f.id) > 0).map((f) => {
          const on = f.id === filter;
          return (
            <Pressable
              key={f.id}
              onPress={() => setFilter(f.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${f.label}, ${count(f.id)} entries`}
              style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipLabel, on && styles.chipLabelOn]}>
                {f.label}
                {log.data ? <Text style={[styles.chipCount, on && styles.chipLabelOn]}> {count(f.id)}</Text> : null}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {!selected ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No vehicle yet</Text>
        </View>
      ) : log.loading && !log.data ? (
        <LoadingState />
      ) : log.error && !log.data ? (
        <ErrorState message={log.error} onRetry={log.retry} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => `${e.category}-${e.id}`}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={log.refreshing} onRefresh={log.refresh} colors={[Brand.amberInk]} />}
          renderSectionHeader={({ section }) => <Text style={styles.month}>{section.title}</Text>}
          renderItem={({ item, index, section }) => (
            <View style={[styles.cardSlice, index === 0 && styles.cardTop, index === section.data.length - 1 && styles.cardBottom]}>
              <EntryRow entry={item} divider={index > 0} onPress={() => openEntry(item)} />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              {query.trim() ? (
                <Text style={styles.emptyTitle}>Nothing matches “{query.trim()}”</Text>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>No {current.empty} logged yet</Text>
                  <Pressable onPress={() => router.push('/add')} accessibilityRole="button" style={({ pressed }) => [styles.addOne, pressed && { opacity: 0.85 }]}>
                    <Text style={styles.addOneLabel}>Add one</Text>
                  </Pressable>
                </>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 2 },
  title: { fontSize: 30, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 14,
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
  },
  searchInput: { flex: 1, fontSize: 16, color: Brand.ink, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingVertical: 12 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: Brand.asphalt, borderColor: Brand.asphalt },
  chipLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  chipCount: { fontWeight: '400', color: Brand.muted },
  chipLabelOn: { color: '#FFFFFF' },
  list: { paddingHorizontal: 20, paddingBottom: 32, flexGrow: 1 },
  month: { fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: Brand.muted, marginTop: 14, marginBottom: 8 },
  cardSlice: { backgroundColor: Brand.paperRaised, borderLeftWidth: 1, borderRightWidth: 1, borderColor: Brand.line },
  cardTop: { borderTopWidth: 1, borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  cardBottom: { borderBottomWidth: 1, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyBox: {
    marginTop: 40,
    padding: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9C4B8',
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: Brand.ink, textAlign: 'center' },
  addOne: { minHeight: 44, paddingHorizontal: 20, borderRadius: 12, backgroundColor: Brand.asphalt, justifyContent: 'center' },
  addOneLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
