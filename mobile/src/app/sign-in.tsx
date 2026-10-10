import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthScreen, ErrorMessage, GoogleButton, PrimaryButton, authInputStyle } from '@/components/auth-ui';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { googleIdToken, googleWebClientId } from '@/lib/google-sign-in';
import { versionLabel } from '@/lib/version';

type VerifyResponse = { token: string; expiresInSeconds: number } | { twoFactorRequired: true; pendingToken: string };

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = email.trim();
  const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

  // The Google button appears only on builds that have it and once the
  // server has it switched on.
  useEffect(() => {
    let cancelled = false;
    googleWebClientId().then((id) => {
      if (!cancelled) setGoogleClientId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function sendCode() {
    if (!looksValid || busy) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch('/api/auth/app/request-code', { method: 'POST', body: { email: trimmed } });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push({ pathname: '/code', params: { email: trimmed.toLowerCase() } });
  }

  async function continueWithGoogle() {
    if (!googleClientId || googleBusy) return;
    setGoogleBusy(true);
    setError(null);
    const google = await googleIdToken(googleClientId);
    if (google.kind !== 'token') {
      setGoogleBusy(false);
      if (google.kind === 'error') setError(google.message);
      return;
    }
    const result = await apiFetch<VerifyResponse>('/api/auth/app/google', { method: 'POST', body: { idToken: google.idToken } });
    if (!result.ok) {
      setGoogleBusy(false);
      setError(result.error);
      return;
    }
    if ('twoFactorRequired' in result.data) {
      setGoogleBusy(false);
      router.push({ pathname: '/two-factor', params: { pendingToken: result.data.pendingToken } });
      return;
    }
    // Signing in flips the route guards in the root layout, which takes
    // the app to Home on its own.
    await signIn(result.data.token);
  }

  return (
    <AuthScreen
      title="Sign in"
      subtitle={googleClientId ? 'Use your Google account, or your email and a 6-digit code. No password needed.' : "Enter your email and we'll send you a 6-digit code. No password needed."}>
      {googleClientId ? (
        <>
          <GoogleButton onPress={continueWithGoogle} busy={googleBusy} disabled={busy} />
          <Text style={styles.divider}>or use your email</Text>
        </>
      ) : null}
      <View style={styles.field}>
        <Text style={styles.label} nativeID="email-label">
          Email
        </Text>
        <TextInput
          accessibilityLabelledBy="email-label"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={sendCode}
          placeholder="you@example.com"
          placeholderTextColor={Brand.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="send"
          style={authInputStyle}
        />
      </View>
      <ErrorMessage message={error} />
      <PrimaryButton label="Send code" onPress={sendCode} busy={busy} disabled={!looksValid || googleBusy} />
      <Text style={styles.note}>
        {googleClientId ? 'New to RoadVerdict? Either way creates your account.' : 'New to RoadVerdict? The same code creates your account.'}
      </Text>
      <Text style={styles.version}>{versionLabel()}</Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  divider: { color: Brand.mutedOnDark, fontSize: 14, textAlign: 'center' },
  note: { color: Brand.mutedOnDark, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  version: { color: Brand.mutedOnDark, fontSize: 12, textAlign: 'center', marginTop: 24, opacity: 0.8 },
});
