import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthScreen, ErrorMessage, PrimaryButton, TextButton, authInputStyle } from '@/components/auth-ui';
import { CodeInput } from '@/components/code-input';
import { Icon } from '@/components/icon';
import { Brand } from '@/constants/brand';
import { apiFetch, emailFromToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isThisPhoneTrusted, signInWithThisPhone } from '@/lib/trusted-device';

export default function TwoFactorScreen() {
  const { pendingToken } = useLocalSearchParams<{ pendingToken: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [useBackup, setUseBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  // A phone this account trusts confirms the sign-in with its fingerprint,
  // face or PIN instead (see trusted-device.ts); the code stays one tap away.
  const [phoneTrusted, setPhoneTrusted] = useState(false);
  const [useCode, setUseCode] = useState(false);

  async function confirmWithPhone() {
    if (busy || !pendingToken) return;
    setBusy(true);
    setError(null);
    const result = await signInWithThisPhone(pendingToken);
    if (result.ok) {
      await signIn(result.token);
      return;
    }
    setBusy(false);
    if (result.reason === 'not-trusted') setPhoneTrusted(false);
    if (result.reason !== 'cancelled' && result.error) setError(result.error);
    if (result.status === 401 && result.reason === 'error') setExpired(true);
    setUseCode(true);
  }

  useEffect(() => {
    if (!pendingToken) return;
    let cancelled = false;
    isThisPhoneTrusted(emailFromToken(pendingToken)).then((yes) => {
      if (cancelled || !yes) return;
      setPhoneTrusted(true);
      confirmWithPhone();
    });
    return () => {
      cancelled = true;
    };
    // Once, on arriving here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingToken]);

  async function verify(value: string) {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch<{ token: string }>('/api/auth/app/verify-2fa', {
      method: 'POST',
      body: { pendingToken, code: value.trim() },
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      setCode('');
      // The pending sign-in only lives for 5 minutes - after that, no
      // code can work and the only way on is to start again.
      if (result.status === 401 && result.error !== 'Incorrect code.') setExpired(true);
      return;
    }
    await signIn(result.data.token);
  }

  if (phoneTrusted && !useCode && !expired) {
    return (
      <AuthScreen title="One more step" subtitle="This phone is trusted - confirm it’s you with your fingerprint, face or phone PIN.">
        <View style={styles.done} accessibilityRole="text">
          <Icon name="check" size={18} color={Brand.amber} strokeWidth={2.6} />
          <Text style={styles.doneText}>Email code accepted</Text>
        </View>
        <ErrorMessage message={error} />
        <PrimaryButton label="Confirm it’s me" onPress={confirmWithPhone} busy={busy} />
        <TextButton label="Use a code instead" onPress={() => setUseCode(true)} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="One more step"
      subtitle={
        useBackup
          ? 'Enter one of the backup codes you saved when you turned on two-step sign-in. Each works once.'
          : 'Your account has two-step sign-in on. Open your authenticator app (such as Google Authenticator) and enter the 6-digit code it shows for RoadVerdict - not the code from your email.'
      }>
      <View style={styles.done} accessibilityRole="text">
        <Icon name="check" size={18} color={Brand.amber} strokeWidth={2.6} />
        <Text style={styles.doneText}>Email code accepted</Text>
      </View>
      {useBackup ? (
        <View style={styles.field}>
          <Text style={styles.label} nativeID="backup-label">
            Backup code
          </Text>
          <TextInput
            accessibilityLabelledBy="backup-label"
            value={backupCode}
            onChangeText={setBackupCode}
            onSubmitEditing={() => verify(backupCode)}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="done"
            style={authInputStyle}
          />
        </View>
      ) : (
        <CodeInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error) setError(null);
          }}
          onComplete={verify}
          hasError={!!error}
          accessibilityLabel="6-digit code from your authenticator app"
        />
      )}
      <ErrorMessage message={error} />
      {expired ? (
        <PrimaryButton label="Start again" onPress={() => router.replace('/sign-in')} />
      ) : (
        <PrimaryButton
          label="Sign in"
          onPress={() => verify(useBackup ? backupCode : code)}
          busy={busy}
          disabled={useBackup ? !backupCode.trim() : code.length !== 6}
        />
      )}
      <TextButton
        label={useBackup ? 'Use my authenticator app instead' : "I can't use my authenticator app"}
        onPress={() => {
          setUseBackup((b) => !b);
          setError(null);
        }}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  done: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doneText: { color: Brand.mutedOnDark, fontSize: 15, fontWeight: '600' },
});
