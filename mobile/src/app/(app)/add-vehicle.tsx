// Adds a motorcycle or car, the way the website's AddBikeForm and
// AddCarForm do: the registration is looked up first (DVLA, via the
// website), which also says whether it's a bike or a car; a vehicle that's
// already on RoadVerdict is caught before anything is filled in; then the
// details form starts from what the lookup found, with the last MOT's
// mileage as the floor. Saving goes through the same routes as the web,
// and imports the vehicle's MOT history straight after, as the web does.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { OptionPicker } from '@/components/option-picker';
import { Card, ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { doneBarFor } from '@/components/keyboard-done';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { OptionGroup } from '@/lib/form-options';
import { groupNumber, parseMileage, parseNumber } from '@/lib/mileage';
import { matchMake, matchModel, mapDvlaFuelType, useVehicleOptions, type CarFuelType, type VehicleOptions } from '@/lib/vehicle-options';
import { useVehicle, type VehicleKind } from '@/lib/vehicle';

type Lookup = {
  vrm: string;
  make: string;
  model: string;
  year: number | null;
  fuelType: string;
  engineCapacityCc: number | null;
  plateInRetention: boolean;
  vehicleType: 'motorcycle' | 'four-wheeled' | 'unknown';
};

type Step =
  | { name: 'plate' }
  | { name: 'choose-kind'; lookup: Lookup | null; message: string }
  | { name: 'duplicate'; kind: VehicleKind; own: boolean; vehicleId?: string; lookup: Lookup | null }
  | { name: 'requested'; kind: VehicleKind }
  | { name: 'details'; kind: VehicleKind; lookup: Lookup | null; fresh: boolean };

const NOUN: Record<VehicleKind, string> = { bike: 'motorcycle', car: 'car' };

export default function AddVehicleScreen() {
  const garage = useVehicle();
  const { token, signOut } = useAuth();
  const vehicleOptions = useVehicleOptions();
  const [registration, setRegistration] = useState('');
  const [step, setStep] = useState<Step>({ name: 'plate' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);

  const limit = garage.vehicleLimit;
  const atLimit = !!limit && limit.active >= limit.limit;
  const vrm = registration.trim();

  async function find() {
    if (!vrm || busy) return;
    setBusy(true);
    setMessage(null);
    setLookupFailed(false);
    const result = await apiFetch<Lookup>(`/api/tracker/plate-lookup?vrm=${encodeURIComponent(vrm)}`, { token });
    if (!result.ok) {
      setBusy(false);
      if (result.status === 401) return signOut();
      setMessage(result.error);
      // Not found, or the lookup service is down - the details can
      // still go in by hand, as on the web. A 429 just needs a moment.
      setLookupFailed(result.status !== 429);
      return;
    }
    if (result.data.vehicleType === 'unknown') {
      setBusy(false);
      setStep({ name: 'choose-kind', lookup: result.data, message: 'We couldn’t tell from DVLA’s record whether that’s a motorcycle or a car.' });
      return;
    }
    await continueAs(result.data.vehicleType === 'motorcycle' ? 'bike' : 'car', result.data);
  }

  // Caught before anything is filled in: a vehicle already on this
  // account, or with someone else's RoadVerdict history.
  async function continueAs(kind: VehicleKind, lookup: Lookup | null) {
    setBusy(true);
    const path = kind === 'bike' ? '/api/tracker/bike-exists' : '/api/cars/car-exists';
    const dup = await apiFetch<{ exists: boolean; belongsToCurrentUser?: boolean; bikeId?: string; carId?: string }>(
      `${path}?registration=${encodeURIComponent(vrm)}`,
      { token }
    );
    setBusy(false);
    if (!dup.ok && dup.status === 401) return signOut();
    if (dup.ok && dup.data.exists) {
      setStep({ name: 'duplicate', kind, own: !!dup.data.belongsToCurrentUser, vehicleId: dup.data.bikeId ?? dup.data.carId, lookup });
      return;
    }
    setStep({ name: 'details', kind, lookup, fresh: false });
  }

  async function requestOwnership(kind: VehicleKind) {
    setBusy(true);
    setMessage(null);
    const result = await apiFetch(kind === 'bike' ? '/api/tracker/bike-transfer/request-ownership' : '/api/cars/car-transfer/request-ownership', {
      method: 'POST',
      token,
      body: { registration: vrm },
    });
    setBusy(false);
    if (result.ok) setStep({ name: 'requested', kind });
    else if (result.status === 401) await signOut();
    else setMessage(result.error);
  }

  function startOver() {
    setStep({ name: 'plate' });
    setMessage(null);
    setLookupFailed(false);
  }

  let body;
  if (atLimit && limit) {
    body = (
      <View style={styles.content}>
        <Card style={styles.panel}>
          <Text style={styles.panelTitle}>Your garage is full</Text>
          <Text style={styles.panelText}>
            Your account can track {limit.limit === 1 ? 'one vehicle' : `${limit.limit} vehicles`} at a time – bikes and cars together.
            Vehicles you&apos;ve transferred to a new owner don&apos;t count.
          </Text>
          <Text style={styles.panelText}>
            To make room, transfer a vehicle you&apos;ve sold to its new owner, or remove one: tap the vehicle&apos;s name on Home, then ⋯ next to it.
          </Text>
          <Pressable onPress={() => router.replace('/transfer')} accessibilityRole="button" style={({ pressed }) => [styles.fullAction, pressed && { opacity: 0.85 }]}>
            <Icon name="transfer" size={18} color={Brand.asphalt} />
            <Text style={styles.fullActionLabel}>Transfer a vehicle</Text>
          </Pressable>
        </Card>
      </View>
    );
  } else if (step.name === 'plate' || step.name === 'choose-kind') {
    body = (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label} nativeID="reg-label">
          Registration
        </Text>
        <TextInput
          value={registration}
          onChangeText={(t) => {
            setRegistration(t.toUpperCase());
            if (step.name !== 'plate') startOver();
          }}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          maxLength={10}
          returnKeyType="search"
          onSubmitEditing={find}
          placeholder="ENTER REG"
          placeholderTextColor="#8C7A2A"
          accessibilityLabelledBy="reg-label"
          style={styles.plate}
        />

        {step.name === 'plate' ? (
          <>
            <Pressable
              onPress={find}
              disabled={!vrm || busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: !vrm || busy, busy }}
              style={({ pressed }) => [styles.primary, (!vrm || busy) && styles.disabled, pressed && { opacity: 0.85 }]}>
              <Text style={styles.primaryLabel}>{busy ? 'Looking it up…' : 'Find it'}</Text>
            </Pressable>
            <Text style={styles.hint}>
              We look it up with DVLA, so we can fill in the make, model and year for you – and tell whether it&apos;s a bike or a car.
            </Text>
          </>
        ) : null}

        {message ? (
          <Text style={styles.problem} accessibilityRole="alert">
            {message}
          </Text>
        ) : null}

        {step.name === 'choose-kind' || lookupFailed ? (
          <Card style={styles.panel}>
            <Text style={styles.panelText}>{step.name === 'choose-kind' ? step.message : 'You can still add it by entering the details yourself.'} Is it a motorcycle or a car?</Text>
            <View style={styles.pair}>
              {(['bike', 'car'] as const).map((kind) => (
                <Pressable
                  key={kind}
                  onPress={() => continueAs(kind, step.name === 'choose-kind' ? step.lookup : null)}
                  disabled={busy || !vrm}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.secondary, styles.flex, pressed && { opacity: 0.85 }]}>
                  <Text style={styles.secondaryLabel}>{kind === 'bike' ? 'Motorcycle' : 'Car'}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        ) : null}
      </ScrollView>
    );
  } else if (step.name === 'duplicate') {
    const noun = NOUN[step.kind];
    body = (
      <ScrollView contentContainerStyle={styles.content}>
        <PlateSummary registration={vrm} kind={step.kind} onChange={startOver} />
        {step.own ? (
          <Card style={styles.panel}>
            <Text style={styles.panelTitle}>It&apos;s already in your garage</Text>
            <Pressable
              onPress={() => {
                if (step.vehicleId) garage.select({ kind: step.kind, id: step.vehicleId });
                router.back();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
              <Text style={styles.primaryLabel}>Go to this {noun}</Text>
            </Pressable>
          </Card>
        ) : (
          <Card style={styles.panel}>
            <Text style={styles.panelTitle}>This {noun} already has a RoadVerdict history</Text>
            <Text style={styles.panelText}>
              If you&apos;ve bought it, you can ask the current owner to pass its history to you. Starting fresh begins a new record under your
              account instead – the previous owner&apos;s history stays with them.
            </Text>
            <Pressable
              onPress={() => requestOwnership(step.kind)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ busy }}
              style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
              <Text style={styles.primaryLabel}>{busy ? 'Sending…' : 'Request ownership'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setStep({ name: 'details', kind: step.kind, lookup: step.lookup, fresh: true })}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}>
              <Text style={styles.secondaryLabel}>Start fresh</Text>
            </Pressable>
            {message ? (
              <Text style={styles.problem} accessibilityRole="alert">
                {message}
              </Text>
            ) : null}
          </Card>
        )}
      </ScrollView>
    );
  } else if (step.name === 'requested') {
    body = (
      <View style={styles.content}>
        <Card style={styles.panel}>
          <Text style={styles.panelTitle}>Request sent</Text>
          <Text style={styles.panelText}>
            If the current owner approves it, this {NOUN[step.kind]}&apos;s history moves to your account. You&apos;ll get an email either way.
          </Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
            <Text style={styles.primaryLabel}>Done</Text>
          </Pressable>
        </Card>
      </View>
    );
  } else if (!vehicleOptions.options) {
    body = vehicleOptions.failed ? <ErrorState message="The list of makes and models couldn’t be loaded." onRetry={vehicleOptions.retry} /> : <LoadingState />;
  } else {
    body = (
      <DetailsForm
        key={`${step.kind}-${step.lookup?.vrm ?? 'manual'}`}
        kind={step.kind}
        lookup={step.lookup}
        fresh={step.fresh}
        registration={vrm}
        options={vehicleOptions.options}
        onChangeRegistration={startOver}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header">
          Add a vehicle
        </Text>
      </View>
      {body}
    </SafeAreaView>
  );
}

function PlateSummary({ registration, kind, onChange }: { registration: string; kind: VehicleKind; onChange: () => void }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.smallPlate}>
        <Text style={styles.smallPlateText}>{registration}</Text>
      </View>
      <Text style={[styles.hint, styles.flex]}>{kind === 'bike' ? 'Motorcycle' : 'Car'}</Text>
      <Pressable onPress={onChange} accessibilityRole="button" accessibilityLabel="Change the registration" hitSlop={8} style={styles.change}>
        <Text style={styles.changeLabel}>Change</Text>
      </Pressable>
    </View>
  );
}

const OTHER = '__other__';

// Where the details form starts: what the lookup found, matched against
// the curated lists exactly as the web forms match it.
function startingPoint(kind: VehicleKind, lookup: Lookup | null, options: VehicleOptions) {
  const blank = { make: null as string | null, customMake: '', model: null as string | null, customModel: '', customCc: '', year: '', fuelType: 'petrol' as CarFuelType, engineLitres: '', note: null as string | null };
  if (!lookup) return blank;
  const list = kind === 'bike' ? options.bike : options.car;
  const cc = lookup.engineCapacityCc;
  const start = {
    ...blank,
    year: lookup.year ? String(lookup.year) : '',
    fuelType: mapDvlaFuelType(lookup.fuelType ?? '') ?? 'petrol',
    engineLitres: cc ? String(Math.round((cc / 1000) * 10) / 10) : '',
  };
  const notes: string[] = [];
  const make = matchMake(list.makes, lookup.make ?? '');
  const model = make ? matchModel(list.models.filter((m) => m.make === make), lookup.model ?? '') : null;
  if (make && model) {
    Object.assign(start, { make, model: model.model });
    notes.push(`Matched to ${make} ${model.model}.`);
  } else if (make) {
    Object.assign(start, { make, model: OTHER, customModel: lookup.model ?? '', customCc: cc ? String(cc) : '' });
    notes.push(`“${lookup.model}” isn’t in our ${make} list, so it’s filled in below as it is – check it over.`);
  } else {
    Object.assign(start, { make: OTHER, customMake: lookup.make ?? '', model: OTHER, customModel: lookup.model ?? '', customCc: cc ? String(cc) : '' });
    notes.push(`Found “${lookup.make} ${lookup.model}”, which isn’t in our list – it’s filled in below as it is, so check it over.`);
  }
  if (kind === 'car' && start.fuelType === 'hybrid') notes.push('DVLA doesn’t tell a hybrid from a plug-in hybrid – change the fuel type if it’s a plug-in.');
  if (lookup.plateInRetention) notes.push('This plate is in retention, so these details are from the last vehicle it was on – make sure they’re right.');
  return { ...start, note: notes.join(' ') };
}

function DetailsForm({
  kind,
  lookup,
  fresh,
  registration,
  options,
  onChangeRegistration,
}: {
  kind: VehicleKind;
  lookup: Lookup | null;
  fresh: boolean;
  registration: string;
  options: VehicleOptions;
  onChangeRegistration: () => void;
}) {
  const garage = useVehicle();
  const { token, signOut } = useAuth();
  const [start] = useState(() => startingPoint(kind, lookup, options));
  const [make, setMake] = useState(start.make);
  const [customMake, setCustomMake] = useState(start.customMake);
  const [model, setModel] = useState(start.model);
  const [customModel, setCustomModel] = useState(start.customModel);
  const [customCc, setCustomCc] = useState(start.customCc);
  const [fuelType, setFuelType] = useState<CarFuelType>(start.fuelType);
  const [engineLitres, setEngineLitres] = useState(start.engineLitres);
  const [batteryKwh, setBatteryKwh] = useState('');
  const [customBuild, setCustomBuild] = useState(false);
  const [year, setYear] = useState(start.year);
  const [mileage, setMileage] = useState('');
  const [floor, setFloor] = useState<{ miles: number; date: string | null } | null>(null);
  const [mileageConfirmed, setMileageConfirmed] = useState(false);
  const [region, setRegion] = useState(options.defaultRegion);
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState<'adding' | 'mot' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Any change clears the last message - it was about what was there before.
  const edit =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      setProblem(null);
      set(value);
    };

  // The last MOT's recorded mileage, if DVSA has one - the current reading
  // can't be lower. A bike or car too new for an MOT simply has none.
  useEffect(() => {
    if (!lookup) return;
    let cancelled = false;
    apiFetch<{ latestTrustedMileage: number | null; latestTestDate: string | null }>(
      `/api/tracker/mot-history-preview?vrm=${encodeURIComponent(registration)}`,
      { token }
    ).then((r) => {
      if (cancelled || !r.ok || r.data.latestTrustedMileage == null) return;
      setFloor({ miles: r.data.latestTrustedMileage, date: r.data.latestTestDate });
      setMileage(groupNumber(r.data.latestTrustedMileage));
    });
    return () => {
      cancelled = true;
    };
  }, [lookup, registration, token]);

  const list = kind === 'bike' ? options.bike : options.car;
  const makeGroups: OptionGroup[] = [
    { label: '', options: list.makes.map((m) => ({ value: m, label: m })) },
    { label: '', options: [{ value: OTHER, label: 'Other / not in this list' }] },
  ];
  const bikeModels = options.bike.models.filter((m) => m.make === make);
  const modelGroups: OptionGroup[] = [
    {
      label: '',
      options:
        kind === 'bike'
          ? bikeModels.map((m) => ({ value: m.model, label: `${m.model} (${m.engineCC}cc)` }))
          : options.car.models.filter((m) => m.make === make).map((m) => ({ value: m.model, label: m.model })),
    },
    { label: '', options: [{ value: OTHER, label: 'Other / not in this list' }] },
  ];
  const listedBike = kind === 'bike' && model !== OTHER ? bikeModels.find((m) => m.model === model) : undefined;
  const electric = kind === 'car' && fuelType === 'electric';
  const needsYear = !customBuild && !electric;
  const thisYear = new Date().getFullYear();

  function pickMake(value: string) {
    setMake(value);
    setModel(value === OTHER ? OTHER : null);
  }

  // The web forms' own checks, in the same order, before anything is sent.
  function checkForm(): string | null {
    if (!make) return 'Choose the make.';
    if (make === OTHER && !customMake.trim()) return 'Enter the make.';
    if (!model) return 'Choose the model.';
    if (model === OTHER && !customModel.trim()) return 'Enter the model.';
    if (kind === 'bike' && model === OTHER && !(parseNumber(customCc) > 0)) return 'Enter a valid engine size in cc.';
    if (kind === 'car' && !electric && !(parseNumber(engineLitres) > 0)) return 'Enter the engine size in litres.';
    const y = Number(year);
    if (needsYear && !(Number.isInteger(y) && y >= 1900 && y <= thisYear + 1)) return 'Enter the year it was made.';
    const miles = parseMileage(mileage);
    if (!(miles >= 0) || mileage.trim() === '') return 'Enter the current mileage.';
    if (floor && miles < floor.miles) return `The current mileage has to be at least ${floor.miles.toLocaleString('en-GB')} miles – that’s what its last MOT recorded.`;
    if (floor && !mileageConfirmed) return 'Confirm the current mileage before adding it.';
    return null;
  }

  async function add() {
    const invalid = checkForm();
    if (invalid) {
      setProblem(invalid);
      return;
    }
    setProblem(null);
    setSaving('adding');
    const shared = {
      make: make === OTHER ? customMake.trim() : make,
      model: model === OTHER ? customModel.trim() : model,
      isCustomBuild: customBuild,
      registration,
      currentMileage: parseMileage(mileage),
      nickname: nickname.trim(),
      region,
      mayHavePriorHistory: fresh,
    };
    const result =
      kind === 'bike'
        ? await apiFetch<{ bike?: { id: string } }>('/api/tracker/bike', {
            method: 'POST',
            token,
            body: { ...shared, engineCC: listedBike ? listedBike.engineCC : parseNumber(customCc), year: customBuild ? undefined : Number(year) },
          })
        : await apiFetch<{ car?: { id: string } }>('/api/cars/car', {
            method: 'POST',
            token,
            body: {
              ...shared,
              fuelType,
              engineLitres: electric ? undefined : parseNumber(engineLitres),
              batteryKwh: batteryKwh.trim() ? parseNumber(batteryKwh) : undefined,
              year: needsYear ? Number(year) : undefined,
            },
          });
    if (!result.ok) {
      setSaving(null);
      if (result.status === 401) return signOut();
      setProblem(result.error);
      return;
    }
    const id = 'bike' in result.data ? result.data.bike?.id : (result.data as { car?: { id: string } }).car?.id;
    if (id) {
      // Best effort, as on the web: the vehicle is saved either way, and
      // the import skips anything already logged if it's run again later.
      setSaving('mot');
      await apiFetch(kind === 'bike' ? '/api/tracker/mot-history' : '/api/cars/car/mot-history', {
        method: 'POST',
        token,
        body: kind === 'bike' ? { bikeId: id } : { carId: id },
      });
      garage.select({ kind, id });
    }
    garage.refresh();
    router.back();
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <PlateSummary registration={registration} kind={kind} onChange={onChangeRegistration} />
        {start.note ? <Text style={styles.hint}>{start.note}</Text> : null}

        {kind === 'car' ? (
          <OptionPicker
            label="Fuel"
            placeholder="Choose the fuel type"
            groups={[{ label: '', options: options.car.fuelTypes }]}
            value={fuelType}
            onChange={edit((v: string) => setFuelType(v as CarFuelType))}
          />
        ) : null}
        <OptionPicker label="Make" placeholder="Choose the make" groups={makeGroups} value={make} onChange={edit(pickMake)} />
        {make === OTHER ? <Field label="Make (as it's written)" value={customMake} onChangeText={edit(setCustomMake)} placeholder="e.g. Zontes" /> : null}
        {make && make !== OTHER ? (
          <OptionPicker label="Model" placeholder="Choose the model" groups={modelGroups} value={model} onChange={edit(setModel)} />
        ) : null}
        {model === OTHER ? <Field label="Model (as it's written)" value={customModel} onChangeText={edit(setCustomModel)} placeholder={kind === 'bike' ? 'e.g. K 1200 GT' : 'e.g. 320d M Sport'} /> : null}
        {kind === 'bike' && model === OTHER ? (
          <Field label="Engine size (cc)" value={customCc} onChangeText={edit(setCustomCc)} placeholder="e.g. 1200" keyboardType="number-pad" />
        ) : null}
        {listedBike ? <Text style={styles.hint}>Engine size: {listedBike.engineCC}cc</Text> : null}
        {kind === 'car' && !electric ? (
          <Field label="Engine size (litres)" value={engineLitres} onChangeText={edit(setEngineLitres)} placeholder="e.g. 1.6" keyboardType="decimal-pad" />
        ) : null}
        {kind === 'car' && (fuelType === 'electric' || fuelType === 'phev') ? (
          <Field label="Battery size (kWh, optional)" value={batteryKwh} onChangeText={edit(setBatteryKwh)} placeholder="e.g. 64" keyboardType="decimal-pad" />
        ) : null}

        {!electric ? (
          <View style={styles.toggleRow}>
            <View style={styles.flex}>
              <Text style={styles.toggleTitle}>Custom build</Text>
              <Text style={styles.hint}>No single production year applies</Text>
            </View>
            <Switch
              value={customBuild}
              onValueChange={edit(setCustomBuild)}
              accessibilityLabel="Custom build"
              trackColor={{ true: Brand.amber, false: Brand.line }}
              thumbColor="#FFFFFF"
            />
          </View>
        ) : null}
        {needsYear ? <Field label="Year" value={year} onChangeText={edit(setYear)} placeholder={`e.g. ${thisYear - 5}`} keyboardType="number-pad" /> : null}

        <Field
          label="Current mileage (miles)"
          value={mileage}
          onChangeText={edit((t: string) => {
            setMileage(t);
            setMileageConfirmed(false);
          })}
          placeholder="e.g. 12500"
          keyboardType="number-pad"
          hint={
            floor
              ? `Its last MOT${floor.date ? ` (${new Date(floor.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''} recorded ${floor.miles.toLocaleString('en-GB')} miles – the current reading can’t be lower.`
              : undefined
          }
        />
        {floor ? (
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleTitle, styles.flex]}>This is its real current mileage</Text>
            <Switch
              value={mileageConfirmed}
              onValueChange={edit(setMileageConfirmed)}
              accessibilityLabel="This is its real current mileage"
              trackColor={{ true: Brand.amber, false: Brand.line }}
              thumbColor="#FFFFFF"
            />
          </View>
        ) : null}

        <OptionPicker label="Where you keep and run it" placeholder="Choose the region" groups={[{ label: '', options: options.regions }]} value={region} onChange={edit(setRegion)} />
        <Field label="Nickname (optional)" value={nickname} onChangeText={edit(setNickname)} placeholder={kind === 'bike' ? 'e.g. The Tiger' : 'e.g. The Family Bus'} />

        <Text style={styles.hint}>
          {registration} is saved as its original registration. It can&apos;t be removed later – only added to, if the plate changes – so a future
          buyer can trust its history belongs to it.
        </Text>

      </ScrollView>

      <View style={styles.footer}>
        {/* Here rather than at the end of the long form, so it's never
            scrolled out of sight. */}
        {problem ? (
          <Text style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {problem}
          </Text>
        ) : null}
        <Pressable
          onPress={add}
          disabled={saving !== null}
          accessibilityRole="button"
          accessibilityState={{ busy: saving !== null }}
          style={({ pressed }) => [styles.primary, saving !== null && styles.disabled, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryLabel}>
            {saving === 'adding' ? 'Adding…' : saving === 'mot' ? 'Fetching its MOT history…' : `Add ${NOUN[kind]}`}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  hint,
  keyboardType = 'default',
  ...input
}: {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'number-pad' | 'decimal-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput {...input} keyboardType={keyboardType} inputAccessoryViewID={doneBarFor(keyboardType)} accessibilityLabel={label} placeholderTextColor="#A7A49C" style={styles.input} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, marginTop: 4, borderRadius: 12, backgroundColor: Brand.amber },
  fullActionLabel: { fontSize: 16, fontWeight: '700', color: Brand.asphalt },
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { flex: 1, fontSize: 28, fontWeight: '800', color: Brand.ink },
  content: { padding: 20, gap: 16 },
  label: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  // A UK number plate: yellow, black, bold.
  plate: {
    height: 68,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Brand.asphalt,
    backgroundColor: '#F7D117',
    textAlign: 'center',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#111111',
  },
  primary: { height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
  disabled: { opacity: 0.5 },
  secondary: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryLabel: { fontSize: 16, fontWeight: '700', color: Brand.ink },
  pair: { flexDirection: 'row', gap: 12 },
  hint: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  problem: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  panel: { padding: 16, gap: 12 },
  panelTitle: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  panelText: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  smallPlate: { borderRadius: 6, borderWidth: 1.5, borderColor: Brand.asphalt, backgroundColor: '#F7D117', paddingHorizontal: 10, paddingVertical: 4 },
  smallPlateText: { fontSize: 16, fontWeight: '800', letterSpacing: 1.5, color: '#111111' },
  change: { minHeight: 44, justifyContent: 'center' },
  changeLabel: { fontSize: 15, fontWeight: '700', color: Brand.amberInk },
  field: { gap: 6 },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    fontSize: 17,
    color: Brand.ink,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
  },
  toggleTitle: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  footer: { gap: 10, paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: Brand.line, backgroundColor: Brand.paper },
});
