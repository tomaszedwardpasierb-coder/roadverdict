// The Vault: the selected vehicle's documents - V5C, insurance, MOT and
// the rest - behind Pro, two-step sign-in and a fresh code every time it's
// opened, exactly as on the website. Locks by itself after 10 quiet
// minutes, whenever the app is left, or with "Lock now".
import * as DocumentPicker from 'expo-document-picker';
import { requireOptionalNativeModule } from 'expo';
import { Directory, File } from 'expo-file-system';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CodeInput } from '@/components/code-input';
import { Icon, type IconName } from '@/components/icon';
import { ProLock } from '@/components/pro-lock';
import { Card, ErrorState, LoadingState } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch, emailFromToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import {
  declineQuickUnlock,
  isThisPhoneTrusted,
  shouldOfferQuickUnlock,
  trustThisPhone,
  unlockWithThisPhone,
} from '@/lib/trusted-device';
import { useApi } from '@/lib/use-api';
import {
  categoryLabel,
  checkVaultExpiry,
  fetchVaultFile,
  formatBytes,
  lockVault,
  MAX_DOCUMENTS,
  MAX_FILE_BYTES,
  setVaultToken,
  uploadVaultDocument,
  useVaultUnlocked,
  vaultFetch,
  VAULT_CATEGORIES,
  whileVaultOpen,
  type PreviousAccess,
  type VaultCategory,
  type VaultDocument,
} from '@/lib/vault';
import { useVehicle, type GarageVehicle } from '@/lib/vehicle';

type Account = { twoFactorEnabled: boolean; isPro: boolean };

// expo-intent-launcher's native side, looked up rather than imported: it
// arrived in build 7, and build 6 (no such module) still gets this screen
// over the air - there a PDF falls back to the share sheet.
const intentLauncher = requireOptionalNativeModule<{
  startActivity(action: string, params: { data?: string; type?: string; flags?: number }): Promise<unknown>;
}>('ExpoIntentLauncher');

export default function VaultScreen() {
  const { selected } = useVehicle();
  const account = useApi<Account>('/api/app/account');
  const unlocked = useVaultUnlocked();
  const [previous, setPrevious] = useState<PreviousAccess | null>(null);
  const [openedWithCode, setOpenedWithCode] = useState(false);

  // Lock the screen at the moment the server's quiet window runs out.
  useEffect(() => {
    const timer = setInterval(checkVaultExpiry, 15_000);
    return () => clearInterval(timer);
  }, []);

  if (!selected) return null;

  let body;
  if (account.loading && !account.data) body = <LoadingState />;
  else if (account.error && !account.data) body = <ErrorState message={account.error} onRetry={account.retry} />;
  else if (account.data && !account.data.isPro)
    body = (
      <View style={styles.pad}>
        <ProLock
          feature="The Vault"
          description="Your V5C, insurance certificate, MOT and every other document for this vehicle, in one encrypted place that only you can open - with a fresh two-step code each time."
        />
      </View>
    );
  else if (account.data && !account.data.twoFactorEnabled) body = <TwoFactorNeeded />;
  else if (!unlocked)
    body = (
      <Unlock
        onUnlocked={(prev, withCode) => {
          setPrevious(prev);
          setOpenedWithCode(withCode);
        }}
      />
    );
  else body = <Documents vehicle={selected} previous={previous} offerQuickUnlock={openedWithCode} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.back}>
          <Icon name="chevronRight" size={26} color={Brand.ink} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.title} accessibilityRole="header">
            The Vault
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {[selected.name, selected.registration].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {unlocked ? <LockButton /> : null}
      </View>
      {body}
    </SafeAreaView>
  );
}

function LockButton() {
  const { token } = useAuth();
  return (
    <Pressable
      onPress={() => lockVault(token)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.lockButton, pressed && { opacity: 0.85 }]}>
      <Icon name="lock" size={16} color={Brand.ink} />
      <Text style={styles.lockLabel}>Lock now</Text>
    </Pressable>
  );
}

function TwoFactorNeeded() {
  return (
    <View style={styles.pad}>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Turn on two-step sign-in first</Text>
        <Text style={styles.text}>
          The Vault only opens with a code from your authenticator app, so your documents stay yours even if someone gets into your email.
        </Text>
        <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryLabel}>Go to Settings</Text>
        </Pressable>
      </Card>
    </View>
  );
}

function Unlock({ onUnlocked }: { onUnlocked: (previous: PreviousAccess | null, withCode: boolean) => void }) {
  const { token, signOut } = useAuth();
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null while checking; true shows the fingerprint/PIN option first.
  const [trusted, setTrusted] = useState<boolean | null>(null);
  const [showCode, setShowCode] = useState(false);

  const openWithPhone = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await unlockWithThisPhone(token);
    setBusy(false);
    if (result.ok) {
      onUnlocked(result.previousAccess, false);
      return;
    }
    if (result.status === 401 && result.reason === 'error') return signOut();
    if (result.reason === 'not-trusted') setTrusted(false);
    if (result.reason !== 'cancelled' && result.error) setError(result.error);
    setShowCode(true);
  }, [token, onUnlocked, signOut]);

  // A trusted phone asks for the fingerprint, face or PIN straight away.
  useEffect(() => {
    let cancelled = false;
    isThisPhoneTrusted(token ? emailFromToken(token) : null).then((yes) => {
      if (cancelled) return;
      setTrusted(yes);
      if (yes) openWithPhone();
    });
    return () => {
      cancelled = true;
    };
    // Once, on opening - not again whenever the callback changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open(value: string) {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch<{ vaultToken?: string; previousAccess?: PreviousAccess | null }>('/api/vault/reauth', {
      method: 'POST',
      token,
      body: { code: value.trim() },
    });
    setBusy(false);
    if (!result.ok) {
      if (result.status === 401 && result.error !== 'Incorrect code.') return signOut();
      setError(result.error);
      setCode('');
      return;
    }
    if (!result.data.vaultToken) {
      setError('The Vault couldn’t be opened. Try again.');
      return;
    }
    onUnlocked(result.data.previousAccess ?? null, true);
    setVaultToken(result.data.vaultToken);
  }

  if (trusted === null) return <LoadingState />;

  if (trusted && !showCode) {
    return (
      <View style={styles.pad}>
        <View style={styles.lockIcon}>
          <Icon name="lock" size={28} color={Brand.asphalt} />
        </View>
        <Text style={styles.unlockTitle}>Open with your fingerprint or PIN</Text>
        <Text style={styles.textCentered}>This phone is trusted to open the Vault without an authenticator code.</Text>
        <Pressable
          onPress={openWithPhone}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          style={({ pressed }) => [styles.primary, busy && styles.dim, pressed && { opacity: 0.85 }]}>
          {busy ? <ActivityIndicator color={Brand.asphalt} /> : <Text style={styles.primaryLabel}>Open the Vault</Text>}
        </Pressable>
        <Pressable onPress={() => setShowCode(true)} accessibilityRole="button" hitSlop={6} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>Use a code instead</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior="height">
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <View style={styles.lockIcon}>
          <Icon name="lock" size={28} color={Brand.asphalt} />
        </View>
        <Text style={styles.unlockTitle}>Enter your code to open it</Text>
        <Text style={styles.textCentered}>
          {useBackup
            ? 'Enter one of the backup codes you saved when you turned on two-step sign-in. Each works once.'
            : 'Open your authenticator app and enter the 6-digit code it shows for RoadVerdict.'}
        </Text>
        {useBackup ? (
          <TextInput
            value={backup}
            onChangeText={setBackup}
            onSubmitEditing={() => open(backup)}
            placeholder="Backup code"
            placeholderTextColor="#A7A49C"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            accessibilityLabel="Backup code"
            style={styles.input}
          />
        ) : (
          <CodeInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (error) setError(null);
            }}
            onComplete={open}
            hasError={!!error}
            light
            accessibilityLabel="6-digit code from your authenticator app"
          />
        )}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Pressable
          onPress={() => open(useBackup ? backup : code)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          style={({ pressed }) => [styles.primary, busy && styles.dim, pressed && { opacity: 0.85 }]}>
          {busy ? <ActivityIndicator color={Brand.asphalt} /> : <Text style={styles.primaryLabel}>Open the Vault</Text>}
        </Pressable>
        <Pressable onPress={() => setUseBackup((v) => !v)} accessibilityRole="button" hitSlop={6} style={styles.textButton}>
          <Text style={styles.textButtonLabel}>{useBackup ? 'Use my authenticator app' : 'Use a backup code instead'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function QuickUnlockOffer() {
  const { token } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    shouldOfferQuickUnlock(token ? emailFromToken(token) : null).then(setShow);
  }, [token]);

  if (message) return <Text style={message.ok ? styles.success : styles.error}>{message.text}</Text>;
  if (!show) return null;

  async function yes() {
    setBusy(true);
    const result = await whileVaultOpen(() => trustThisPhone(token));
    setBusy(false);
    setShow(false);
    setMessage(
      result.ok
        ? { ok: true, text: 'Done - next time, open the Vault and sign in with your fingerprint or PIN. You can stop this in Settings on the website.' }
        : { ok: false, text: result.error }
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.cardTitle}>Open it with your fingerprint next time?</Text>
      <Text style={styles.text}>
        Trust this phone and the Vault opens - and signing in is confirmed - with your fingerprint, face or phone PIN instead of a code from your authenticator app.
      </Text>
      <View style={styles.row}>
        <Pressable
          onPress={yes}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, styles.flex, busy && styles.dim, pressed && { opacity: 0.85 }]}>
          {busy ? <ActivityIndicator color={Brand.asphalt} /> : <Text style={styles.primaryLabel}>Yes, trust it</Text>}
        </Pressable>
        <Pressable
          onPress={() => {
            declineQuickUnlock();
            setShow(false);
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, styles.flex, pressed && { opacity: 0.85 }]}>
          <Text style={styles.secondaryLabel}>Not now</Text>
        </Pressable>
      </View>
    </Card>
  );
}

function Documents({ vehicle, previous, offerQuickUnlock }: { vehicle: GarageVehicle; previous: PreviousAccess | null; offerQuickUnlock: boolean }) {
  const { token, signOut } = useAuth();
  const [documents, setDocuments] = useState<VaultDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<{ doc: VaultDocument; uri: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await vaultFetch<{ documents: VaultDocument[] }>(
      `/api/vault/documents?vehicleKind=${vehicle.kind}&vehicleId=${encodeURIComponent(vehicle.id)}`,
      token
    );
    if (result.ok) setDocuments(result.data.documents);
    else if (result.status === 401 && result.error !== 'vault_locked') await signOut();
    else if (result.error !== 'vault_locked') setError(result.error);
  }, [vehicle.kind, vehicle.id, token, signOut]);

  useEffect(() => {
    load();
  }, [load]);

  // Fetched into the Vault's own cache folder first (emptied whenever it
  // locks): a photo then shows full screen here, a PDF opens in whichever
  // PDF app the phone has - read-only, with permission just for that file.
  async function openDocument(doc: VaultDocument) {
    setBusyId(doc.id);
    setNotice(null);
    const file = await fetchVaultFile(token, doc, 'preview');
    setBusyId(null);
    if (!file.ok) {
      if (!file.locked) setError(file.error);
      return;
    }
    if (doc.fileType !== 'application/pdf') {
      setViewing({ doc, uri: file.uri });
      return;
    }
    await whileVaultOpen(async () => {
      try {
        if (!intentLauncher) throw new Error('No intent launcher in this build');
        await intentLauncher.startActivity('android.intent.action.VIEW', {
          data: new File(file.uri).contentUri,
          type: 'application/pdf',
          flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        });
      } catch {
        // No PDF app on the phone - offer the apps that can take it.
        await Sharing.shareAsync(file.uri, { mimeType: doc.fileType, dialogTitle: doc.label || doc.fileName });
      }
    });
  }

  function withStampChoice(title: string, action: (watermark: boolean) => void) {
    Alert.alert(title, 'Copies can be stamped with your email and the time, so one that goes astray can be traced back.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Without the stamp', onPress: () => action(false) },
      { text: 'Stamped copy', onPress: () => action(true) },
    ]);
  }

  // A copy kept on the phone, in a folder the owner picks (e.g. Downloads).
  function saveCopy(doc: VaultDocument) {
    withStampChoice('Save to phone', async (watermark) => {
      setBusyId(doc.id);
      setNotice(null);
      const file = await fetchVaultFile(token, doc, 'download', watermark);
      if (!file.ok) {
        setBusyId(null);
        if (!file.locked) setError(file.error);
        return;
      }
      try {
        const saved = await whileVaultOpen(async () => {
          const folder = await Directory.pickDirectoryAsync();
          const name = doc.fileName.replace(/[\\/:*?"<>|]+/g, '_') || 'document';
          folder.createFile(name, doc.fileType).write(await new File(file.uri).bytes());
          return folder.name;
        });
        setNotice(`Saved to ${saved}.`);
      } catch {
        // Cancelled the folder picker, or the folder couldn't be written to.
      } finally {
        setBusyId(null);
      }
    });
  }

  function shareCopy(doc: VaultDocument) {
    const send = async (watermark: boolean) => {
      setBusyId(doc.id);
      const file = await fetchVaultFile(token, doc, 'download', watermark);
      setBusyId(null);
      if (!file.ok) {
        if (!file.locked) setError(file.error);
        return;
      }
      await whileVaultOpen(() => Sharing.shareAsync(file.uri, { mimeType: doc.fileType, dialogTitle: doc.label || doc.fileName }));
    };
    withStampChoice('Share a copy', send);
  }

  function confirmDelete(doc: VaultDocument) {
    Alert.alert('Delete this document?', `${doc.label || doc.fileName} is removed from the Vault for good.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusyId(doc.id);
          const result = await vaultFetch(`/api/vault/documents/${encodeURIComponent(doc.id)}`, token, { method: 'DELETE' });
          setBusyId(null);
          if (result.ok) load();
          else if (result.error !== 'vault_locked') setError(result.error);
        },
      },
    ]);
  }

  if (!documents && !error) return <LoadingState />;

  const noun = vehicle.kind === 'bike' ? 'bike' : 'car';
  const groups = VAULT_CATEGORIES.map((c) => ({ ...c, docs: (documents ?? []).filter((d) => d.category === c.key) })).filter((g) => g.docs.length > 0);
  const full = (documents?.length ?? 0) >= MAX_DOCUMENTS;

  return (
    <>
      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.text}>
          {documents && documents.length === 0
            ? `Your ${noun}’s documents in one secure place - V5C, insurance certificate, MOT, or anything you’d hate to lose. Encrypted at rest; only you can open it.`
            : 'Encrypted at rest. Only you can open it.'}
        </Text>
        {previous ? (
          <Text style={styles.previous}>
            Last opened {new Date(previous.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} -{' '}
            {previous.browser}
            {previous.country ? `, ${previous.country}` : ''}
          </Text>
        ) : null}
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {notice ? <Text style={styles.success}>{notice}</Text> : null}
        {offerQuickUnlock ? <QuickUnlockOffer /> : null}

        <Pressable
          onPress={() => setAdding(true)}
          disabled={full}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, styles.row, full && styles.dim, pressed && { opacity: 0.85 }]}>
          <Icon name="plus" size={20} color={Brand.asphalt} />
          <Text style={styles.primaryLabel}>Add a document</Text>
        </Pressable>
        {full ? <Text style={styles.hint}>This {noun} has {MAX_DOCUMENTS} documents - delete one to add another.</Text> : null}

        {groups.map((group) => (
          <View key={group.key} style={styles.group}>
            <Text style={styles.groupTitle}>{group.label}</Text>
            <Card>
              {group.docs.map((doc, i) => (
                <View key={doc.id} style={[styles.doc, i > 0 && styles.divider]}>
                  <Pressable
                    onPress={() => openDocument(doc)}
                    accessibilityRole="button"
                    accessibilityHint="Opens the document"
                    style={({ pressed }) => [styles.docMain, pressed && { opacity: 0.85 }]}>
                    <Icon name={doc.fileType === 'application/pdf' ? 'bill' : 'camera'} size={22} color={Brand.amberInk} />
                    <View style={styles.flex}>
                      <Text style={styles.docName} numberOfLines={2}>
                        {doc.label || doc.fileName}
                      </Text>
                      <Text style={styles.docMeta}>
                        {formatBytes(doc.fileSize)} · added {new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    </View>
                    {busyId === doc.id ? <ActivityIndicator color={Brand.amberInk} /> : null}
                  </Pressable>
                  <View style={styles.docActions}>
                    <SmallButton icon="chevronRight" label="Open" onPress={() => openDocument(doc)} disabled={busyId !== null} />
                    <SmallButton icon="chevronDown" label="Save to phone" onPress={() => saveCopy(doc)} disabled={busyId !== null} />
                    <SmallButton icon="share" label="Share a copy" onPress={() => shareCopy(doc)} disabled={busyId !== null} />
                    <SmallButton icon="close" label="Delete" danger onPress={() => confirmDelete(doc)} disabled={busyId !== null} />
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>

      <AddDocument vehicle={vehicle} visible={adding} onClose={() => setAdding(false)} onAdded={load} />
      <ImageViewer viewing={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function SmallButton({ icon, label, danger, disabled, onPress }: { icon: IconName; label: string; danger?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.small, disabled && styles.dim, pressed && { opacity: 0.85 }]}>
      <Icon name={icon} size={16} color={danger ? Brand.danger : Brand.ink} />
      <Text style={[styles.smallLabel, danger && { color: Brand.danger }]}>{label}</Text>
    </Pressable>
  );
}

// Photos open full screen here; they're never saved to the phone - held in
// memory only, like receipts.
function ImageViewer({ viewing, onClose }: { viewing: { doc: VaultDocument; uri: string } | null; onClose: () => void }) {
  const doc = viewing?.doc ?? null;
  return (
    <Modal visible={doc !== null} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.viewer} edges={['top', 'bottom']}>
        <View style={styles.viewerBar}>
          <Text style={styles.viewerTitle} numberOfLines={1}>
            {doc?.label || doc?.fileName}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.viewerClose}>
            <Icon name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
        {viewing ? (
          <Image
            source={{ uri: viewing.uri }}
            cachePolicy="none"
            contentFit="contain"
            style={styles.flex}
            alt={viewing.doc.label || viewing.doc.fileName}
          />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

type Picked = { uri: string; name: string; mimeType: string; size: number | null };

function AddDocument({ vehicle, visible, onClose, onAdded }: { vehicle: GarageVehicle; visible: boolean; onClose: () => void; onAdded: () => void }) {
  const { token, signOut } = useAuth();
  const [category, setCategory] = useState<VaultCategory | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setCategory(null);
    setLabel('');
    setError(null);
    onClose();
  }

  async function pick(source: 'camera' | 'photos' | 'file') {
    if (!category || busy) return;
    setError(null);
    const picked = await whileVaultOpen<Picked | null | 'no-camera'>(async () => {
      if (source === 'file') {
        const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true });
        const asset = result.canceled ? null : result.assets[0];
        return asset ? { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? '', size: asset.size ?? null } : null;
      }
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return 'no-camera';
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
      const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      return asset ? { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', mimeType: asset.mimeType ?? 'image/jpeg', size: asset.fileSize ?? null } : null;
    });
    if (picked === 'no-camera') {
      setError('Camera access is off. Allow it in your phone’s settings, or choose a photo or file instead.');
      return;
    }
    if (!picked) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(picked.mimeType)) {
      setError('Only PDF, JPG or PNG files can go in the Vault.');
      return;
    }
    if (picked.size !== null && picked.size > MAX_FILE_BYTES) {
      setError('That file is too large - 10MB is the most one document can be.');
      return;
    }
    setBusy(true);
    const result = await uploadVaultDocument(token, { ...picked, vehicleKind: vehicle.kind, vehicleId: vehicle.id, category, label });
    setBusy(false);
    if (result.ok) {
      onAdded();
      close();
      return;
    }
    if (result.status === 401 && result.error !== 'vault_locked') return signOut();
    if (result.error === 'vault_locked') return close();
    setError(result.error);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={[styles.flex, styles.padLeft]}>
            <Text style={styles.title} accessibilityRole="header">
              Add a document
            </Text>
          </View>
          <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={styles.back}>
            <Icon name="close" size={24} color={Brand.ink} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>What is it?</Text>
          <View style={styles.categories} accessibilityRole="radiogroup">
            {VAULT_CATEGORIES.map((c) => (
              <Pressable
                key={c.key}
                onPress={() => setCategory(c.key)}
                accessibilityRole="radio"
                accessibilityState={{ selected: category === c.key }}
                style={[styles.category, category === c.key && styles.categoryOn]}>
                <Text style={[styles.categoryLabel, category === c.key && styles.categoryLabelOn]}>{c.label}</Text>
                <Text style={styles.categoryExamples}>{c.examples}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label} nativeID="vault-label">
            Name it (optional)
          </Text>
          <TextInput
            accessibilityLabelledBy="vault-label"
            value={label}
            onChangeText={setLabel}
            placeholder="e.g. V5C"
            placeholderTextColor="#A7A49C"
            style={styles.input}
          />

          <Text style={styles.label}>Add it from</Text>
          {busy ? (
            <View style={styles.uploading}>
              <ActivityIndicator color={Brand.amberInk} />
              <Text style={styles.text}>Adding it to the Vault…</Text>
            </View>
          ) : (
            <View style={styles.sources}>
              <SourceButton icon="camera" label="Camera" disabled={!category} onPress={() => pick('camera')} />
              <SourceButton icon="home" label="Photos" disabled={!category} onPress={() => pick('photos')} />
              <SourceButton icon="bill" label="PDF or file" disabled={!category} onPress={() => pick('file')} />
            </View>
          )}
          {!category ? <Text style={styles.hint}>Choose what it is first.</Text> : <Text style={styles.hint}>PDF, JPG or PNG, up to 10MB.</Text>}
          {error ? (
            <Text style={styles.error} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SourceButton({ icon, label, disabled, onPress }: { icon: IconName; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.source, disabled && styles.dim, pressed && { opacity: 0.85 }]}>
      <Icon name={icon} size={24} color={Brand.ink} />
      <Text style={styles.sourceLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.paper },
  flex: { flex: 1 },
  pad: { padding: 20, gap: 14 },
  padLeft: { paddingLeft: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', transform: [{ scaleX: -1 }] },
  title: { fontSize: 28, fontWeight: '800', color: Brand.ink },
  subtitle: { fontSize: 13, color: Brand.muted },
  lockButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, marginRight: 8, borderRadius: 999, borderWidth: 1.5, borderColor: Brand.line },
  lockLabel: { fontSize: 14, fontWeight: '700', color: Brand.ink },
  card: { padding: 16, gap: 12 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: Brand.ink },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  textCentered: { fontSize: 15, lineHeight: 22, color: Brand.muted, textAlign: 'center' },
  hint: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  previous: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  error: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  lockIcon: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: Brand.amber, marginTop: 12 },
  unlockTitle: { fontSize: 22, fontWeight: '800', color: Brand.ink, textAlign: 'center' },
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
  primary: { height: 56, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 17, fontWeight: '700', color: Brand.asphalt },
  secondary: { height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  success: { fontSize: 15, lineHeight: 22, color: '#1A6B4A' },
  row: { flexDirection: 'row', gap: 8 },
  dim: { opacity: 0.5 },
  textButton: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  textButtonLabel: { fontSize: 15, fontWeight: '600', color: Brand.amberInk },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40, gap: 12 },
  group: { gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', color: Brand.muted, marginTop: 8 },
  doc: { padding: 14, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: '#EDEAE3' },
  docMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docName: { fontSize: 16, fontWeight: '600', color: Brand.ink },
  docMeta: { fontSize: 13, color: Brand.muted, marginTop: 2 },
  docActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  small: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paper,
  },
  smallLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  viewer: { flex: 1, backgroundColor: '#000000' },
  viewerBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, paddingRight: 8, minHeight: 56 },
  viewerTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  viewerClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: Brand.ink, marginTop: 8 },
  categories: { gap: 8 },
  category: { padding: 12, borderRadius: 12, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised, gap: 2 },
  categoryOn: { borderColor: Brand.amber, backgroundColor: '#FBF4E8' },
  categoryLabel: { fontSize: 16, fontWeight: '700', color: Brand.ink },
  categoryLabelOn: { color: '#7A4508' },
  categoryExamples: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  sources: { flexDirection: 'row', gap: 10 },
  source: { flex: 1, minHeight: 80, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1.5, borderColor: Brand.line, backgroundColor: Brand.paperRaised },
  sourceLabel: { fontSize: 14, fontWeight: '600', color: Brand.ink },
  uploading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
});
