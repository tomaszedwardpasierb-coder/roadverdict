// One logbook entry in full, opened from the Logbook or Home's "Recent":
// everything logged, its receipts, and Edit / Delete - through the same
// website routes the web's entry cards use. A scanned entry that nobody
// has checked yet can be confirmed as it is with one tap.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CATEGORY_LOOK } from '@/components/entry-row';
import { Icon } from '@/components/icon';
import { Receipts } from '@/components/receipts';
import { Card, ErrorState, LoadingState, SectionHeader } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMileage, recordPath, unchangedBody, useEntryDetail, type Entry, type EntryCategory } from '@/lib/entries';
import { findLabel, useFormOptions } from '@/lib/form-options';
import { dayLabel, fromIsoDay } from '@/lib/mileage';
import { useVehicle, vehicleHeaders, type GarageVehicle } from '@/lib/vehicle';

const CATEGORIES: EntryCategory[] = ['fuel', 'service', 'mods', 'bills', 'labour', 'fines', 'tolls'];

function isCategory(value: unknown): value is EntryCategory {
  return typeof value === 'string' && (CATEGORIES as string[]).includes(value);
}

export default function EntryScreen() {
  const params = useLocalSearchParams<{ category: string; id: string }>();
  const category: EntryCategory = isCategory(params.category) ? params.category : 'service';
  const detail = useEntryDetail(category, params.id ?? '');
  const entry = detail.data?.entry;
  const vehicle = detail.data?.vehicle;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>
            {entry?.description ?? ' '}
          </Text>
          {vehicle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {vehicle.name}
            </Text>
          ) : null}
        </View>
      </View>

      {entry && vehicle ? (
        <EntryBody entry={entry} vehicle={vehicle} refreshing={detail.refreshing} onRefresh={detail.refresh} />
      ) : detail.error ? (
        <ErrorState message={detail.error} onRetry={detail.retry} />
      ) : (
        <LoadingState />
      )}
    </SafeAreaView>
  );
}

function EntryBody({ entry, vehicle, refreshing, onRefresh }: { entry: Entry; vehicle: GarageVehicle; refreshing: boolean; onRefresh: () => void }) {
  const { token, signOut } = useAuth();
  const garage = useVehicle();
  const form = useFormOptions(vehicle.kind);
  const [busy, setBusy] = useState<'confirm' | 'delete' | null>(null);
  const [problem, setProblem] = useState<{ message: string; canOverride: boolean } | null>(null);
  const look = CATEGORY_LOOK[entry.category];
  const { units } = vehicle;

  async function confirm(acknowledgeMileage: boolean) {
    setBusy('confirm');
    setProblem(null);
    const result = await apiFetch(recordPath(vehicle, entry.category, entry.id), {
      method: 'PATCH',
      token,
      headers: vehicleHeaders(vehicle),
      body: { ...unchangedBody(entry), ...(acknowledgeMileage ? { mileageAcknowledged: true } : {}) },
    });
    setBusy(null);
    if (result.ok) {
      garage.refresh();
      onRefresh();
      return;
    }
    if (result.status === 401) {
      await signOut();
      return;
    }
    // The website's own checks (mileage out of order, an impossible
    // fill-up) - a warning can be confirmed, anything else needs an edit.
    setProblem({ message: result.error, canOverride: result.status === 409 && hasMileage(entry.category) && !acknowledgeMileage });
  }

  function askDelete() {
    Alert.alert(
      'Delete this entry?',
      entry.instalmentPlan
        ? "This removes this one payment. The instalment plan carries on adding the payments still to come. This can't be undone."
        : "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: remove },
      ]
    );
  }

  async function remove() {
    setBusy('delete');
    setProblem(null);
    const result = await apiFetch(recordPath(vehicle, entry.category, entry.id), { method: 'DELETE', token, headers: vehicleHeaders(vehicle) });
    setBusy(null);
    if (result.ok) {
      garage.refresh();
      router.back();
      return;
    }
    if (result.status === 401) {
      await signOut();
      return;
    }
    setProblem({ message: result.error, canOverride: false });
  }

  function edit() {
    if (entry.category === 'fuel') router.push({ pathname: '/add-fuel', params: { entryId: entry.id } });
    else router.push({ pathname: '/add-entry', params: { type: entry.category, entryId: entry.id } });
  }

  const rows: { label: string; value: string }[] = [{ label: 'Date', value: dayLabel(fromIsoDay(entry.date)) }];
  if (entry.mileageLabel) rows.push({ label: 'Mileage', value: `${entry.mileageLabel}${entry.mileageEstimated ? ' (estimated)' : ''}` });
  if (entry.fuel) {
    const { amount, unit } = entry.fuel;
    rows.push({ label: unit === 'kWh' ? 'Charged' : 'Fuel', value: `${amount.toLocaleString('en-GB', { maximumFractionDigits: 2 })} ${unit}` });
    if (amount > 0) rows.push({ label: unit === 'kWh' ? 'Price per kWh' : 'Price per litre', value: `${units.currencySymbol}${(entry.costDisplay / amount).toFixed(3)}` });
    if (unit === 'L') rows.push({ label: 'Filled to full', value: entry.fuel.filledToFull ? 'Yes' : 'No' });
  }
  if (entry.category === 'mods' && entry.typeKey) {
    rows.push({ label: 'Type of part', value: (form.options && findLabel(form.options.mods.groups, entry.typeKey)) ?? entry.typeKey });
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Brand.amberInk]} />}>
        {entry.needsReview && !vehicle.readOnly ? (
          <Card style={styles.review}>
            <Text style={styles.reviewTitle}>Read from a receipt</Text>
            <Text style={styles.reviewText}>
              Check the details below. If they&apos;re right, confirm them – or edit anything that isn&apos;t.
              {entry.mileageEstimated ? ' The mileage was estimated, not read off the receipt.' : ''}
            </Text>
            <Pressable
              onPress={() => confirm(false)}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityState={{ busy: busy === 'confirm' }}
              style={({ pressed }) => [styles.reviewButton, pressed && { opacity: 0.85 }]}>
              <Text style={styles.reviewButtonLabel}>{busy === 'confirm' ? 'Saving…' : 'Looks right'}</Text>
            </Pressable>
          </Card>
        ) : null}

        <Card style={styles.summary}>
          <View style={[styles.badge, { backgroundColor: look.tint }]}>
            <Icon name={look.icon} size={22} color={look.ink} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.cost}>{entry.costLabel}</Text>
            <Text style={styles.meta}>{entry.type}</Text>
          </View>
        </Card>

        <Card>
          {rows.map((row, i) => (
            <View key={row.label} style={[styles.row, i > 0 && styles.divider]} accessible accessibilityLabel={`${row.label}: ${row.value}`}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </Card>

        {entry.instalmentPlan ? <Text style={styles.note}>Added by an instalment plan you set up on the website.</Text> : null}

        {entry.notes ? (
          <>
            <SectionHeader title="Notes" />
            <Card style={styles.notes}>
              <Text style={styles.notesText}>{entry.notes}</Text>
            </Card>
          </>
        ) : null}

        {entry.attachments.length > 0 ? (
          <>
            <SectionHeader title={entry.attachments.length === 1 ? 'Receipt' : 'Receipts'} />
            <Receipts attachments={entry.attachments} />
          </>
        ) : null}

        {problem ? (
          <View style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
            <Text style={styles.problemText}>{problem.message}</Text>
            {problem.canOverride ? (
              <Pressable onPress={() => confirm(true)} accessibilityRole="button" style={styles.override}>
                <Text style={styles.overrideLabel}>That&apos;s right – save anyway</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {vehicle.readOnly ? (
          <Text style={styles.note}>This vehicle has been transferred, so its history is read-only.</Text>
        ) : null}
      </ScrollView>

      {!vehicle.readOnly ? (
        <View style={styles.footer}>
          <Pressable
            onPress={askDelete}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityState={{ busy: busy === 'delete' }}
            style={({ pressed }) => [styles.delete, pressed && { opacity: 0.85 }]}>
            <Text style={styles.deleteLabel}>{busy === 'delete' ? 'Deleting…' : 'Delete'}</Text>
          </Pressable>
          <Pressable
            onPress={edit}
            disabled={busy !== null}
            accessibilityRole="button"
            style={({ pressed }) => [styles.edit, pressed && { opacity: 0.85 }]}>
            <Text style={styles.editLabel}>Edit</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 26, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  content: { padding: 20, paddingTop: 12, gap: 12 },
  review: { padding: 16, gap: 8, backgroundColor: '#FBEACC', borderColor: '#F1D5A3' },
  reviewTitle: { fontSize: 16, fontWeight: '700', color: '#7A4508' },
  reviewText: { fontSize: 15, lineHeight: 22, color: '#7A4508' },
  reviewButton: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, marginTop: 4, borderRadius: 12, backgroundColor: Brand.asphalt, justifyContent: 'center' },
  reviewButtonLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  badge: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cost: { fontSize: 30, fontWeight: '800', color: Brand.ink },
  meta: { fontSize: 14, color: Brand.muted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  rowLabel: { fontSize: 15, color: Brand.muted },
  rowValue: { flex: 1, fontSize: 16, fontWeight: '600', color: Brand.ink, textAlign: 'right' },
  note: { fontSize: 14, lineHeight: 20, color: Brand.muted },
  notes: { padding: 14 },
  notesText: { fontSize: 16, lineHeight: 24, color: Brand.ink },
  problem: { gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#F8E6E3' },
  problemText: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  override: { minHeight: 44, justifyContent: 'center' },
  overrideLabel: { fontSize: 15, fontWeight: '700', color: Brand.ink, textDecorationLine: 'underline' },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Brand.line,
    backgroundColor: Brand.paper,
  },
  delete: {
    height: 56,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: { fontSize: 17, fontWeight: '700', color: Brand.danger },
  edit: { flex: 1, height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  editLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
});
