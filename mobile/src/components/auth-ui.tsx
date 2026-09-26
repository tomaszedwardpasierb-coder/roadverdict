// Shared building blocks for the dark sign-in screens (email, code, 2FA).
import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  textButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  textButtonLabel: { color: Brand.amber, fontSize: 16, fontWeight: '600' },
  textButtonDisabled: { color: Brand.mutedOnDark },
  error: { color: Brand.dangerOnDark, fontSize: 15, lineHeight: 22 },
});
