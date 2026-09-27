// Two-factor sign-in, through the website's own routes (/api/auth/totp/*)
// in the steps the web's TwoFactorSettings takes: start, add the key to an
// authenticator app, confirm with its first code, then save the backup
// codes. On a phone there's no second screen to scan a QR code from, so
// the key goes over by link - or by hand, when no app picks the link up.
import { useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '@/components/screen';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type Phase =
  | { name: 'idle' }
  | { name: 'setup'; key: string; link: string | null }
  | { name: 'codes'; codes: string[] }
  | { name: 'turning-off' };

// "JBSWY3DPEHPK3PXP" as "JBSW Y3DP EHPK 3PXP" - easier to type across.
function grouped(key: string): string {
  return key.replace(/(.{4})/g, '$1 ').trim();
}

export function TwoFactorSection({ enabled, onChanged }: { enabled: boolean; onChanged: () => void }) {
  const { token, signOut } = useAuth();
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function post<T>(path: string, body?: unknown): Promise<T | null> {
    setBusy(true);
    setProblem(null);
    const result = await apiFetch<T>(path, { method: 'POST', token, body });
    setBusy(false);
    if (result.ok) return result.data;
    if (result.status === 401) await signOut();
    else setProblem(result.error);
    return null;
  }

  async function start() {
    const data = await post<{ manualEntryKey: string; otpauthUri?: string }>('/api/auth/totp/enroll/start');
    if (!data) return;
    setCode('');
    setPhase({ name: 'setup', key: data.manualEntryKey, link: data.otpauthUri ?? null });
  }

  async function openAuthenticator(link: string) {
    try {
      await Linking.openURL(link);
    } catch {
      setProblem('No authenticator app picked that up. Enter the key below in it by hand instead.');
    }
  }

  async function confirm() {
    const data = await post<{ backupCodes: string[] }>('/api/auth/totp/enroll/confirm', { code: code.trim() });
    if (!data) return;
    setPhase({ name: 'codes', codes: data.backupCodes });
    onChanged();
  }

  async function turnOff() {
    const data = await post<{ ok: boolean }>('/api/auth/totp/disable', { code: code.trim() });
    if (!data) return;
    setCode('');
    setPhase({ name: 'idle' });
    onChanged();
  }

  function cancel() {
    setCode('');
    setProblem(null);
    setPhase({ name: 'idle' });
  }

  const problemText = problem ? (
    <Text style={styles.problem} accessibilityRole="alert">
      {problem}
    </Text>
  ) : null;

  if (phase.name === 'setup') {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>Set up two-factor sign-in</Text>
        <Text style={styles.step}>1. Add RoadVerdict to your authenticator app</Text>
        {phase.link ? (
          <Pressable onPress={() => openAuthenticator(phase.link!)} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryLabel}>Open my authenticator app</Text>
          </Pressable>
        ) : null}
        <Text style={styles.hint}>Or type this key into it:</Text>
        <Text selectable style={styles.key} accessibilityLabel={`Setup key ${phase.key.split('').join(' ')}`}>
          {grouped(phase.key)}
        </Text>
        <Text style={styles.step}>2. Enter the 6-digit code it shows</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="123456"
          placeholderTextColor="#A7A49C"
          accessibilityLabel="6-digit code from your authenticator app"
          style={styles.input}
        />
        {problemText}
        <View style={styles.row}>
          <Pressable onPress={cancel} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={confirm}
            disabled={busy || code.length !== 6}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || code.length !== 6, busy }}
            style={({ pressed }) => [styles.primary, styles.flex, (busy || code.length !== 6) && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.primaryLabel}>{busy ? 'Checking…' : 'Turn it on'}</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  if (phase.name === 'codes') {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>Save your backup codes</Text>
        <Text style={styles.text}>
          If you ever lose your phone, each of these gets you in once instead of a code. Keep them somewhere safe - they won&apos;t be shown
          again.
        </Text>
        <Text selectable style={styles.codes}>
          {phase.codes.join('\n')}
        </Text>
        <Pressable
          onPress={() => Share.share({ message: `RoadVerdict backup codes:\n${phase.codes.join('\n')}` })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryLabel}>Save or share them</Text>
        </Pressable>
        <Pressable onPress={() => setPhase({ name: 'idle' })} accessibilityRole="button" style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryLabel}>I&apos;ve saved them</Text>
        </Pressable>
      </Card>
    );
  }

  if (phase.name === 'turning-off') {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>Turn off two-factor sign-in</Text>
        <Text style={styles.text}>Enter your current code, or one of your backup codes, to confirm.</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Code"
          placeholderTextColor="#A7A49C"
          accessibilityLabel="Current code or backup code"
          style={styles.input}
        />
        {problemText}
        <View style={styles.row}>
          <Pressable onPress={cancel} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryLabel}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={turnOff}
            disabled={busy || !code.trim()}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !code.trim(), busy }}
            style={({ pressed }) => [styles.danger, styles.flex, (busy || !code.trim()) && styles.disabled, pressed && styles.pressed]}>
            <Text style={styles.dangerLabel}>{busy ? 'Checking…' : 'Turn it off'}</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.statusRow}>
        <Text style={[styles.title, styles.flex]}>Two-factor sign-in</Text>
        <View style={[styles.pill, enabled ? styles.pillOn : styles.pillOff]}>
          <Text style={[styles.pillText, enabled ? styles.pillTextOn : styles.pillTextOff]}>{enabled ? 'On' : 'Off'}</Text>
        </View>
      </View>
      <Text style={styles.text}>
        {enabled
          ? 'Signing in asks for a code from your authenticator app as well as the one we email you.'
          : 'Add a code from an authenticator app to signing in, so your email alone isn’t enough to get into your account.'}
      </Text>
      {problemText}
      <Pressable
        onPress={enabled ? () => setPhase({ name: 'turning-off' }) : start}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ busy }}
        style={({ pressed }) => [enabled ? styles.secondary : styles.primary, pressed && styles.pressed]}>
        <Text style={enabled ? styles.secondaryLabel : styles.primaryLabel}>{busy ? 'One moment…' : enabled ? 'Turn it off' : 'Turn it on'}</Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 17, fontWeight: '700', color: Brand.ink },
  step: { fontSize: 15, fontWeight: '700', color: Brand.ink, marginTop: 4 },
  text: { fontSize: 15, lineHeight: 22, color: Brand.ink },
  hint: { fontSize: 13, lineHeight: 18, color: Brand.muted },
  key: { fontSize: 20, fontWeight: '700', letterSpacing: 1, color: Brand.ink, fontFamily: 'monospace' },
  codes: { fontSize: 17, lineHeight: 28, color: Brand.ink, fontFamily: 'monospace' },
  input: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    paddingHorizontal: 14,
    fontSize: 20,
    letterSpacing: 2,
    color: Brand.ink,
  },
  problem: { fontSize: 15, lineHeight: 22, color: Brand.danger },
  primary: { minHeight: 52, paddingHorizontal: 18, borderRadius: 12, backgroundColor: Brand.amber, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: Brand.asphalt },
  secondary: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Brand.line,
    backgroundColor: Brand.paperRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { fontSize: 16, fontWeight: '700', color: Brand.ink },
  danger: { minHeight: 52, paddingHorizontal: 18, borderRadius: 12, backgroundColor: Brand.danger, alignItems: 'center', justifyContent: 'center' },
  dangerLabel: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillOn: { backgroundColor: '#DEEFE6' },
  pillOff: { backgroundColor: '#EDEAE3' },
  pillText: { fontSize: 12, fontWeight: '700' },
  pillTextOn: { color: '#1A6B4A' },
  pillTextOff: { color: '#3A3C42' },
});
