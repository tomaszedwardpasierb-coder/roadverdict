import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AuthScreen, ErrorMessage, PrimaryButton, authInputStyle } from '@/components/auth-ui';
import { Brand } from '@/constants/brand';
import { apiFetch } from '@/lib/api';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = email.trim();
  const looksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

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

  return (
    <AuthScreen title="Sign in" subtitle="Enter your email and we'll send you a 6-digit code. No password needed.">
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
      <PrimaryButton label="Send code" onPress={sendCode} busy={busy} disabled={!looksValid} />
      <Text style={styles.note}>New to RoadVerdict? The same code creates your account.</Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  label: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  note: { color: Brand.mutedOnDark, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
});
