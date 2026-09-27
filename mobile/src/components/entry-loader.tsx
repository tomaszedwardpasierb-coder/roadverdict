// Loads one logbook entry before an edit form opens, so the form can
// start filled in with what was logged.
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { useEntryDetail, type Entry, type EntryCategory } from '@/lib/entries';

export function EntryLoader({
  category,
  entryId,
  title,
  children,
}: {
  category: EntryCategory;
  entryId: string;
  title: string;
  children: (entry: Entry) => ReactElement;
}) {
  const detail = useEntryDetail(category, entryId);
  if (detail.data) return children(detail.data.entry);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
          {title}
        </Text>
      </View>
      {detail.error ? <ErrorState message={detail.error} onRetry={detail.retry} /> : <LoadingState />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { flex: 1, fontSize: 26, fontWeight: '800', color: Brand.ink },
});
