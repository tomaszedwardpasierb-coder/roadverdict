import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntryRow, type LogEntry } from '@/components/entry-row';
import { Icon, type IconName } from '@/components/icon';
import { Card, ErrorState, LoadingState, SectionHeader, StatusPill } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { openEntry } from '@/lib/entries';
import { useApi } from '@/lib/use-api';
import type { NotificationList } from '@/app/(app)/notifications';
import { useVehicle, type GarageVehicle } from '@/lib/vehicle';

type HomeData = {
  vehicle: GarageVehicle & { mileageLabel: string };
  isPro: boolean;
  dueSoon: { id: string; name: string; status: 'ok' | 'due-soon' | 'overdue'; detail: string | null }[];
  reminderCounts: { overdue: number; dueSoon: number; ok: number };
  spend: { monthTotalLabel: string; yearTotalLabel: string; monthName: string; year: number };
  recent: LogEntry[];
};

export default function HomeScreen() {
  const garage = useVehicle();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const selected = garage.selected;
  // The website's bell, here too - a dot while anything is unread.
  const bell = useApi<NotificationList>('/api/tracker/notifications');
  const home = useApi<HomeData>(selected ? `/api/app/home?kind=${selected.kind}&id=${encodeURIComponent(selected.id)}` : null);

  if (garage.loading) return <LoadingState />;
  if (garage.error) return <ErrorState message={garage.error} onRetry={garage.retry} />;
  if (!selected) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Add your first vehicle</Text>
          <Text style={styles.emptyBody}>Start with the registration – we&apos;ll look up the rest, and bring in its MOT history.</Text>
          <Pressable
            onPress={() => router.push('/add-vehicle')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.85 }]}>
            <Text style={styles.emptyButtonLabel}>Add a vehicle</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const data = home.data;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={() => setSwitcherOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${selected.name}. ${garage.vehicles.length > 1 ? 'Switch or add a vehicle' : 'Add a vehicle'}`}
          style={styles.switcher}>
          <View style={styles.switcherText}>
            <Text style={styles.vehicleName} numberOfLines={1}>
              {selected.name}
            </Text>
            <Text style={styles.vehicleMeta} numberOfLines={1}>
              {[selected.registration, data?.vehicle.mileageLabel].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Icon name="chevronDown" size={22} color={Brand.ink} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/notifications')}
          accessibilityRole="button"
          accessibilityLabel={bell.data?.unreadCount ? `Notifications, ${bell.data.unreadCount} new` : 'Notifications'}
          hitSlop={4}
          style={({ pressed }) => [styles.bell, pressed && { opacity: 0.85 }]}>
          <Icon name="bell" size={22} color={Brand.ink} />
          {bell.data?.unreadCount ? <View style={styles.bellDot} /> : null}
        </Pressable>
        <Pressable
          onPress={() => router.push('/assistant')}
          accessibilityRole="button"
          accessibilityLabel="Ask the AI assistant"
          style={({ pressed }) => [styles.ask, pressed && { opacity: 0.85 }]}>
          <Icon name="sparkle" size={18} color={Brand.asphalt} />
          <Text style={styles.askLabel}>Ask</Text>
        </Pressable>
      </View>

      {home.loading && !data ? (
        <LoadingState />
      ) : home.error && !data ? (
        <ErrorState message={home.error} onRetry={home.retry} />
      ) : data ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={home.refreshing} onRefresh={home.refresh} colors={[Brand.amberInk]} />}>
          {selected.readOnly ? (
            <Card style={styles.notice}>
              <Text style={styles.noticeText}>This vehicle has been transferred to its new owner. Its history is read-only.</Text>
            </Card>
          ) : null}

          <SectionHeader title="Due soon" action={{ label: 'All reminders', onPress: () => router.navigate('/reminders') }} />
          <Card>
            {data.dueSoon.length === 0 ? (
              <View style={styles.row}>
                <Icon name="check" size={22} color="#1A6B4A" />
                <Text style={styles.rowTitle}>
                  {data.reminderCounts.ok > 0 ? "Nothing due – you're all caught up" : 'No reminders set yet'}
                </Text>
              </View>
            ) : (
              data.dueSoon.map((r, i) => (
                <View key={r.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle}>{r.name}</Text>
                    {r.detail ? (
                      <Text style={styles.rowMeta}>{r.detail}</Text>
                    ) : (
                      <View style={styles.locked}>
                        <Icon name="lock" size={13} color={Brand.muted} />
                        <Text style={styles.rowMeta}>Exact due date – Pro</Text>
                      </View>
                    )}
                  </View>
                  <StatusPill status={r.status} />
                </View>
              ))
            )}
          </Card>

          <SectionHeader title="Quick actions" />
          <View style={styles.actions}>
            <QuickAction icon="camera" label="Scan receipt" primary href="/scan" />
            <QuickAction icon="fuel" label="Log fuel" href="/add-fuel" />
            <QuickAction icon="quote" label="Quote checker" href="/quote" />
            <QuickAction icon="gauge" label="Update mileage" href="/update-mileage" />
          </View>

          {/* This month and this year side by side - early in a month the
              month alone is usually a big, uninformative £0.00. */}
          <SectionHeader title="Spending" />
          <View style={styles.spendRow}>
            <Card style={styles.spend}>
              <Text style={styles.spendLabel}>{data.spend.monthName}</Text>
              <Text style={styles.spendTotal} adjustsFontSizeToFit numberOfLines={1}>
                {data.spend.monthTotalLabel}
              </Text>
            </Card>
            <Card style={styles.spend}>
              <Text style={styles.spendLabel}>{data.spend.year} so far</Text>
              <Text style={styles.spendTotal} adjustsFontSizeToFit numberOfLines={1}>
                {data.spend.yearTotalLabel}
              </Text>
            </Card>
          </View>

          <SectionHeader title="Recent" action={data.recent.length > 0 ? { label: 'See all', onPress: () => router.navigate('/logbook') } : undefined} />
          <Card>
            {data.recent.length === 0 ? (
              <View style={styles.row}>
                <Text style={styles.rowMeta}>Nothing logged yet. Tap ⊕ to add your first entry.</Text>
              </View>
            ) : (
              data.recent.map((item, i) => <EntryRow key={`${item.category}-${item.id}`} entry={item} divider={i > 0} onPress={() => openEntry(item)} />)
            )}
          </Card>
        </ScrollView>
      ) : null}

      <VehicleSwitcher
        open={switcherOpen}
        onClose={() => setSwitcherOpen(false)}
        vehicles={garage.vehicles}
        selected={selected}
        onSelect={(v) => {
          garage.select(v);
          setSwitcherOpen(false);
        }}
        onAdd={() => {
          setSwitcherOpen(false);
          router.push('/add-vehicle');
        }}
        onCompare={() => {
          setSwitcherOpen(false);
          router.push('/compare');
        }}
        onDeleted={garage.refresh}
      />
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, primary, href }: { icon: IconName; label: string; primary?: boolean; href: '/add-fuel' | '/scan' | '/update-mileage' | '/quote' }) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && { opacity: 0.85 }]}>
      <Icon name={icon} size={24} color={primary ? Brand.amber : Brand.amberInk} />
      <Text style={[styles.actionLabel, primary && styles.actionLabelPrimary]}>{label}</Text>
    </Pressable>
  );
}

function VehicleSwitcher({
  open,
  onClose,
  vehicles,
  selected,
  onSelect,
  onAdd,
  onCompare,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  vehicles: GarageVehicle[];
  selected: GarageVehicle;
  onSelect: (v: GarageVehicle) => void;
  onAdd: () => void;
  onCompare: () => void;
  onDeleted: () => void;
}) {
  const { token } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // The website garage's Delete: the vehicle and everything logged against
  // it. A transferred (read-only) one is only this owner's historical copy -
  // the new owner keeps theirs, receipts included.
  // Deleting sits behind a menu, never one tap from the row you choose a
  // vehicle with - then a confirmation that names the vehicle.
  function openMenu(v: GarageVehicle) {
    Alert.alert(v.name, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete vehicle…', style: 'destructive', onPress: () => confirmDelete(v) },
    ]);
  }

  function confirmDelete(v: GarageVehicle) {
    const message = v.readOnly
      ? `Delete your read-only copy of ${v.name}? Its history disappears from your garage for good. The new owner keeps their own copy, with everything that was transferred.`
      : `This permanently deletes ${v.name} and every service, fuel, parts, bill and reminder entry logged against it, with its receipts and Vault documents. This can't be undone.`;
    Alert.alert(`Delete ${v.name}?`, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(v) },
    ]);
  }

  async function remove(v: GarageVehicle) {
    setDeletingId(v.id);
    const path = v.kind === 'bike' ? `/api/tracker/bike/${encodeURIComponent(v.id)}` : `/api/cars/car/${encodeURIComponent(v.id)}`;
    const result = await apiFetch<{ ok: true }>(path, { method: 'DELETE', token });
    setDeletingId(null);
    if (!result.ok) {
      Alert.alert('Couldn’t delete it', result.error);
      return;
    }
    onDeleted();
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <SafeAreaView style={styles.sheet} edges={['bottom']}>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          Your garage
        </Text>
        {vehicles.map((v) => {
          const isSelected = v.kind === selected.kind && v.id === selected.id;
          return (
            <Pressable
              key={`${v.kind}:${v.id}`}
              onPress={() => onSelect(v)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => [styles.sheetRow, isSelected && styles.sheetRowSelected, pressed && { opacity: 0.85 }]}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{v.name}</Text>
                <Text style={styles.rowMeta}>
                  {[v.name !== v.makeModel ? v.makeModel : null, v.registration, v.kind === 'bike' ? 'Motorcycle' : 'Car', v.readOnly ? 'Transferred' : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {isSelected ? <Icon name="check" size={22} color={Brand.amberInk} /> : null}
              {deletingId === v.id ? (
                <ActivityIndicator color={Brand.danger} style={styles.sheetDelete} />
              ) : (
                <Pressable
                  onPress={() => openMenu(v)}
                  disabled={deletingId !== null}
                  accessibilityRole="button"
                  accessibilityLabel={`More options for ${v.name}`}
                  hitSlop={6}
                  style={({ pressed }) => [styles.sheetDelete, pressed && { opacity: 0.6 }]}>
                  <Icon name="dots" size={22} color={Brand.muted} strokeWidth={3} />
                </Pressable>
              )}
            </Pressable>
          );
        })}
        <Pressable onPress={onAdd} accessibilityRole="button" style={({ pressed }) => [styles.sheetRow, styles.sheetAdd, pressed && { opacity: 0.85 }]}>
          <Icon name="plus" size={22} color={Brand.amberInk} />
          <Text style={styles.rowTitle}>Add a vehicle</Text>
        </Pressable>
        {vehicles.filter((v) => !v.readOnly).length >= 2 ? (
          <Pressable onPress={onCompare} accessibilityRole="button" style={({ pressed }) => [styles.sheetRow, pressed && { opacity: 0.85 }]}>
            <Icon name="compare" size={22} color={Brand.amberInk} />
            <Text style={styles.rowTitle}>Compare vehicles</Text>
          </Pressable>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  switcher: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  ask: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Brand.amber },
  askLabel: { fontSize: 15, fontWeight: '700', color: Brand.asphalt },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Brand.line },
  bellDot: { position: 'absolute', top: 9, right: 10, width: 10, height: 10, borderRadius: 5, backgroundColor: Brand.danger, borderWidth: 1.5, borderColor: Brand.paper },
  switcherText: { flexShrink: 1 },
  vehicleName: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  vehicleMeta: { fontSize: 13, color: Brand.muted, marginTop: 2 },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 10 },
  notice: { padding: 14, backgroundColor: '#FBEACC', borderColor: '#F1D5A3' },
  noticeText: { color: '#7A4508', fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10 },
  rowDivider: { borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: Brand.ink, flexShrink: 1 },
  rowMeta: { fontSize: 13, color: Brand.muted },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  action: {
    width: '48%',
    flexGrow: 1,
    minHeight: 84,
    padding: 14,
    gap: 8,
    borderRadius: 14,
    backgroundColor: Brand.paperRaised,
    borderWidth: 1,
    borderColor: Brand.line,
  },
  actionPrimary: { backgroundColor: Brand.asphalt, borderColor: Brand.asphalt },
  actionLabel: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  actionLabelPrimary: { color: '#FFFFFF' },
  spendRow: { flexDirection: 'row', gap: 10 },
  spend: { flex: 1, padding: 16, gap: 4 },
  spendLabel: { fontSize: 13, color: Brand.muted },
  spendTotal: { fontSize: 26, fontWeight: '800', color: Brand.ink },
  empty: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  emptyTitle: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  emptyBody: { fontSize: 16, lineHeight: 24, color: Brand.muted },
  emptyButton: { alignSelf: 'flex-start', height: 52, paddingHorizontal: 22, borderRadius: 12, backgroundColor: Brand.amber, justifyContent: 'center', marginTop: 4 },
  emptyButtonLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
  backdrop: { flex: 1, backgroundColor: 'rgba(23,24,27,0.55)' },
  sheet: { backgroundColor: Brand.paperRaised, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 8 },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: Brand.ink, marginBottom: 4 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: Brand.line },
  sheetDelete: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetRowSelected: { borderColor: Brand.amber, backgroundColor: '#FBF4E8' },
  sheetAdd: { borderStyle: 'dashed', borderColor: '#C9C4B8' },
});
