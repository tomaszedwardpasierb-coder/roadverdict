import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Brand } from '@/constants/brand';
import { useAuth } from '@/lib/auth';
import {
  CATEGORY_LABEL,
  commitItem,
  deleteEntry,
  formatDay,
  needsPersonToCheck,
  reviewReasons,
  saveReviewedEntry,
  scanReceiptPhoto,
  type ParsedItem,
  type ReviewEntry,
} from '@/lib/scan';
import { groupNumber } from '@/lib/mileage';
import { useVehicle, type GarageVehicle } from '@/lib/vehicle';

type Row = { entry: ReviewEntry; item: ParsedItem; status: 'review' | 'saved' | 'deleted'; error?: string };
type Phase =
  | { name: 'pick'; error?: string }
  | { name: 'reading' }
  | { name: 'saving'; done: number; total: number }
  | { name: 'results' };

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function toIsoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ScanScreen() {
  const { selected, refresh } = useVehicle();
  const { token, signOut } = useAuth();
  const [phase, setPhase] = useState<Phase>({ name: 'pick' });
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [failedCount, setFailedCount] = useState(0);

  if (!selected) return null;
  const vehicle = selected;

  async function pick(source: 'camera' | 'library') {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setPhase({ name: 'pick', error: 'Camera access is off. Allow it in your phone’s settings, or choose a photo instead.' });
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > MAX_UPLOAD_BYTES) {
      setPhase({ name: 'pick', error: 'That photo is too large (over 10MB). Try taking it again.' });
      return;
    }
    setPhotoUri(asset.uri);
    await scanAndSave(asset.uri);
  }

  async function scanAndSave(uri: string) {
    setPhase({ name: 'reading' });
    const scanned = await scanReceiptPhoto({ uri }, vehicle, token);
    if (!scanned.ok) {
      if (scanned.status === 401) return signOut();
      setPhase({ name: 'pick', error: scanned.error });
      return;
    }
    // Oldest first, so each saved entry can anchor the next one's mileage
    // estimate - the same order the website commits in.
    const items = [...scanned.data.items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const saved: Row[] = [];
    let failed = 0;
    for (let i = 0; i < items.length; i++) {
      setPhase({ name: 'saving', done: i, total: items.length });
      const committed = await commitItem(items[i], vehicle, token);
      if (!committed.ok) {
        if (committed.status === 401) return signOut();
        failed++;
        continue;
      }
      const entry = committed.data.entry;
      if (needsPersonToCheck(entry, items[i], vehicle)) {
        saved.push({ entry, item: items[i], status: 'review' });
      } else {
        // Clean: confirm it now, clearing its review flag - as the web does.
        await saveReviewedEntry(entry, vehicle, token);
        saved.push({ entry, item: items[i], status: 'saved' });
      }
    }
    setRows(saved);
    setFailedCount(failed);
    setPhase({ name: 'results' });
    // Receipts can move the vehicle's current mileage on.
    refresh();
  }

  function update(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  const toReview = rows.filter((r) => r.status === 'review').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            Scan a receipt
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {vehicle.name}
          </Text>
        </View>
      </View>

      {vehicle.readOnly ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>This vehicle has been transferred and is now read-only.</Text>
        </View>
      ) : phase.name === 'pick' ? (
        <View style={styles.pick}>
          <Text style={styles.lead}>
            Photograph a garage invoice, fuel receipt or bill. The AI reads the date, the amount and what it was for, and adds it
            to your logbook – you check anything it wasn’t sure about.
          </Text>
          {phase.error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {phase.error}
            </Text>
          ) : null}
          <Pressable onPress={() => pick('camera')} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
            <Icon name="camera" size={24} color={Brand.asphalt} />
            <Text style={styles.primaryLabel}>Take a photo</Text>
          </Pressable>
          <Pressable onPress={() => pick('library')} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryLabel}>Choose from your photos</Text>
          </Pressable>
          <Text style={styles.tip}>Tip: lay the receipt flat in good light, with the whole thing in the frame.</Text>
        </View>
      ) : phase.name === 'reading' || phase.name === 'saving' ? (
        <View style={styles.working}>
          {photoUri ? <Image source={{ uri: photoUri }} alt="The receipt you photographed" style={styles.workingPhoto} contentFit="cover" /> : null}
          <ActivityIndicator size="large" color={Brand.amberInk} />
          <Text style={styles.workingTitle} accessibilityLiveRegion="polite">
            {phase.name === 'reading' ? 'Reading your receipt…' : `Adding to your logbook (${phase.done + 1} of ${phase.total})…`}
          </Text>
          <Text style={styles.tip}>This usually takes 5 to 20 seconds.</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior="height">
          <ScrollView contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
            <View style={styles.summary}>
              <Icon name="check" size={22} color="#1A6B4A" strokeWidth={2.6} />
              <Text style={styles.summaryText} accessibilityLiveRegion="polite">
                {rows.length === 0
                  ? 'Nothing could be saved from this receipt.'
                  : toReview > 0
                    ? `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} added – ${toReview} to check below.`
                    : `${rows.filter((r) => r.status === 'saved').length} ${rows.length === 1 ? 'entry' : 'entries'} added to your logbook.`}
              </Text>
            </View>
            {failedCount > 0 ? (
              <Text style={styles.error}>
                {failedCount} {failedCount === 1 ? 'item' : 'items'} from this receipt couldn’t be saved. Try scanning it again.
              </Text>
            ) : null}

            {rows.map((row, index) =>
              row.status === 'deleted' ? null : row.status === 'saved' ? (
                <SavedRow key={row.entry.id} row={row} vehicle={vehicle} />
              ) : (
                <ReviewCard
                  key={row.entry.id}
                  row={row}
                  vehicle={vehicle}
                  token={token}
                  onDone={(status) => update(index, { status })}
                  onSignedOut={signOut}
                />
              )
            )}

            <View style={styles.actions}>
              <Pressable
                onPress={() => {
                  setRows([]);
                  setPhotoUri(null);
                  setPhase({ name: 'pick' });
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryLabel}>Scan another receipt</Text>
              </Pressable>
              <Pressable onPress={() => router.back()} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
                <Text style={styles.primaryLabel}>{toReview > 0 ? 'Check the rest later' : 'Done'}</Text>
              </Pressable>
              {toReview > 0 ? (
                <Text style={styles.tip}>Anything you leave stays in your logbook marked “Scanned – check details”.</Text>
              ) : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function money(gbp: number, vehicle: GarageVehicle): string {
  return `${vehicle.units.currencySymbol}${(gbp * vehicle.units.rateFromGbp).toFixed(2)}`;
}

function SavedRow({ row, vehicle }: { row: Row; vehicle: GarageVehicle }) {
  return (
    <View style={styles.savedRow}>
      <Text style={styles.savedTitle}>
        {CATEGORY_LABEL[row.entry.category]} · {row.entry.aiDescription || row.item.description}
      </Text>
      <Text style={styles.savedMeta}>
        {formatDay(row.entry.date)} · {money(row.entry.cost, vehicle)} · saved
      </Text>
    </View>
  );
}

function ReviewCard({
  row,
  vehicle,
  token,
  onDone,
  onSignedOut,
}: {
  row: Row;
  vehicle: GarageVehicle;
  token: string | null;
  onDone: (status: 'saved' | 'deleted') => void;
  onSignedOut: () => Promise<void>;
}) {
  const { entry, item } = row;
  const { units } = vehicle;
  const hasMileage = entry.category !== 'bills';
  const kmFactor = units.distanceUnit === 'km' ? units.kmPerMile : 1;
  const [date, setDate] = useState(entry.date.slice(0, 10));
  const [cost, setCost] = useState((entry.cost * units.rateFromGbp).toFixed(2));
  const [mileage, setMileage] = useState(
    entry.category !== 'bills' && !entry.mileageNeedsManualEntry ? groupNumber(entry.mileage * kmFactor) : ''
  );
  const [litres, setLitres] = useState(entry.category === 'fuel' ? String(entry.litres) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasons = reviewReasons(entry, item, vehicle, (gbp) => money(gbp, vehicle));
  const costN = Number(cost.replace(',', '.'));
  const mileageN = Number(mileage.replace(/[,\s]/g, ''));
  const litresN = Number(litres.replace(',', '.'));
  const valid = costN > 0 && (!hasMileage || mileageN > 0) && (entry.category !== 'fuel' || litresN > 0);

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const result = await saveReviewedEntry(entry, vehicle, token, {
      date,
      cost: Math.round((costN / units.rateFromGbp) * 100) / 100,
      ...(hasMileage ? { mileage: mileageN / kmFactor } : {}),
      ...(entry.category === 'fuel' ? { litres: litresN } : {}),
    });
    setBusy(false);
    if (result.ok) return onDone('saved');
    if (result.status === 401) return onSignedOut();
    setError(result.error);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const result = await deleteEntry(entry, vehicle, token);
    setBusy(false);
    if (result.ok) return onDone('deleted');
    if (result.status === 401) return onSignedOut();
    setError(result.error);
  }

  function pickDate() {
    DateTimePickerAndroid.open({
      value: new Date(`${date}T12:00:00`),
      mode: 'date',
      maximumDate: new Date(),
      onValueChange: (_e, picked) => {
        if (picked) setDate(toIsoDay(picked));
      },
    });
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>{CATEGORY_LABEL[entry.category]} · check this one</Text>
      <Text style={styles.cardTitle}>{entry.aiDescription || item.description}</Text>
      {reasons.map((r) => (
        <View key={r} style={styles.reason}>
          <Text style={styles.reasonText}>{r}</Text>
        </View>
      ))}

      <View style={styles.field}>
        <Text style={styles.label}>Date</Text>
        <Pressable onPress={pickDate} accessibilityRole="button" accessibilityHint="Opens a calendar" style={styles.input}>
          <Text style={styles.inputText}>{formatDay(date)}</Text>
        </Pressable>
      </View>
      <View style={styles.pair}>
        <View style={[styles.field, styles.flex]}>
          <Text style={styles.label}>Cost ({units.currencySymbol})</Text>
          <TextInput value={cost} onChangeText={setCost} keyboardType="decimal-pad" accessibilityLabel="Cost" style={[styles.input, styles.inputText]} />
        </View>
        {entry.category === 'fuel' ? (
          <View style={[styles.field, styles.flex]}>
            <Text style={styles.label}>Litres</Text>
            <TextInput value={litres} onChangeText={setLitres} keyboardType="decimal-pad" accessibilityLabel="Litres" style={[styles.input, styles.inputText]} />
          </View>
        ) : null}
      </View>
      {hasMileage ? (
        <View style={styles.field}>
          <Text style={styles.label}>Mileage ({units.distanceUnit === 'km' ? 'km' : 'mi'})</Text>
          <TextInput
            value={mileage}
            onChangeText={setMileage}
            keyboardType="number-pad"
            placeholder="Enter the mileage"
            placeholderTextColor="#A7A49C"
            accessibilityLabel="Mileage"
            style={[styles.input, styles.inputText]}
          />
        </View>
      ) : null}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}

      <View style={styles.cardActions}>
        <Pressable onPress={remove} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
          <Text style={styles.deleteLabel}>Delete</Text>
        </Pressable>
        <Pressable
          onPress={save}
          disabled={!valid || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid || busy, busy }}
          style={({ pressed }) => [styles.save, (!valid || busy) && styles.disabled, pressed && valid && styles.pressed]}>
          <Text style={styles.saveLabel}>{busy ? 'Saving…' : 'Looks right – save'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  notice: { margin: 20, padding: 14, borderRadius: 12, backgroundColor: '#F8E6E3' },
  noticeText: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  pick: { padding: 20, gap: 14 },
  lead: { fontSize: 16, lineHeight: 24, color: Brand.ink },
  tip: { fontSize: 13, lineHeight: 19, color: Brand.muted, textAlign: 'center' },
  error: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  primary: {
    flexDirection: 'row',
    gap: 10,
    height: 56,
    borderRadius: 12,
    backgroundColor: Brand.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
  secondary: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  working: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  workingPhoto: { width: 160, height: 200, borderRadius: 12, marginBottom: 8, backgroundColor: Brand.line },
  workingTitle: { fontSize: 18, fontWeight: '700', color: Brand.ink, textAlign: 'center' },
  results: { padding: 20, gap: 12 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, backgroundColor: '#DEEFE6' },
  summaryText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1A6B4A' },
  savedRow: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Brand.line, backgroundColor: Brand.paperRaised, gap: 2 },
  savedTitle: { fontSize: 15, fontWeight: '600', color: Brand.ink },
  savedMeta: { fontSize: 13, color: Brand.muted },
  card: { padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: Brand.amber, backgroundColor: Brand.paperRaised, gap: 12 },
  cardEyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: '#9A5A0D' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: Brand.ink, marginTop: -6 },
  reason: { padding: 10, borderRadius: 10, backgroundColor: '#FBEACC' },
  reasonText: { fontSize: 14, lineHeight: 20, color: '#7A4508' },
  pair: { flexDirection: 'row', gap: 12 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paper,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  inputText: { fontSize: 17, color: Brand.ink },
  cardActions: { flexDirection: 'row', gap: 10 },
  delete: { height: 52, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, borderColor: Brand.line, alignItems: 'center', justifyContent: 'center' },
  deleteLabel: { fontSize: 16, fontWeight: '600', color: Brand.danger },
  save: { flex: 1, height: 52, borderRadius: 12, backgroundColor: Brand.asphalt, alignItems: 'center', justifyContent: 'center' },
  saveLabel: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  actions: { gap: 10, marginTop: 8 },
});
