import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { AuthScreen, ErrorMessage, PrimaryButton, TextButton } from '@/components/auth-ui';
import { CodeInput } from '@/components/code-input';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// Matches the server's one-code-a-minute limit, so the button is never
// offered when the server would only refuse it.
const RESEND_AFTER_SECONDS = 60;

type VerifyResponse = { token: string; expiresInSeconds: number } | { twoFactorRequired: true; pendingToken: string };

export default function CodeScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(RESEND_AFTER_SECONDS);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function verify(value: string) {
    if (value.length !== 6 || busy || !email) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await apiFetch<VerifyResponse>('/api/auth/app/verify-code', { method: 'POST', body: { email, code: value } });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      setCode('');
      return;
    }
    if ('twoFactorRequired' in result.data) {
      setBusy(false);
      router.replace({ pathname: '/two-factor', params: { pendingToken: result.data.pendingToken } });
      return;
    }
    // Signing in flips the route guards in the root layout, which takes
    // the app to Home on its own.
    await signIn(result.data.token);
  }

  async function resend() {
    if (!email) return;
    setError(null);
    setNotice(null);
    setResendIn(RESEND_AFTER_SECONDS);
    const result = await apiFetch('/api/auth/app/request-code', { method: 'POST', body: { email } });
    if (result.ok) {
      setCode('');
      setNotice('New code sent. Any earlier code no longer works.');
    } else {
      setError(result.error);
    }
  }

  return (
    <AuthScreen
      title="Check your email"
      subtitle={
        <>
          We sent a 6-digit code to <Text style={styles.email}>{email}</Text>. It expires in 10 minutes.
        </>
      }>
      <CodeInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (error) setError(null);
        }}
        onComplete={verify}
        hasError={!!error}
        accessibilityLabel="6-digit code from your email"
      />
      <ErrorMessage message={error} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <PrimaryButton label="Sign in" onPress={() => verify(code)} busy={busy} disabled={code.length !== 6} />
      <TextButton label={resendIn > 0 ? `Send a new code in ${resendIn}s` : 'Send a new code'} onPress={resend} disabled={resendIn > 0} />
      <TextButton label="Use a different email" onPress={() => router.back()} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  email: { color: '#FFFFFF', fontWeight: '600' },
  notice: { color: Brand.mutedOnDark, fontSize: 15, lineHeight: 22 },
});
