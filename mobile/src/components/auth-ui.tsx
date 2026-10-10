// Shared building blocks for the dark sign-in screens (email, code, 2FA).
import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Brand } from '@/constants/brand';

export function AuthScreen({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.wordmark} accessibilityRole="header">
            Road<Text style={styles.wordmarkAccent}>Verdict</Text>
          </Text>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.body}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [styles.primary, inactive && styles.primaryDisabled, pressed && !inactive && styles.primaryPressed]}>
      {busy ? <ActivityIndicator color={Brand.asphalt} /> : <Text style={styles.primaryLabel}>{label}</Text>}
    </Pressable>
  );
}

// Google's light sign-in button (white, grey border, the four-colour G), as
// its branding rules ask.
export function GoogleButton({ onPress, busy, disabled }: { onPress: () => void; busy?: boolean; disabled?: boolean }) {
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      style={({ pressed }) => [styles.google, inactive && styles.primaryDisabled, pressed && !inactive && styles.googlePressed]}>
      {busy ? (
        <ActivityIndicator color="#1F1F1F" />
      ) : (
        <>
          <Svg width={20} height={20} viewBox="0 0 48 48">
            <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </Svg>
          <Text style={styles.googleLabel}>Continue with Google</Text>
        </>
      )}
    </Pressable>
  );
}

export function TextButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={8}
      style={styles.textButton}>
      <Text style={[styles.textButtonLabel, disabled && styles.textButtonDisabled]}>{label}</Text>
    </Pressable>
  );
}

export function ErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}

export const authInputStyle = {
  height: 56,
  borderRadius: 12,
  borderWidth: 1.5,
  borderColor: Brand.asphaltLine,
  backgroundColor: Brand.asphaltRaised,
  color: '#FFFFFF',
  fontSize: 18,
  paddingHorizontal: 16,
} as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Brand.asphalt },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 },
  wordmark: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: 0.5, marginBottom: 56 },
  wordmarkAccent: { color: Brand.amber },
  title: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', marginBottom: 10 },
  subtitle: { color: Brand.mutedOnDark, fontSize: 16, lineHeight: 24 },
  body: { marginTop: 32, gap: 16 },
  primary: {
    height: 56,
    borderRadius: 12,
    backgroundColor: Brand.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryPressed: { opacity: 0.85 },
  primaryDisabled: { opacity: 0.5 },
  primaryLabel: { color: Brand.asphalt, fontSize: 17, fontWeight: '700' },
  google: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#747775',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  googlePressed: { backgroundColor: '#F2F2F2' },
  googleLabel: { color: '#1F1F1F', fontSize: 17, fontWeight: '600' },
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  textButtonLabel: { color: Brand.amber, fontSize: 16, fontWeight: '600' },
  textButtonDisabled: { color: Brand.mutedOnDark },
  error: { color: Brand.dangerOnDark, fontSize: 15, lineHeight: 22 },
});
