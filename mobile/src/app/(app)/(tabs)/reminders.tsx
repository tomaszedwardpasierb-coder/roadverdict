import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Card, ErrorState, LoadingState, SectionHeader, StatusPill } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/use-api';
import { reminderRoute } from '@/lib/reminders';
import { useVehicle, vehicleHeaders } from '@/lib/vehicle';

type Reminder = {
  id: string;
  name: string;
  status: 'ok' | 'due-soon' | 'overdue';
  detail: string | null;
  permanent: boolean;
  oneOff: boolean;
};

type ReminderList = { isPro: boolean; reminders: Reminder[] };

export default function RemindersScreen() {
  const { selected } = useVehicle();
  const { token, signOut } = useAuth();
  const list = useApi<ReminderList>(selected ? `/api/app/reminders?kind=${selected.kind}&id=${encodeURIComponent(selected.id)}` : null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(reminder: Reminder, method: 'PATCH' | 'DELETE') {
    if (!selected) return;
    setBusyId(reminder.id);
    setActionError(null);
    const result = await apiFetch(reminderRoute(selected, reminder.id), { method, token, headers: vehicleHeaders(selected) });
    setBusyId(null);
    if (!result.ok) {
      if (result.status === 401) await signOut();
      else setActionError(result.error);
      return;
    }
    list.refresh();
  }

  // Same confirmations as the web's ReminderItem.
  function markDone(reminder: Reminder) {
    if (reminder.oneOff) {
      Alert.alert('Clear this reminder?', "It's for an exact date, so it doesn't repeat - marking it done removes it.", [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear it', onPress: () => act(reminder, 'DELETE') },
      ]);
      return;
    }
    act(reminder, 'PATCH');
  }

  function remove(reminder: Reminder) {
    Alert.alert('Delete this reminder?', "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => act(reminder, 'DELETE') },
    ]);
  }

  const reminders = list.data?.reminders ?? [];
  const attention = reminders.filter((r) => r.status !== 'ok');
  const later = reminders.filter((r) => r.status === 'ok');
  const canEdit = !!selected && !selected.readOnly;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Reminders
          </Text>
          {selected ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {[selected.name, selected.registration].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>
        {canEdit ? (
          <Pressable
            onPress={() => router.push('/add-reminder')}
            accessibilityRole="button"
            accessibilityLabel="Add a reminder"
            style={({ pressed }) => [styles.add, pressed && styles.pressed]}>
            <Icon name="plus" size={18} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={styles.addLabel}>Add</Text>
          </Pressable>
        ) : null}
      </View>

      {!selected ? null : list.loading && !list.data ? (
        <LoadingState />
      ) : list.error && !list.data ? (
        <ErrorState message={list.error} onRetry={list.retry} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} colors={[Brand.amberInk]} />}>
          {list.data && !list.data.isPro ? (
            <View style={styles.note}>
              <Icon name="lock" size={14} color="#7A4508" />
              <Text style={styles.noteText}>
                Free plan: every reminder shows whether it&apos;s due. Exact due dates are part of Pro.
              </Text>
            </View>
          ) : null}

          {actionError ? (
            <Text style={styles.error} accessibilityRole="alert">
              {actionError}
            </Text>
          ) : null}

          {reminders.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No reminders yet</Text>
              <Text style={styles.emptyBody}>Add your MOT, road tax, insurance or next service and we&apos;ll keep track of them.</Text>
            </View>
          ) : null}

          {[
            { title: 'Needs attention', items: attention },
            { title: 'Later', items: later },
          ].map((group) =>
            group.items.length === 0 ? null : (
              <View key={group.title} style={styles.group}>
                <SectionHeader title={group.title} />
                <Card>
                  {group.items.map((r, i) => (
                    <View key={r.id} style={[styles.row, i > 0 && styles.divider]}>
                      <View style={styles.rowTop}>
                        <View style={styles.flex}>
                          <Text style={styles.name}>{r.name}</Text>
                          {r.detail ? (
                            <Text style={styles.detail}>{r.detail}</Text>
                          ) : (
                            <View style={styles.locked}>
                              <Icon name="lock" size={13} color={Brand.muted} />
                              <Text style={styles.detail}>Exact due date - Premium</Text>
                            </View>
                          )}
                        </View>
                        <StatusPill status={r.status} />
                      </View>
                      {canEdit && !r.permanent ? (
                        <View style={styles.actions}>
                          <Pressable
                            onPress={() => markDone(r)}
                            disabled={busyId === r.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Mark ${r.name} done`}
                            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
                            <Icon name="check" size={16} color={Brand.ink} strokeWidth={2.6} />
                            <Text style={styles.actionLabel}>{busyId === r.id ? 'Saving…' : 'Done'}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => remove(r)}
                            disabled={busyId === r.id}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${r.name}`}
                            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
                            <Text style={[styles.actionLabel, styles.deleteLabel]}>Delete</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </Card>
              </View>
            )
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 30, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  add: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: Brand.asphalt },
  addLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  note: { flexDirection: 'row', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#FBEACC' },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#7A4508' },
  error: { fontSize: 14, color: Brand.danger, lineHeight: 20 },
  empty: { marginTop: 24, padding: 24, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9C4B8', gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Brand.ink },
  emptyBody: { fontSize: 15, lineHeight: 22, color: Brand.muted },
  group: { gap: 8 },
  row: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  detail: { fontSize: 13, color: Brand.muted, marginTop: 2 },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: 8 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
  },
  actionLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  deleteLabel: { color: Brand.danger },
});
