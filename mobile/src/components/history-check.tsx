// The full history check on the Buying screen: Pro's free check, a paid
// check not used yet, or buying one through the store - and, once it has
// run, the report itself. Mirrors the website's Full history check, which
// shows the same report (components/VdiCheckReport.tsx there) with the
// technical details on top.
//
// Buying never leaves the app: the store takes the payment, the server
// turns it into a check on this plate (/api/app/history-check), and the
// Buying screen looks the plate up again with that purchase, which runs
// the check (onUse).
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components/auth-ui';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { buyHistoryCheck, loadHistoryCheckProduct, usePurchases, type PurchasesConfig } from '@/lib/purchases';
import type { VehicleKind } from '@/lib/vehicle';

type StoreProduct = Awaited<ReturnType<typeof loadHistoryCheckProduct>>;

// Whether this account can buy the check in the app, and the store's own
// product (with its price) once the store answers. Loaded once per screen:
// the Buying screen shows the price on its own button as well as here.
export type HistoryCheckStore = { config: PurchasesConfig | null; product: StoreProduct };

export function useHistoryCheckStore(): HistoryCheckStore {
  const { config } = usePurchases();
  const [product, setProduct] = useState<StoreProduct>(null);
  useEffect(() => {
    if (!config?.enabled) return;
    let cancelled = false;
    loadHistoryCheckProduct(config)
      .then((p) => !cancelled && setProduct(p))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [config]);
  return { config, product };
}

// The parts of the website's VdiCheckResult shown here.
export type VdiCheck = {
  isStolen: boolean;
  hasWriteOffRecord: boolean;
  writeOffRecordCount: number;
  writeOffRecords?: { status: string | null; category: string | null; lossDate: string | null; insurerName: string | null }[];
  hasOutstandingFinance: boolean;
  financeRecords: { agreementDate: string | null; agreementType: string | null; financeCompany: string | null }[];
  keeperChanges: { keeperStartDate: string; numberOfPreviousKeepers?: number | null }[];
  keeperChangeCount: number;
  plateChangeCount: number;
  plateChanges?: { currentVrm: string | null; previousVrm: string | null; dateOfTransaction: string | null }[];
  colourChangeCount: number;
  currentColour: string | null;
  originalColour?: string | null;
  v5cReissueCount: number;
  calculatedAverageAnnualMileage: number | null;
  averageMileageForAge: number | null;
  mileageAnomalyDetected: boolean;
  isImported?: boolean;
  isImportedFromOutsideEu?: boolean;
  isScrapped?: boolean;
  certificateOfDestructionIssued?: boolean;
  dateFirstRegisteredInUk?: string | null;
  dateOfManufacture?: string | null;
};

// What the buying-guide lookup says about the check for this plate.
export type HistoryCheckState = {
  vrm: string;
  vdiCheck: VdiCheck | null;
  vdiCheckBlockedReason?: 'already_used' | 'payment_not_confirmed' | 'invalid' | 'fetch_failed';
  vdiCheckPurchasedAt: string | null;
  vdiCheckExpiresAt: string | null;
  vdiCheckPricePaidPence: number | null;
  reportTier: 'pro' | 'freeWithVehicle' | 'freeNoVehicle';
  proFreeAvailable: boolean;
  nextFreeReportAt: string | null;
};

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// averageMileageForAge is the TOTAL typical for the vehicle's age (12,000 a
// year times its whole years), not a yearly figure - the website's
// lib/tracker/vdiMileageForAge.ts, mirrored.
function typicalMileageText(v: VdiCheck): string {
  const total = Math.round(v.averageMileageForAge ?? 0);
  const from = v.dateFirstRegisteredInUk ?? v.dateOfManufacture;
  const start = from ? new Date(from) : null;
  if (start && !Number.isNaN(start.getTime())) {
    const now = new Date();
    let years = now.getUTCFullYear() - start.getUTCFullYear();
    if (now.getUTCMonth() < start.getUTCMonth() || (now.getUTCMonth() === start.getUTCMonth() && now.getUTCDate() < start.getUTCDate())) years--;
    if (years >= 1) return `about ${(Math.round(total / years / 100) * 100).toLocaleString('en-GB')} a year is typical for its age`;
  }
  return `about ${total.toLocaleString('en-GB')} miles in total is typical for its age`;
}

export function HistoryCheck({
  kind,
  state,
  store,
  onUse,
}: {
  kind: VehicleKind;
  state: HistoryCheckState;
  store: HistoryCheckStore;
  // Looks the plate up again with this purchase, which runs the check.
  onUse: (vdiPurchaseId: string) => Promise<void>;
}) {
  if (state.vdiCheck) return <HistoryReport kind={kind} state={state} check={state.vdiCheck} />;
  return <HistoryCheckOffer kind={kind} state={state} store={store} onUse={onUse} />;
}

function HistoryCheckOffer({
  kind,
  state,
  store: { config, product },
  onUse,
}: {
  kind: VehicleKind;
  state: HistoryCheckState;
  store: HistoryCheckStore;
  onUse: (id: string) => Promise<void>;
}) {
  const { token } = useAuth();
  const [unused, setUnused] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastPurchaseId, setLastPurchaseId] = useState<string | null>(null);
  const storeOn = !!config?.enabled;

  useEffect(() => {
    if (!config?.enabled) return;
    let cancelled = false;
    apiFetch<{ unusedPaidChecks: number | null }>('/api/app/history-check', { token }).then((r) => {
      if (!cancelled && r.ok) setUnused(r.data.unusedPaidChecks ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [config, token]);

  async function use(kindOfCheck: 'free' | 'store', attempts = 1) {
    for (let i = 0; i < attempts; i++) {
      const r = await apiFetch<{ vdiPurchaseId: string }>('/api/app/history-check', {
        method: 'POST',
        token,
        body: { vrm: state.vrm, kind, use: kindOfCheck },
      });
      if (r.ok) {
        setLastPurchaseId(r.data.vdiPurchaseId);
        await onUse(r.data.vdiPurchaseId);
        return;
      }
      // Just paid: RevenueCat can take a moment to list the purchase.
      if (r.status !== 404 || i === attempts - 1) {
        setMessage(kindOfCheck === 'store' ? `${r.error} Your payment is safe – look the plate up again to use it.` : r.error);
        return;
      }
      await wait(2000);
    }
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    await action();
    setBusy(false);
  }

  const buy = () =>
    run(async () => {
      if (!config || !product) return;
      const result = await buyHistoryCheck(config, product);
      if (result.kind === 'error') setMessage(result.message);
      if (result.kind === 'paid') await use('store', 4);
    });

  // The check is paid for but the data service failed: the purchase stays
  // unspent, so the same id simply runs it again.
  const retryId = state.vdiCheckBlockedReason === 'fetch_failed' ? lastPurchaseId : null;
  const action = retryId ? (
    <PrimaryButton label="Try again" onPress={() => run(() => onUse(retryId))} busy={busy} />
  ) : state.proFreeAvailable ? (
    <PrimaryButton label="Use my free Pro check" onPress={() => run(() => use('free'))} busy={busy} />
  ) : storeOn && unused > 0 ? (
    <PrimaryButton label="Use my paid check" onPress={() => run(() => use('store', 2))} busy={busy} />
  ) : storeOn && product ? (
    <PrimaryButton label={`Buy the check – ${product.priceString}`} onPress={buy} busy={busy} />
  ) : null;

  // Nothing to offer on this account or build - say nothing.
  if (!action && !message) return null;

  return (
    <View style={styles.offer}>
      <Text style={styles.offerTitle}>Full history check</Text>
      <Text style={styles.text}>
        Stolen, written off, outstanding finance, keepers, plate changes and the mileage record – before you hand over any money.
      </Text>
      {retryId ? (
        <Text style={styles.problem}>Your check is paid for, but the data service didn&apos;t answer. Please try again.</Text>
      ) : null}
      {state.reportTier === 'pro' && !state.proFreeAvailable && state.nextFreeReportAt ? (
        <Text style={styles.hint}>Your next free Pro check: {day(state.nextFreeReportAt)}.</Text>
      ) : null}
      {action}
      {message ? (
        <Text style={styles.problem} accessibilityRole="alert">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function Fact({ warn, children }: { warn?: boolean; children: string }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.mark, warn ? styles.markWarn : styles.markOk]}>{warn ? '!' : '✓'}</Text>
      <Text style={[styles.text, styles.flex, warn && styles.warn]}>{children}</Text>
    </View>
  );
}

function HistoryReport({ kind, state, check: v }: { kind: VehicleKind; state: HistoryCheckState; check: VdiCheck }) {
  const noun = kind === 'bike' ? 'bike' : 'car';
  const latestKeeper = v.keeperChanges.length > 0 ? v.keeperChanges[v.keeperChanges.length - 1] : null;
  const colour =
    v.originalColour && v.currentColour && v.originalColour !== v.currentColour
      ? `Colour changed: ${v.originalColour.toLowerCase()} → ${v.currentColour.toLowerCase()}`
      : v.currentColour
        ? `Colour: ${v.currentColour.toLowerCase()}${v.colourChangeCount > 0 ? ` (${plural(v.colourChangeCount, 'change')} on record)` : ''}`
        : null;

  return (
    <View style={styles.report}>
      <Text style={styles.reportTitle}>✓ Full history check</Text>
      <Text style={styles.hint}>
        {state.vdiCheckPricePaidPence ? '' : 'Your free Pro check. '}
        {state.vdiCheckPurchasedAt ? `Checked ${day(state.vdiCheckPurchasedAt)}.` : ''}
        {state.vdiCheckExpiresAt ? ` Look this plate up again free until ${day(state.vdiCheckExpiresAt)}.` : ''}
      </Text>

      <Text style={styles.listTitle}>Safety</Text>
      <Fact warn={v.isStolen}>{v.isStolen ? 'Recorded as stolen' : 'No stolen marker found'}</Fact>
      {!v.hasWriteOffRecord ? (
        <Fact>No write-off record found</Fact>
      ) : v.writeOffRecords && v.writeOffRecords.length > 0 ? (
        v.writeOffRecords.map((r, i) => (
          <Fact key={i} warn>
            {[
              r.category ? `Written off – category ${r.category}` : (r.status ?? 'Write-off recorded'),
              r.lossDate ? day(r.lossDate) : null,
              r.insurerName,
            ]
              .filter(Boolean)
              .join(', ')}
          </Fact>
        ))
      ) : (
        <Fact warn>{`${plural(v.writeOffRecordCount, 'write-off record')} on file`}</Fact>
      )}
      {!v.hasOutstandingFinance ? (
        <Fact>No outstanding finance found</Fact>
      ) : v.financeRecords.length > 0 ? (
        v.financeRecords.map((f, i) => (
          <Fact key={i} warn>
            {[`Outstanding finance${f.agreementType ? ` (${f.agreementType})` : ''}`, f.financeCompany, f.agreementDate ? `from ${day(f.agreementDate)}` : null]
              .filter(Boolean)
              .join(', ')}
          </Fact>
        ))
      ) : (
        <Fact warn>Outstanding finance on file</Fact>
      )}
      {v.isScrapped ? <Fact warn>Recorded as scrapped</Fact> : null}
      {v.certificateOfDestructionIssued ? <Fact warn>Certificate of destruction issued</Fact> : null}
      {v.isImported ? <Fact>{`Imported${v.isImportedFromOutsideEu ? ' from outside the EU' : ''}`}</Fact> : null}

      <Text style={styles.listTitle}>Keepers and plates</Text>
      {/* The previous-keeper count, when there is one, is the whole story;
          the change list only holds the changes on file. */}
      {latestKeeper?.numberOfPreviousKeepers != null ? (
        <Text style={styles.text}>
          • {plural(latestKeeper.numberOfPreviousKeepers, 'previous keeper')} – the current one since {day(latestKeeper.keeperStartDate)}
        </Text>
      ) : (
        <>
          <Text style={styles.text}>• {plural(v.keeperChangeCount, 'keeper change')} on record</Text>
          {latestKeeper ? <Text style={styles.text}>• Current keeper since {day(latestKeeper.keeperStartDate)}</Text> : null}
        </>
      )}
      <Text style={styles.text}>• {plural(v.v5cReissueCount, 'V5C logbook reissue')}</Text>
      <Text style={styles.text}>• {plural(v.plateChangeCount, 'plate change')} on record</Text>
      {(v.plateChanges ?? []).map((p, i) => (
        <Text key={i} style={styles.hint}>
          {'   '}
          {p.previousVrm ?? '?'} → {p.currentVrm ?? '?'}
          {p.dateOfTransaction ? `, ${day(p.dateOfTransaction)}` : ''}
        </Text>
      ))}
      {colour ? <Text style={styles.text}>• {colour}</Text> : null}
      {v.dateFirstRegisteredInUk ? <Text style={styles.text}>• First registered in the UK {day(v.dateFirstRegisteredInUk)}</Text> : null}

      <Text style={styles.listTitle}>Mileage</Text>
      <Fact warn={v.mileageAnomalyDetected}>
        {v.mileageAnomalyDetected
          ? 'Mileage anomaly flagged – ask for receipts and MOT certificates that back the reading up'
          : 'No mileage anomaly flagged'}
      </Fact>
      {v.calculatedAverageAnnualMileage != null && v.averageMileageForAge != null ? (
        <Text style={styles.hint}>
          This {noun} has averaged about {Math.round(v.calculatedAverageAnnualMileage).toLocaleString('en-GB')} miles a year;{' '}
          {typicalMileageText(v)}.
        </Text>
      ) : null}

      <Text style={styles.hint}>
        The same report, with the technical details, is on roadverdict.co.uk under Full history check when you sign in with this email.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  offer: { gap: 8, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Brand.amber, backgroundColor: '#FFF8EC' },
  offerTitle: { fontSize: 17, fontWeight: '800', color: Brand.ink },
  report: { gap: 6, padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#1A6B4A', backgroundColor: '#F1F8F4' },
  reportTitle: { fontSize: 17, fontWeight: '800', color: '#1A6B4A' },
  listTitle: { fontSize: 15, fontWeight: '700', color: Brand.ink, marginTop: 6 },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  hint: { fontSize: 13, lineHeight: 19, color: Brand.muted },
  problem: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  fact: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  mark: { width: 20, fontSize: 15, lineHeight: 22, fontWeight: '800', textAlign: 'center' },
  markOk: { color: '#1A6B4A' },
  markWarn: { color: Brand.danger },
  warn: { color: Brand.danger, fontWeight: '600' },
});
